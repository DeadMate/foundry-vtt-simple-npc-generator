/**
 * Compendium cache management for NPC Button module
 * @module cache
 */

import {
  MODULE_ID,
  COMPENDIUM_CACHE_FILE,
  USE_COMPENDIUM_CACHE,
  COMPENDIUMS,
  CACHE_DOC_TYPES
} from "./constants.js";
import { DATA_CACHE } from "./data-loader.js";
import { t, tf } from "./i18n.js";
import { pickRandom, getSearchStrings, getItemPriceValue, pickByBudget } from "./utils.js";

/** Set of pack names that have been warned about missing cache */
const cacheWarnings = new Set();
const CACHE_BUILD_MAX_CONCURRENCY = 4;
const CACHE_LOOKUP_INDEX = {
  source: null,
  docsByPack: new Map(),
  searchableByPack: new Map(),
  nameMapByPack: new Map()
};

function ensureLookupIndexState() {
  const source = DATA_CACHE.compendiumCache?.packs || null;
  if (CACHE_LOOKUP_INDEX.source === source) return source;
  CACHE_LOOKUP_INDEX.source = source;
  CACHE_LOOKUP_INDEX.docsByPack.clear();
  CACHE_LOOKUP_INDEX.searchableByPack.clear();
  CACHE_LOOKUP_INDEX.nameMapByPack.clear();
  return source;
}

function getPackCachedDocs(packName) {
  ensureLookupIndexState();
  if (CACHE_LOOKUP_INDEX.docsByPack.has(packName)) {
    return CACHE_LOOKUP_INDEX.docsByPack.get(packName);
  }
  const docs = Object.values(DATA_CACHE.compendiumCache?.packs?.[packName]?.documents || {});
  CACHE_LOOKUP_INDEX.docsByPack.set(packName, docs);
  return docs;
}

function getPackSearchableEntries(packName) {
  ensureLookupIndexState();
  if (CACHE_LOOKUP_INDEX.searchableByPack.has(packName)) {
    return CACHE_LOOKUP_INDEX.searchableByPack.get(packName);
  }
  const docs = getPackCachedDocs(packName);
  const entries = docs.map((doc) => ({ doc, search: getSearchStrings(doc) }));
  CACHE_LOOKUP_INDEX.searchableByPack.set(packName, entries);
  return entries;
}

function getPackNameMap(packName) {
  ensureLookupIndexState();
  if (CACHE_LOOKUP_INDEX.nameMapByPack.has(packName)) {
    return CACHE_LOOKUP_INDEX.nameMapByPack.get(packName);
  }
  const map = new Map();
  for (const entry of getPackSearchableEntries(packName)) {
    for (const token of entry.search || []) {
      if (!token || map.has(token)) continue;
      map.set(token, entry.doc);
    }
  }
  CACHE_LOOKUP_INDEX.nameMapByPack.set(packName, map);
  return map;
}

function getDocsAndMatchesByKeywords(packs, keywords, predicate) {
  const docs = [];
  const matches = [];
  const normalized = (keywords || []).map((k) => String(k || "").toLowerCase().trim()).filter(Boolean);

  for (const packName of packs || []) {
    for (const entry of getPackSearchableEntries(packName)) {
      const doc = entry.doc;
      if (!doc) continue;
      if (predicate && !predicate(doc)) continue;
      docs.push(doc);
      if (!normalized.length) continue;
      if (normalized.some((key) => (entry.search || []).some((token) => token.includes(key)))) {
        matches.push(doc);
      }
    }
  }

  return { docs, matches };
}

/**
 * Warn once about a missing cache for a pack
 * Only logs to console in development mode for debugging
 * @param {string} packName - Name of the pack
 */
export function warnMissingCacheOnce(packName) {
  if (cacheWarnings.has(packName)) return;
  cacheWarnings.add(packName);
  // Log to console for debugging, but don't spam notifications
  // Cache may intentionally omit optional packs
  if (CONFIG?.debug?.hooks) {
    console.debug(`NPC Button: Pack "${packName}" not in compendium cache`);
  }
}

/**
 * Get cached index for a pack
 * @param {Object} pack - Foundry pack
 * @returns {Array|null} Cached index entries or null
 */
export function getCachedPackIndex(pack) {
  const cache = DATA_CACHE.compendiumCache;
  if (!cache?.packs) return null;
  const entry = cache.packs[pack.collection];
  if (!entry?.entries?.length) return null;
  return entry.entries;
}

/**
 * Check if cached index has price data
 * @param {Array} entries - Cached index entries
 * @returns {boolean}
 */
export function cachedIndexHasPrice(entries) {
  const sample = entries?.[0];
  if (!sample) return false;
  const price = sample.system?.price ?? sample.system?.price?.value;
  return price !== undefined && price !== null;
}

/**
 * Get a cached document by pack name and ID
 * @param {string} packName - Pack collection name
 * @param {string} id - Document ID
 * @returns {Object|null} Cached document or null
 */
