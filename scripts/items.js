/**
 * Item handling, budget system, and equipment generation
 * @module items
 */

import { COMPENDIUMS, MODULE_ID, TOKEN_ASSETS, TOKEN_ROLE_MAP } from "./constants.js";
import { DATA_CACHE } from "./data-loader.js";
import {
  pickRandom,
  pickRandomN,
  pickRandomOr,
  randInt,
  chance,
  cloneData,
  toItemData,
  parsePriceString,
  convertToCp,
  getSearchStrings,
  generateId,
  getItemPriceValue,
  pickByBudget,
  getBudgetPriceRange
} from "./utils.js";
import {
  getCachedDoc,
  getCachedDocByName,
  getRandomCachedDocByKeywords,
  getRandomCachedDocByKeywordsWithBudget,
  getCachedDocsForPacks,
  getPackIndex
} from "./cache.js";

// Re-export from utils for backwards compatibility
export { getItemPriceValue, pickByBudget } from "./utils.js";

/**
 * Get pack names for a given type
 * @param {string} kind - Pack type (weapons, loot, spells, features, classFeatures, species)
 * @returns {string[]} Array of pack collection names
 */
export function getPacks(kind) {
  const base = DATA_CACHE.compendiumLists?.[kind]?.length
    ? DATA_CACHE.compendiumLists[kind]
    : COMPENDIUMS[kind];
  const packs = Array.from(new Set((base || []).filter(Boolean)));
  if (!packs.length) return [];
  if (kind !== "spells") return packs;
  return prioritizeSpellPacksByInterfaceLanguage(packs);
}

/**
 * Prioritize spell compendium packs by interface language,
 * falling back to English packs when localized packs are unavailable.
 * @param {string[]} packs - Pack names
 * @returns {string[]} Reordered packs
 */
function prioritizeSpellPacksByInterfaceLanguage(packs) {
  const lang = getInterfaceLanguageCode();
  if (!lang) return packs;

  const preferred = [];
  const englishFallback = [];
  const other = [];

  for (const packName of packs) {
    const packLang = detectPackLanguage(packName, "spells");
    if (packLang === lang) {
      preferred.push(packName);
      continue;
    }
    if (packLang === "en") {
      englishFallback.push(packName);
      continue;
    }
    other.push(packName);
  }

  return Array.from(new Set([...preferred, ...englishFallback, ...other]));
}

/**
 * Detect current Foundry interface language code
 * @returns {string} Normalized language code (e.g. ru, en)
 */
function getInterfaceLanguageCode() {
  const coreLang = game.settings?.get?.("core", "language");
  const lang = String(game.i18n?.lang || coreLang || "en").trim().toLowerCase();
  const match = lang.match(/^[a-z]{2}/);
  return match ? match[0] : "en";
}

/**
 * Detect pack language from collection/title metadata
 * @param {string} packName - Pack collection name
 * @param {string} kind - Pack kind
 * @returns {"ru"|"en"|"other"} Detected language
 */
function detectPackLanguage(packName, kind) {
  const collection = String(packName || "").toLowerCase();
  const pack = game.packs?.get(packName);
  const title = String(
    pack?.title ||
    pack?.metadata?.label ||
    DATA_CACHE.compendiumCache?.packs?.[packName]?.label ||
    ""
  ).toLowerCase();
  const source = `${collection} ${title}`;

  if (/(^|[\s._/-])(ru|rus)([\s._/-]|$)|russian|рус|русск|кирил|cyril/i.test(source)) {
    return "ru";
  }
  if (
    (Array.isArray(COMPENDIUMS?.[kind]) && COMPENDIUMS[kind].includes(packName)) ||
    collection.startsWith("dnd5e.") ||
    /(^|[\s._/-])(en|eng)([\s._/-]|$)|english|англ/i.test(source)
  ) {
    return "en";
  }
  return "other";
}

/**
 * Standard index fields for item queries
 * @returns {string[]}
 */
export function getItemIndexFields() {
  return ["type", "name", "system.rarity", "system.price"];
}

/**
 * Get budget range for a budget tier
 * @param {string} budget - Budget tier
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @returns {{min: number, max: number}}
 */
export function getBudgetRange(budget, allowMagic = false) {
  return getBudgetPriceRange(budget, allowMagic);
}

