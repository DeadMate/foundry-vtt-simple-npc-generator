/**
 * Species/race handling for NPC Button module
 * @module species
 */

import { COMPENDIUMS } from "./constants.js";
import { DATA_CACHE } from "./data-loader.js";
import { pickRandom, normalizeUuid, cloneData, toItemData, escapeHtml } from "./utils.js";

/** Promise for ongoing species load - prevents race condition */
let SPECIES_LOAD_PROMISE = null;
const ACTOR_SIZE_ALIASES = {
  tiny: "tiny",
  sm: "sm",
  small: "sm",
  med: "med",
  medium: "med",
  lg: "lg",
  large: "lg",
  huge: "huge",
  grg: "grg",
  gargantuan: "grg"
};

/**
 * Get available species packs
 * @returns {string[]} Array of pack collection names
 */
export function getSpeciesPacks() {
  const preferred = DATA_CACHE.compendiumLists?.species?.length
    ? DATA_CACHE.compendiumLists.species
    : COMPENDIUMS.species;
  const available = [];
  for (const name of preferred) {
    if (game.packs?.get(name)) available.push(name);
  }
  if (available.length) return available;

  // Fallback: scan all packs for species/race content
  const scanned = new Set();
  for (const pack of game.packs || []) {
    if (pack.documentName !== "Item") continue;
    const systemId = pack.metadata?.system;
    if (systemId && systemId !== "dnd5e") continue;
    const label = String(pack.metadata?.label || "").toLowerCase();
    const collection = String(pack.collection || "").toLowerCase();
    if (label.includes("species") || label.includes("race") || collection.includes("species") || collection.includes("race")) {
      scanned.add(pack.collection);
    }
  }
  return Array.from(scanned);
}

/**
 * Get all species entries from packs
 * FIX: Uses promise-based locking to prevent race condition
 * @returns {Promise<Array>} Array of species entries
 */
export async function getSpeciesEntries() {
  // Return cached entries if available
  if (DATA_CACHE.speciesEntries?.length) return DATA_CACHE.speciesEntries;

  // FIX: Use promise-based locking to prevent race condition
  if (SPECIES_LOAD_PROMISE) return SPECIES_LOAD_PROMISE;

  SPECIES_LOAD_PROMISE = (async () => {
    const entries = [];
    let packNames = getSpeciesPacks();

    if (!packNames.length) {
      // Fallback: scan all Item packs and keep those containing race/species entries
      for (const pack of game.packs || []) {
        if (pack.documentName !== "Item") continue;
        const systemId = pack.metadata?.system;
        if (systemId && systemId !== "dnd5e") continue;
        try {
          const index = await pack.getIndex({ fields: ["type", "name"] });
          if (index.some((e) => ["race", "species"].includes(String(e.type || "").toLowerCase()))) {
            packNames.push(pack.collection);
          }
        } catch {
          // ignore
        }
      }
      packNames = Array.from(new Set(packNames));
    }

    for (const packName of packNames) {
      const pack = game.packs?.get(packName);
      if (!pack) continue;
      const index = await pack.getIndex({ fields: ["type", "name"] });
      const label = String(pack.metadata?.label || "").toLowerCase();
      const collection = String(pack.collection || "").toLowerCase();
      const isRacePack =
        label.includes("race") ||
        label.includes("species") ||
        collection.includes("race") ||
        collection.includes("species");
      for (const entry of index) {
        if (!entry?.name) continue;
        const type = String(entry.type || "").toLowerCase();
        if (!isRacePack && type && type !== "race" && type !== "species") continue;
        entries.push({
          key: `${pack.collection}|${entry._id}`,
          pack: pack.collection,
          _id: entry._id,
          name: entry.name
        });
      }
    }

    DATA_CACHE.speciesEntries = entries.sort((a, b) => a.name.localeCompare(b.name));
    return DATA_CACHE.speciesEntries;
  })();

  SPECIES_LOAD_PROMISE = SPECIES_LOAD_PROMISE.catch((err) => {
    SPECIES_LOAD_PROMISE = null;
    throw err;
  });

  return SPECIES_LOAD_PROMISE;
}

/**
 * Get species options as HTML option elements
 * @returns {Promise<string>} HTML string of options
 */
export async function getSpeciesOptions() {
  const entries = await getSpeciesEntries();
  return entries
    .map((e) => `<option value="${escapeHtml(e.key)}">${escapeHtml(e.name)}</option>`)
    .join("");
}

/**
 * Build a species item from an entry
 * @param {Object} speciesEntry - Species entry with pack and _id
 * @returns {Promise<Object|null>} Item data or null
 */
