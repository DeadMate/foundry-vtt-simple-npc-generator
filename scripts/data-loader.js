/**
 * Data loading and caching for NPC Button module
 * @module data-loader
 */

import { MODULE_ID, COMPENDIUM_CACHE_FILE } from "./constants.js";

/** Global data cache */
export const DATA_CACHE = { loaded: false };

/** Promise for ongoing load operation - prevents race conditions */
let LOAD_PROMISE = null;

/**
 * Load all module data (names, traits, archetypes, loot, species, cache)
 * Uses promise-based locking to prevent duplicate loading
 * @returns {Promise<void>}
 */
export async function loadData() {
  if (DATA_CACHE.loaded) return;
  if (LOAD_PROMISE) return LOAD_PROMISE;

  LOAD_PROMISE = (async () => {
    const [names, traits, archetypes, loot] = await Promise.all([
      fetchJson("names"),
      fetchJson("traits"),
      fetchJson("archetypes"),
      fetchJson("loot")
    ]);

    DATA_CACHE.names = names;
    DATA_CACHE.traits = traits;
    DATA_CACHE.archetypes = archetypes;
    DATA_CACHE.loot = loot;

    // Import getSpeciesEntries lazily to avoid circular dependency
    const { getSpeciesEntries } = await import("./species.js");
    DATA_CACHE.speciesEntries = await getSpeciesEntries();
    DATA_CACHE.compendiumCache = await fetchOptionalJson(COMPENDIUM_CACHE_FILE);
    DATA_CACHE.compendiumLists = DATA_CACHE.compendiumCache?.packsByType || null;
    DATA_CACHE.loaded = true;
    validateDataCache();
  })();

  LOAD_PROMISE = LOAD_PROMISE.catch((err) => {
    LOAD_PROMISE = null;
    throw err;
  });

  return LOAD_PROMISE;
}

/**
 * Fetch JSON data from module data folder
 * @param {string} name - File name without extension
 * @returns {Promise<Object>} Parsed JSON data
 * @throws {Error} If file cannot be loaded or parsed
 */
export async function fetchJson(name) {
  const response = await fetch(`modules/${MODULE_ID}/data/${name}.json`);
  if (!response.ok) throw new Error(`${MODULE_ID} | Failed to load ${name}.json`);
  try {
    return await response.json();
  } catch (err) {
    throw new Error(`${MODULE_ID} | Failed to parse ${name}.json: ${err.message}`);
  }
}

/**
 * Fetch JSON data, returning null on failure (for optional files)
 * @param {string} name - File name without extension
 * @returns {Promise<Object|null>} Parsed JSON data or null
 */
export async function fetchOptionalJson(name) {
  try {
    const response = await fetch(`modules/${MODULE_ID}/data/${name}.json`);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn(`${MODULE_ID} | Failed to load/parse ${name}.json:`, err.message);
    return null;
  }
}

/**
 * Validate loaded data and warn about missing/empty fields
 */
export function validateDataCache() {
  const problems = [];
  if (!DATA_CACHE.names?.cultures || !Object.keys(DATA_CACHE.names.cultures).length) {
    problems.push("names.cultures");
  }
  if (!Array.isArray(DATA_CACHE.names?.surnames) || !DATA_CACHE.names.surnames.length) {
    problems.push("names.surnames");
  }
  if (!Array.isArray(DATA_CACHE.traits?.appearance) || !DATA_CACHE.traits.appearance.length) {
    problems.push("traits.appearance");
  }
  if (!Array.isArray(DATA_CACHE.archetypes) || !DATA_CACHE.archetypes.length) {
    problems.push("archetypes");
  }

  if (problems.length) {
    ui.notifications?.warn(
      `NPC Button: Missing or empty data (${problems.join(", ")}). Using fallbacks where possible.`
    );
  }
}

/**
 * Reset the load promise (useful for testing or forced reload)
 */
export function resetLoadPromise() {
  LOAD_PROMISE = null;
  DATA_CACHE.loaded = false;
}