/**
 * Check if an item is within budget
 * @param {Object} entryOrDoc - Item entry or document
 * @param {string} budget - Budget tier
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @returns {boolean}
 */
export function isWithinBudget(entryOrDoc, budget, allowMagic = false) {
  const range = getBudgetRange(budget, allowMagic);
  const price = getItemPriceValue(entryOrDoc);
  if (price === null || price === undefined) return true;
  return price >= range.min && price <= range.max;
}

/**
 * Check if an index entry is allowed (filters artifacts and optionally magic items)
 * @param {Object} entry - Index entry
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @returns {boolean}
 */
export function isAllowedItemEntry(entry, allowMagic = false) {
  const rarity = String(entry.system?.rarity || "").toLowerCase();
  const properties = entry.system?.properties || [];
  const isMagical = Array.isArray(properties) && properties.includes("mgc");
  if (rarity === "artifact") return false;
  if (!allowMagic) {
    if (isMagical) return false;
    if (rarity && rarity !== "none") return false;
  }
  return true;
}

/**
 * Check if a document is allowed (filters artifacts and optionally magic items)
 * @param {Object} doc - Document
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @returns {boolean}
 */
export function isAllowedItemDoc(doc, allowMagic = false) {
  const rarity = String(doc.system?.rarity || "").toLowerCase();
  const properties = doc.system?.properties || [];
  const isMagical = Array.isArray(properties) && properties.includes("mgc");
  if (rarity === "artifact") return false;
  if (!allowMagic) {
    if (isMagical) return false;
    if (rarity && rarity !== "none") return false;
  }
  return true;
}

/**
 * Check if item is armor
 * @param {Object} item - Item data
 * @returns {boolean}
 */
export function isArmorItem(item) {
  if (!item) return false;
  const type = String(item.type || "").toLowerCase();
  if (type !== "equipment") return false;
  const armorType = item.system?.armor?.type;
  if (armorType) return true;
  const typeValue = String(item.system?.type?.value || "").toLowerCase();
  if (["light", "medium", "heavy", "shield", "armor"].includes(typeValue)) return true;
  const name = String(item.name || "").toLowerCase();
  return /armor|mail|plate|chain|leather|scale|breastplate|shield|доспех|кольчуг|латы|панцир|щит/i.test(name);
}

/**
 * Check if item is a shield
 * @param {Object} item - Item data
 * @returns {boolean}
 */
export function isShieldItem(item) {
  const armorType = item.system?.armor?.type;
  if (armorType === "shield") return true;
  const typeValue = String(item.system?.type?.value || "").toLowerCase();
  if (typeValue === "shield") return true;
  const name = String(item.name || "").toLowerCase();
  return /shield|щит/i.test(name);
}

/**
 * Normalize armor items - keep only best armor and best shield
 * @param {Object[]} items - Array of items (mutated in place)
 */
export function normalizeArmorItems(items) {
  if (!Array.isArray(items) || !items.length) return;
  const armor = [];
  const shields = [];
  const rest = [];
  for (const item of items) {
    if (isArmorItem(item)) {
      if (isShieldItem(item)) shields.push(item);
      else armor.push(item);
    } else {
      rest.push(item);
    }
  }

  const pickBest = (arr) => {
    if (!arr.length) return [];
    const sorted = arr.slice().sort((a, b) => {
      const pa = getItemPriceValue(a) ?? 0;
      const pb = getItemPriceValue(b) ?? 0;
      return pb - pa;
    });
    return [sorted[0]];
  };

  const kept = [...rest, ...pickBest(armor), ...pickBest(shields)];
  items.length = 0;
  items.push(...kept);
}

/**
 * Clone item data
 * @param {Object} data - Item data
 * @returns {Object}
 */
export function cloneItemData(data) {
  return cloneData(data);
}

/**
 * Ensure item has activities (for features without them)
 * @param {Object} item - Item data
 * @returns {Object}
 */
export function ensureActivities(item) {
  if (!item?.system) return item;
  if (item.system.activities && Object.keys(item.system.activities).length) return item;
  item.system.activities = buildBasicAbilityActivities(item.name);
  if (!item.system.activation) {
    item.system.activation = { type: "action", value: 1, condition: "" };
  }
  return item;
}