export async function buildSpeciesItem(speciesEntry) {
  if (!speciesEntry) return null;
  const pack = game.packs?.get(speciesEntry.pack);
  if (!pack) return null;
  const doc = await pack.getDocument(speciesEntry._id);
  if (!doc) return null;
  const data = cloneData(toItemData(doc));
  const uuid = doc.uuid || `${pack.collection}.${doc.id}`;
  data.flags = data.flags || {};
  data.flags.core = data.flags.core || {};
  if (!data.flags.core.sourceId) data.flags.core.sourceId = uuid;
  data.flags.dnd5e = data.flags.dnd5e || {};
  if (!data.flags.dnd5e.sourceId) data.flags.dnd5e.sourceId = uuid;
  return data;
}

/**
 * Apply species traits to an actor
 * @param {Object} actor - Foundry Actor
 * @param {Object} speciesItem - Species item document
 */
export async function applySpeciesTraitsToActor(actor, speciesItem) {
  if (!actor || !speciesItem) return;
  const update = {};

  const traits = speciesItem.system?.traits || {};
  const sensesFromItem = extractSensesFromSpeciesItem(speciesItem);
  const languagesFromItem = extractLanguagesFromSpeciesItem(speciesItem);
  const sizeFromItem = normalizeActorSizeValue(
    traits?.size?.value ??
    traits?.size ??
    speciesItem.system?.size ??
    speciesItem.system?.details?.size ??
    null
  );
  const movementFromItem = extractMovementFromSpeciesItem(speciesItem);

  if (Object.keys(sensesFromItem).length) {
    const current = actor.system?.attributes?.senses || {};
    update["system.attributes.senses"] = { ...current, ...sensesFromItem };
  }

  if (Object.keys(movementFromItem).length) {
    const current = actor.system?.attributes?.movement || {};
    const units = current.units && String(current.units).trim() ? current.units : "ft";
    update["system.attributes.movement"] = { ...current, ...movementFromItem, units };
  }

  if (languagesFromItem.length) {
    const current = actor.system?.traits?.languages?.value || [];
    const merged = Array.from(new Set([...current, ...languagesFromItem]));
    update["system.traits.languages.value"] = merged;
  }

  if (sizeFromItem) {
    update["system.traits.size"] = sizeFromItem;
  }

  if (Object.keys(update).length) {
    await actor.update(update);
  }
}

/**
 * Extract senses from species item
 * @param {Object} speciesItem - Species item
 * @returns {Object} Senses object
 */
export function extractSensesFromSpeciesItem(speciesItem) {
  const out = {};
  const traits = speciesItem.system?.traits || {};
  const sensesValue = traits.senses?.value || speciesItem.system?.senses || null;

  if (Array.isArray(sensesValue)) {
    for (const entry of sensesValue) {
      const parsed = parseSenseEntry(entry);
      if (parsed) out[parsed.type] = parsed.range;
    }
  } else if (typeof sensesValue === "string") {
    const parts = sensesValue.split(/[,;]+/).map((p) => p.trim());
    for (const part of parts) {
      const parsed = parseSenseEntry(part);
      if (parsed) out[parsed.type] = parsed.range;
    }
  } else if (sensesValue && typeof sensesValue === "object") {
    for (const [key, value] of Object.entries(sensesValue)) {
      if (typeof value === "number") out[key] = value;
    }
  }

  return out;
}

/**
 * Extract movement from species item
 * @param {Object} speciesItem - Species item
 * @returns {Object} Movement object
 */
export function extractMovementFromSpeciesItem(speciesItem) {
  const out = {};
  const move = speciesItem.system?.movement || null;
  if (move && typeof move === "object") {
    for (const [key, value] of Object.entries(move)) {
      if (key === "units" || key === "hover" || key === "ignoredDifficultTerrain") continue;
      const num = Number(value);
      if (Number.isFinite(num) && num >= 0) out[key] = num;
    }
  }
  return out;
}

/**
 * Parse a sense entry string
 * @param {string} entry - Sense entry like "darkvision 60"
 * @returns {{type: string, range: number}|null}
 */
export function parseSenseEntry(entry) {
  if (!entry) return null;
  const str = String(entry).toLowerCase();
  // FIX: Proper regex escaping (was using \\ instead of single \)
  const match = str.match(/(darkvision|blindsight|tremorsense|truesight)\s*(\d+)?/);
  if (!match) return null;
  const type = match[1];
  const range = match[2] ? Number(match[2]) : 60;
  return { type, range };
}

/**
 * Extract languages from species item
 * @param {Object} speciesItem - Species item
 * @returns {string[]} Array of language strings
 */