export function getCachedDoc(packName, id) {
  const cache = DATA_CACHE.compendiumCache;
  if (!cache?.packs) return null;
  return cache.packs[packName]?.documents?.[id] || null;
}

/**
 * Get all cached documents for multiple packs
 * @param {string[]} packs - Array of pack collection names
 * @returns {Object[]} Array of cached documents
 */
export function getCachedDocsForPacks(packs) {
  ensureLookupIndexState();
  if (!DATA_CACHE.compendiumCache?.packs) return [];
  const out = [];
  for (const packName of packs || []) {
    out.push(...getPackCachedDocs(packName));
  }
  return out;
}

/**
 * Find a cached document by name
 * @param {string[]} packs - Array of pack collection names
 * @param {string} name - Name to search for
 * @returns {Object|null} Cached document or null
 */
export function getCachedDocByName(packs, name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;
  const candidates = new Set([target, ...getSearchStrings({ name: target })]);
  for (const packName of packs || []) {
    const nameMap = getPackNameMap(packName);
    for (const token of candidates) {
      if (!nameMap.has(token)) continue;
      return nameMap.get(token) || null;
    }
  }
  return null;
}

/**
 * Get a random cached document matching keywords
 * @param {string[]} packs - Array of pack collection names
 * @param {string[]} keywords - Keywords to match
 * @param {Function} predicate - Optional filter function
 * @returns {Object|null} Random matching document or null
 */
export function getRandomCachedDocByKeywords(packs, keywords, predicate) {
  const { docs, matches } = getDocsAndMatchesByKeywords(packs, keywords, predicate);
  if (!docs.length) return null;
  if (!keywords?.length) return pickRandom(docs);
  return matches.length ? pickRandom(matches) : pickRandom(docs);
}

/**
 * Get a random cached document matching keywords with budget filtering
 * @param {string[]} packs - Array of pack collection names
 * @param {string[]} keywords - Keywords to match
 * @param {Function} predicate - Optional filter function
 * @param {string} budget - Budget tier (poor, normal, well, elite)
 * @param {boolean} allowMagic - Whether to allow magic items
 * @returns {Object|null} Random matching document or null
 */
export function getRandomCachedDocByKeywordsWithBudget(packs, keywords, predicate, budget, allowMagic = false) {
  const { docs, matches } = getDocsAndMatchesByKeywords(packs, keywords, predicate);
  let pool = docs;
  if (keywords?.length && matches.length) pool = matches;
  if (!pool.length) return null;
  pool = pool.slice();
  if (!pool.length) return null;
  return pickByBudget(pool, budget, allowMagic, getItemPriceValue);
}

/**
 * Get pack index with caching
 * @param {Object} pack - Foundry pack
 * @param {string[]} fields - Index fields to request
 * @returns {Promise<Array>} Index entries
 */
export async function getPackIndex(pack, fields = ["type", "name"]) {
  if (!DATA_CACHE.packIndex) DATA_CACHE.packIndex = new Map();
  const key = `${pack.collection}|${fields.join(",")}`;
  if (DATA_CACHE.packIndex.has(key)) {
    return DATA_CACHE.packIndex.get(key);
  }

  const cached = getCachedPackIndex(pack);
  if (cached) {
    const wantsPrice = fields.some((f) => String(f).includes("system.price"));
    if (!wantsPrice || cachedIndexHasPrice(cached)) {
      DATA_CACHE.packIndex.set(key, cached);
      return cached;
    }
  }

  const wantsPrice = fields.some((f) => String(f).includes("system.price"));
  if (USE_COMPENDIUM_CACHE && DATA_CACHE.compendiumCache && !wantsPrice) {
    warnMissingCacheOnce(pack.collection);
    try {
      const fallbackIndex = await pack.getIndex({ fields });
      DATA_CACHE.packIndex.set(key, fallbackIndex);
      return fallbackIndex;
    } catch (err) {
      console.warn(`NPC Button: failed to read index for ${pack.collection}`, err);
      DATA_CACHE.packIndex.set(key, []);
      return [];
    }
  }

  const index = await pack.getIndex({ fields });
  DATA_CACHE.packIndex.set(key, index);
  return index;
}

/**
 * Collect all Item pack names from game.packs
 * @returns {Set<string>} Set of pack collection names
 */
export function collectAllItemPackNames() {
  const names = new Set();
  for (const pack of game.packs || []) {
    if (pack.documentName !== "Item") continue;
    const systemId = pack.metadata?.system;
    if (systemId && systemId !== "dnd5e") continue;
    names.add(pack.collection);
  }
  return names;
}

/**
 * Build packsByType mapping from cache data
 * @param {Object} packs - Cache packs object
 * @returns {Object} Mapping of type to pack names
 */