/**
 * Build basic ability activities structure
 * @param {string} name - Activity name
 * @param {string} activationType - Activation type (default: action)
 * @returns {Object}
 */
export function buildBasicAbilityActivities(name, activationType = "action") {
  const id = generateId();
  return {
    [id]: {
      type: "utility",
      activation: {
        type: activationType,
        value: 1,
        condition: "",
        override: false
      },
      consumption: {
        targets: [],
        scaling: { allowed: false, max: "" },
        spellSlot: true
      },
      description: { chatFlavor: "" },
      duration: {
        concentration: false,
        value: "",
        units: "inst",
        special: "",
        override: false
      },
      effects: [],
      range: { value: "", units: "ft", special: "", override: false },
      target: {
        template: {
          count: "",
          contiguous: false,
          type: "",
          size: "",
          width: "",
          height: "",
          units: "ft"
        },
        affects: { count: "", type: "self", choice: false, special: "" },
        prompt: true,
        override: false
      },
      uses: { spent: 0, recovery: [], max: "" },
      sort: 0,
      _id: id,
      name: name || "",
      flags: {},
      visibility: {
        level: {},
        requireAttunement: false,
        requireIdentification: false,
        requireMagic: false
      },
      roll: { prompt: false, visible: false }
    }
  };
}

/**
 * Get a random token image
 * @returns {string}
 */
export function getRandomTokenImage() {
  if (!TOKEN_ASSETS.length) return "icons/svg/mystery-man.svg";
  const file = pickRandom(TOKEN_ASSETS);
  return `modules/${MODULE_ID}/assets/tokens/${file}`;
}

/**
 * Get token image matching NPC archetype
 * @param {Object} npc - NPC data
 * @returns {string}
 */
export function getTokenImageForNpc(npc) {
  const tags = npc?.archetype?.tags || [];
  const style = npc?.archetype?.attackStyle || "";
  const candidates = [];
  for (const [role, roleTags] of Object.entries(TOKEN_ROLE_MAP)) {
    if (roleTags.some((tag) => tags.includes(tag) || tag === style)) {
      const file = TOKEN_ASSETS.find((t) => t.includes(`-${role}.`));
      if (file) candidates.push(file);
    }
  }
  if (candidates.length) {
    return `modules/${MODULE_ID}/assets/tokens/${pickRandom(candidates)}`;
  }
  return getRandomTokenImage();
}

// ========== Item fetching functions ==========

/**
 * Get price from entry, falling back to cached document
 * @param {string} packName - Pack collection name
 * @param {Object} entry - Index entry
 * @returns {number|null}
 */
export function getPriceFromEntry(packName, entry) {
  const direct = getItemPriceValue(entry);
  if (Number.isFinite(direct)) return direct;
  const cached = getCachedDoc(packName, entry._id);
  if (cached) return getItemPriceValue(cached);
  return null;
}

/**
 * Sample prices from documents for budget picking (parallel loading)
 * @param {Object} pack - Foundry pack
 * @param {Array} candidates - Candidate entries
 * @param {number} limit - Max samples
 * @returns {Promise<Array>}
 */
export async function samplePricesFromDocuments(pack, candidates, limit = 10) {
  // Randomly select entries to sample
  const pool = candidates.slice();
  const toSample = [];
  while (pool.length && toSample.length < limit) {
    const idx = Math.floor(Math.random() * pool.length);
    toSample.push(pool.splice(idx, 1)[0]);
  }

  // Load all documents in parallel
  const results = await Promise.allSettled(
    toSample.map(async (entry) => {
      const doc = await pack.getDocument(entry._id);
      const price = getItemPriceValue(doc);
      return { c: entry, price };
    })
  );

  // Filter successful results with valid prices
  return results
    .filter((r) => r.status === "fulfilled" && Number.isFinite(r.value.price))
    .map((r) => r.value);
}

/**
 * Pick by budget asynchronously with document sampling
 * @param {Object} pack - Foundry pack
 * @param {Array} candidates - Candidate entries
 * @param {string} budget - Budget tier
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @returns {Promise<Object|null>}
 */