export function extractLanguagesFromSpeciesItem(speciesItem) {
  const traits = speciesItem.system?.traits || {};
  const value = traits.languages?.value || traits.languages || [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,;]+/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Apply species advancements to actor
 * @param {Object} actor - Foundry Actor
 * @param {Object} speciesItem - Species item document
 */
export async function applySpeciesAdvancements(actor, speciesItem) {
  const advancements = speciesItem.system?.advancement;
  if (!Array.isArray(advancements) || !advancements.length) return;

  const update = {};

  for (const adv of advancements) {
    const advData = typeof adv?.toObject === "function" ? adv.toObject() : adv;
    const type = String(advData?.type || adv?.type || "").toLowerCase();

    if (type.includes("itemgrant")) {
      const uuids = collectAdvancementItemUuids(advData || adv);
      await grantItemsByUuid(actor, uuids);
      continue;
    }

    if (type.includes("itemchoice")) {
      const uuids = collectAdvancementItemUuids(advData || adv);
      if (uuids.length) {
        await grantItemsByUuid(actor, [pickRandom(uuids)]);
      }
      continue;
    }

    if (type.includes("size")) {
      const size = normalizeActorSizeValue(
        advData?.configuration?.size ?? advData?.size ?? advData?.value ?? null
      );
      if (size) update["system.traits.size"] = size;
      continue;
    }

    if (type.includes("trait")) {
      const languages = extractTraitAdvancementValues(advData || adv, "languages");
      if (languages.length) {
        const current = actor.system?.traits?.languages?.value || [];
        const merged = Array.from(new Set([...current, ...languages]));
        update["system.traits.languages.value"] = merged;
      }
      continue;
    }
  }

  if (Object.keys(update).length) {
    await actor.update(update);
  }
}

/**
 * Normalize species/advancement size to a valid dnd5e actor size key
 * @param {*} value - Raw size value
 * @returns {string|null}
 */
export function normalizeActorSizeValue(value) {
  const knownSizes = new Set(Object.keys(globalThis.CONFIG?.DND5E?.actorSizes || {}));
  const pickSize = (raw) => {
    if (raw === null || raw === undefined) return null;
    const key = String(raw).trim().toLowerCase();
    if (!key) return null;
    if (knownSizes.size && knownSizes.has(key)) return key;
    const mapped = ACTOR_SIZE_ALIASES[key];
    if (!mapped) return null;
    if (!knownSizes.size || knownSizes.has(mapped)) return mapped;
    return null;
  };

  if (Array.isArray(value)) {
    for (const part of value) {
      const normalized = pickSize(part);
      if (normalized) return normalized;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const preferred = [value.value, value.size, value.key, value.id];
    for (const part of preferred) {
      const normalized =
        pickSize(part) ||
        ((part && typeof part === "object") ? normalizeActorSizeValue(part) : null);
      if (normalized) return normalized;
    }
    for (const part of Object.values(value)) {
      const normalized =
        pickSize(part) ||
        ((part && typeof part === "object") ? normalizeActorSizeValue(part) : null);
      if (normalized) return normalized;
    }
    return null;
  }

  return pickSize(value);
}

/**
 * Collect item UUIDs from advancement data
 * @param {Object} adv - Advancement data
 * @returns {string[]} Array of UUIDs
 */
export function collectAdvancementItemUuids(adv) {
  const uuids = new Set();
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      if (typeof node.uuid === "string" && node.uuid.includes(".")) {
        uuids.add(node.uuid);
      }
      for (const value of Object.values(node)) {
        walk(value);
      }
      return;
    }
    if (typeof node === "string" && node.includes(".")) {
      uuids.add(node);
    }
  };

  walk(adv);
  return Array.from(uuids);
}

/**
 * Extract trait values from advancement
 * @param {Object} adv - Advancement data
 * @param {string} key - Trait key to extract
 * @returns {string[]}
 */
export function extractTraitAdvancementValues(adv, key) {
  const out = [];
  const values = adv?.configuration?.traits || adv?.traits || adv?.configuration?.value || adv?.value;
  if (Array.isArray(values)) {
    for (const val of values) {
      const str = String(val);
      if (str) out.push(str);
    }
  } else if (values && typeof values === "object") {
    const list = values[key]?.value || values[key] || [];
    if (Array.isArray(list)) {
      list.forEach((v) => out.push(String(v)));
    }
  }
  return out.filter(Boolean);
}

/**
 * Grant items to actor by UUID
 * @param {Object} actor - Foundry Actor
 * @param {string[]} uuids - Array of item UUIDs
 */
export async function grantItemsByUuid(actor, uuids) {
  if (!actor || !uuids?.length) return;
  const items = [];
  for (const uuid of uuids) {
    try {
      const normalized = normalizeUuid(uuid);
      const doc = await fromUuid(normalized);
      if (doc) items.push(doc.toObject());
    } catch {
      // ignore
    }
  }
  if (items.length) {
    await actor.createEmbeddedDocuments("Item", items);
  }
}

/**
 * Reset the species load promise (for testing or forced reload)
 */
export function resetSpeciesLoadPromise() {
  SPECIES_LOAD_PROMISE = null;
  DATA_CACHE.speciesEntries = null;
}