export function buildPacksByType(packs) {
  const packsByType = {
    weapons: [],
    loot: [],
    spells: [],
    features: [],
    classFeatures: []
  };

  for (const [packName, packData] of Object.entries(packs)) {
    const entries = packData.entries || [];
    let hasWeapon = false;
    let hasLoot = false;
    let hasSpell = false;
    let hasFeat = false;

    for (const entry of entries) {
      if (entry.type === "weapon" || entry.type === "equipment") hasWeapon = true;
      if (
        entry.type === "loot" ||
        entry.type === "consumable" ||
        entry.type === "equipment" ||
        entry.type === "tool"
      ) {
        hasLoot = true;
      }
      if (entry.type === "spell") hasSpell = true;
      if (entry.type === "feat") hasFeat = true;
    }

    if (hasWeapon) packsByType.weapons.push(packName);
    if (hasLoot) packsByType.loot.push(packName);
    if (hasSpell) packsByType.spells.push(packName);
    if (hasFeat) packsByType.features.push(packName);

    const label = String(packData.label || "").toLowerCase();
    // Support both English and Russian labels for class features
    if (hasFeat && (packName.includes("class") || label.includes("class") || label.includes("класс"))) {
      packsByType.classFeatures.push(packName);
    }
  }

  if (!packsByType.classFeatures.length) {
    packsByType.classFeatures = [...packsByType.features];
  }

  return packsByType;
}

/**
 * Build and save the compendium cache (GM only)
 */
export async function buildCompendiumCache() {
  if (!game.user?.isGM) {
    ui.notifications?.warn(t("cache.warnGmOnly"));
    return;
  }

  const packNames = new Set();
  Object.values(COMPENDIUMS).forEach((list) => {
    if (Array.isArray(list)) list.forEach((name) => packNames.add(name));
  });
  collectAllItemPackNames().forEach((name) => packNames.add(name));

  const fields = [
    "type",
    "name",
    "system.rarity",
    "system.properties",
    "system.requirements",
    "system.level",
    "system.price"
  ];

  const output = {
    generatedAt: new Date().toISOString(),
    packs: {},
    packsByType: {}
  };

  const queuedPacks = [];
  for (const packName of packNames) {
    const pack = game.packs?.get(packName);
    if (!pack) {
      ui.notifications?.warn(tf("cache.warnPackNotFound", { packName }));
      continue;
    }
    queuedPacks.push({ packName, pack });
  }

  if (!queuedPacks.length) {
    ui.notifications?.warn(t("cache.warnNoPacksToBuild"));
    return;
  }

  queuedPacks.sort((a, b) => a.packName.localeCompare(b.packName));
  ui.notifications?.info(tf("cache.infoBuildStarted", { count: queuedPacks.length }));

  const progressStep = Math.max(1, Math.ceil(queuedPacks.length / 5));
  let nextProgressAt = progressStep;
  let completed = 0;

  const notifyProgress = (force = false) => {
    if (!force && completed < nextProgressAt) return;
    ui.notifications?.info(
      tf("cache.infoBuildProgress", { done: completed, total: queuedPacks.length })
    );
    while (nextProgressAt <= completed) nextProgressAt += progressStep;
  };

  const queue = queuedPacks.slice();
  const results = [];
  const workerCount = Math.min(CACHE_BUILD_MAX_CONCURRENCY, queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) continue;
      const { packName, pack } = entry;

      let index = [];
      try {
        index = await pack.getIndex({ fields });
      } catch (err) {
        console.warn(`NPC Button: failed to read index for ${packName}`, err);
      }

      const documents = {};
      try {
        const docs = await pack.getDocuments();
        for (const doc of docs) {
          if (CACHE_DOC_TYPES.has(doc.type)) {
            documents[doc.id] = doc.toObject();
          }
        }
      } catch (err) {
        console.warn(`NPC Button: failed to read documents for ${packName}`, err);
      }

      results.push({
        collection: pack.collection,
        data: {
          label: pack.title,
          documentName: pack.documentName,
          entries: index,
          documents
        }
      });

      completed += 1;
      notifyProgress(false);
    }
  });

  await Promise.all(workers);
  notifyProgress(true);

  for (const entry of results) {
    if (!entry?.collection || !entry?.data) continue;
    output.packs[entry.collection] = entry.data;
  }

  output.packsByType = buildPacksByType(output.packs);

  // Add version hash for cache invalidation
  const moduleVersion = game.modules?.get(MODULE_ID)?.version || "unknown";
  const systemVersion = game.system?.version || "unknown";
  output.cacheVersion = `${moduleVersion}|${systemVersion}|${Object.keys(output.packs).length}`;

  const data = JSON.stringify(output);
  const file = new File([data], `${COMPENDIUM_CACHE_FILE}.json`, {
    type: "application/json"
  });

  try {
    await FilePicker.upload("data", `modules/${MODULE_ID}/data`, file, {}, { notify: true });
    DATA_CACHE.compendiumCache = output;
    DATA_CACHE.compendiumLists = output.packsByType;
    DATA_CACHE.packIndex = new Map();
    ui.notifications?.info(t("cache.infoBuilt"));
  } catch (err) {
    console.error(err);
    ui.notifications?.error(t("cache.errorWriteFailed"));
  }
}