export async function pickByBudgetAsync(pack, candidates, budget, allowMagic) {
  if (!Array.isArray(candidates) || !candidates.length) return null;

  const priced = [];
  for (const entry of candidates) {
    const price = getPriceFromEntry(pack.collection, entry);
    if (Number.isFinite(price)) priced.push({ c: entry, price });
  }

  if (!priced.length) {
    const sampled = await samplePricesFromDocuments(pack, candidates, 12);
    if (sampled.length) {
      const sorted = sampled.sort((a, b) => a.price - b.price);
      return pickByBudget(sorted.map((s) => s.c), budget, allowMagic, (e) => sampled.find((s) => s.c === e)?.price);
    }
    return pickRandom(candidates);
  }

  const sorted = priced.sort((a, b) => a.price - b.price);
  const justEntries = sorted.map((p) => p.c);
  return pickByBudget(justEntries, budget, allowMagic, (e) => priced.find((p) => p.c === e)?.price);
}

/**
 * Resolve an item from an entry
 * @param {string} packName - Pack collection name
 * @param {Object} entry - Index entry
 * @returns {Promise<Object|null>}
 */
export async function resolveItemFromEntry(packName, entry) {
  if (!entry || !packName) return null;
  const cached = getCachedDoc(packName, entry._id);
  if (cached) return cached;
  const pack = game.packs?.get(packName);
  if (!pack) return null;
  return pack.getDocument(entry._id);
}

/**
 * Get a random item from packs
 * @param {string[]} packs - Pack names
 * @param {Function} predicate - Filter function
 * @returns {Promise<Object|null>}
 */
export async function getRandomItemFromPacks(packs, predicate) {
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;

    const index = await getPackIndex(pack, getItemIndexFields());
    const candidates = index.filter(predicate);
    if (!candidates.length) continue;

    const entry = pickRandom(candidates);
    const cached = getCachedDoc(pack.collection, entry._id);
    if (cached) return cached;
    return pack.getDocument(entry._id);
  }
  return null;
}

/**
 * Get a random item from all packs with budget
 * @param {string[]} packs - Pack names
 * @param {Function} predicate - Filter function
 * @param {string} budget - Budget tier
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @returns {Promise<Object|null>}
 */
export async function getRandomItemFromAllPacksWithBudget(packs, predicate, budget, allowMagic = false) {
  const candidates = [];
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    const index = await getPackIndex(pack, getItemIndexFields());
    for (const entry of index) {
      if (predicate && !predicate(entry)) continue;
      candidates.push({ packName: pack.collection, entry });
    }
  }
  if (!candidates.length) return null;

  const priced = candidates
    .map((c) => ({ c, price: getPriceFromEntry(c.packName, c.entry) }))
    .filter((p) => Number.isFinite(p.price));

  const picked = priced.length
    ? pickByBudget(priced, budget, allowMagic, (p) => p.price)?.c
    : pickRandom(candidates);
  if (!picked) return null;
  return resolveItemFromEntry(picked.packName, picked.entry);
}

/**
 * Get a random item by keywords from all packs with budget
 * @param {string[]} packs - Pack names
 * @param {string[]} keywords - Keywords to match
 * @param {Function} predicate - Filter function
 * @param {string} budget - Budget tier
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @returns {Promise<Object|null>}
 */
export async function getRandomItemByKeywordsFromAllPacksWithBudget(
  packs,
  keywords,
  predicate,
  budget,
  allowMagic = false
) {
  const normalized = expandLookupKeywords(keywords);
  const candidates = [];
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    const index = await getPackIndex(pack, getItemIndexFields());
    for (const entry of index) {
      if (predicate && !predicate(entry)) continue;
      if (normalized.length) {
        const haystack = getSearchStrings(entry);
        if (!normalized.some((k) => haystack.some((h) => h.includes(k)))) continue;
      }
      candidates.push({ packName: pack.collection, entry });
    }
  }
  if (!candidates.length) return null;

  const priced = candidates
    .map((c) => ({ c, price: getPriceFromEntry(c.packName, c.entry) }))
    .filter((p) => Number.isFinite(p.price));

  const picked = priced.length
    ? pickByBudget(priced, budget, allowMagic, (p) => p.price)?.c
    : pickRandom(candidates);
  if (!picked) return null;
  return resolveItemFromEntry(picked.packName, picked.entry);
}

/**
 * Get a random item by keywords
 * @param {string[]} packs - Pack names
 * @param {string[]} keywords - Keywords to match
 * @param {Function} predicate - Filter function
 * @returns {Promise<Object|null>}
 */
export async function getRandomItemByKeywords(packs, keywords, predicate) {
  const normalized = expandLookupKeywords(keywords);
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;

    const index = await getPackIndex(pack, getItemIndexFields());
    const candidates = index.filter((entry) => {
      if (predicate && !predicate(entry)) return false;
      if (!normalized.length) return true;
      const haystack = getSearchStrings(entry);
      return normalized.some((k) => haystack.some((h) => h.includes(k)));
    });
    if (!candidates.length) continue;

    const entry = pickRandom(candidates);
    const cached = getCachedDoc(pack.collection, entry._id);
    if (cached) return cached;
    return pack.getDocument(entry._id);
  }
  return null;
}

/**
 * Get a random item by keywords with budget
 * @param {string[]} packs - Pack names
 * @param {string[]} keywords - Keywords to match
 * @param {Function} predicate - Filter function
 * @param {string} budget - Budget tier
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @returns {Promise<Object|null>}
 */
export async function getRandomItemByKeywordsWithBudget(packs, keywords, predicate, budget, allowMagic = false) {
  const normalized = expandLookupKeywords(keywords);
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;

    const index = await getPackIndex(pack, getItemIndexFields());
    const candidates = index.filter((entry) => {
      if (predicate && !predicate(entry)) return false;
      if (!normalized.length) return true;
      const haystack = getSearchStrings(entry);
      return normalized.some((k) => haystack.some((h) => h.includes(k)));
    });
    if (!candidates.length) continue;

    const entry = await pickByBudgetAsync(pack, candidates, budget, allowMagic);
    if (!entry) continue;
    const cached = getCachedDoc(pack.collection, entry._id);
    if (cached) return cached;
    return pack.getDocument(entry._id);
  }
  return null;
}

/**
 * Get item by exact name from packs
 * @param {string[]} packs - Pack names
 * @param {string} name - Item name
 * @returns {Promise<Object|null>}
 */
export async function getItemByNameFromPacks(packs, name) {
  const target = String(name || "").trim();
  if (!target) return null;
  const targets = new Set(getSearchStrings({ name: target }));
  if (!targets.size) return null;

  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;

    const index = await getPackIndex(pack, getItemIndexFields());
    const match = index.find((entry) => {
      const haystack = getSearchStrings(entry);
      return haystack.some((needle) => targets.has(needle));
    });
    if (!match) continue;

    const cached = getCachedDoc(pack.collection, match._id);
    if (cached) return cached;
    return pack.getDocument(match._id);
  }

  return null;
}

function expandLookupKeywords(keywords) {
  const out = new Set();
  for (const rawKeyword of keywords || []) {
    for (const term of getSearchStrings({ name: rawKeyword })) {
      out.add(term);
    }
  }
  return Array.from(out);
}

/**
 * Add unique item to array
 * @param {Object[]} out - Output array
 * @param {Set<string>} added - Set of added names
 * @param {Object} item - Item to add
 */
export function addUniqueItem(out, added, item) {
  if (!item) return;
  const name = String(item.name || "").trim().toLowerCase();
  if (!name || added.has(name)) return;
  added.add(name);
  out.push(item);
}

/**
 * Pick an item from keywords (tries compendium then cache)
 * @param {string[]} packs - Pack names
 * @param {string[]} keywords - Keywords to match
 * @param {Function} entryPredicate - Predicate for index entries
 * @param {Function} docPredicate - Predicate for cached docs
 * @param {string} budget - Budget tier
 * @returns {Promise<Object|null>}
 */
export async function pickItemFromKeywords(packs, keywords, entryPredicate, docPredicate, budget) {
  const picked = await getRandomItemByKeywordsWithBudget(packs, keywords, entryPredicate, budget);
  if (picked) return cloneItemData(toItemData(picked));
  const cached = getRandomCachedDocByKeywordsWithBudget(packs, keywords, docPredicate, budget);
  if (cached) return cloneItemData(cached);
  return null;
}
