/**
 * Utility functions for NPC Button module
 * @module utils
 */

/**
 * Pick a random element from an array
 * @param {Array} arr - Array to pick from
 * @returns {*} Random element or null if array is empty
 */
export function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 * @param {Array} arr - Array to shuffle
 * @returns {Array} New shuffled array
 */
export function shuffleArray(arr) {
  const out = Array.isArray(arr) ? [...arr] : [];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick N random elements from an array without replacement
 * @param {Array} arr - Array to pick from
 * @param {number} n - Number of elements to pick
 * @returns {Array} Array of picked elements
 */
export function pickRandomN(arr, n) {
  if (!arr || !arr.length) return [];
  if (arr.length <= n) return [...arr];
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Pick a random element or return fallback if array is empty
 * @param {Array} arr - Array to pick from
 * @param {*} fallback - Fallback value
 * @returns {*} Random element or fallback
 */
export function pickRandomOr(arr, fallback) {
  const value = pickRandom(arr);
  return value === null ? fallback : value;
}

/**
 * Generate a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Return true with given probability
 * @param {number} probability - Probability between 0 and 1
 * @returns {boolean}
 */
export function chance(probability) {
  return Math.random() < probability;
}

/**
 * Capitalize first letter of a string
 * @param {string} value - String to capitalize
 * @returns {string} Capitalized string
 */
export function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Deep clone data using Foundry's duplicate or JSON fallback
 * @param {*} data - Data to clone
 * @returns {*} Cloned data
 */
export function cloneData(data) {
  if (!data) return data;
  if (foundry?.utils?.duplicate) {
    return foundry.utils.duplicate(data);
  }
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    console.warn("NPC Button: Failed to clone data, returning original");
    return data;
  }
}

/**
 * Convert a Foundry document to plain object data
 * @param {Object} docOrData - Document or plain data
 * @returns {Object|null} Plain object data
 */
export function toItemData(docOrData) {
  if (!docOrData) return null;
  return typeof docOrData.toObject === "function" ? docOrData.toObject() : docOrData;
}

/**
 * Generate a random ID (uses Foundry's randomID if available)
 * @returns {string} Random ID string
 */
export function generateId() {
  return foundry?.utils?.randomID?.() || Math.random().toString(36).slice(2, 10);
}

/**
 * Parse a price string like "5 gp" into value and denomination
 * @param {string} text - Price string
 * @returns {{value: number, denom: string}|null}
 */
export function parsePriceString(text) {
  const match = String(text)
    .trim()
    .toLowerCase()
    .match(/([0-9]+(?:\.[0-9]+)?)\s*(pp|gp|ep|sp|cp)?/);
  if (!match) return null;
  return { value: Number(match[1]), denom: match[2] || "gp" };
}

/**
 * Convert a price value to copper pieces
 * @param {number} value - Price value
 * @param {string} denom - Denomination (pp, gp, ep, sp, cp)
 * @returns {number} Value in copper pieces
 */
export function convertToCp(value, denom) {
  const mult = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
  return Math.round((value || 0) * (mult[denom] || 100));
}

/**
 * Get search strings from an entry (name, originalName, identifier)
 * @param {Object} entry - Index entry or document
 * @returns {string[]} Array of lowercase search strings
 */
export function getSearchStrings(entry) {
  const out = new Set();
  const add = (value) => {
    if (!value) return;
    const str = String(value).trim().toLowerCase();
    if (str) out.add(str);
  };

  add(entry.name);
  add(entry.originalName);
  add(entry.flags?.babele?.originalName);
  add(entry.system?.identifier);
  return Array.from(out);
}

/**
 * Normalize a UUID to include Item segment if missing
 * @param {string} uuid - UUID to normalize
 * @returns {string} Normalized UUID
 */
export function normalizeUuid(uuid) {
  if (!uuid) return uuid;
  const str = String(uuid);
  if (str.startsWith("Compendium.") && !str.includes(".Item.")) {
    const parts = str.split(".");
    if (parts.length === 3) {
      return `${parts[0]}.${parts[1]}.Item.${parts[2]}`;
    }
  }
  return str;
}

/**
 * Get item price in copper pieces
 * @param {Object} entryOrDoc - Item entry or document
 * @returns {number|null}
 */
export function getItemPriceValue(entryOrDoc) {
  const price = entryOrDoc?.system?.price;
  if (price === null || price === undefined) return null;
  if (typeof price === "number") return price;
  const value = price.value ?? price;
  const denom = String(price.denomination || price.unit || "").toLowerCase();
  if (typeof value === "number") return convertToCp(value, denom);
  if (typeof value === "string") {
    const parsed = parsePriceString(value);
    if (parsed) return convertToCp(parsed.value, parsed.denom);
  }
  return null;
}

/**
 * Pick item by budget using percentile ranges
 * @param {Array} candidates - Array of candidates
 * @param {string} budget - Budget tier
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @param {Function} priceFn - Function to get price from candidate
 * @returns {*} Selected candidate
 */
export function pickByBudget(candidates, budget, allowMagic, priceFn) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const priced = candidates
    .map((c) => ({ c, price: priceFn(c) }))
    .filter((p) => Number.isFinite(p.price));
  if (!priced.length) return pickRandom(candidates);

  const sorted = priced.sort((a, b) => a.price - b.price);
  const n = sorted.length;
  const pickRange = (fromPct, toPct) => {
    const start = Math.max(0, Math.floor(n * fromPct));
    const end = Math.min(n - 1, Math.floor(n * toPct));
    const slice = sorted.slice(start, end + 1);
    return slice.length ? pickRandom(slice).c : sorted[Math.floor(n / 2)].c;
  };

  switch (budget) {
    case "poor":
      return pickRange(0, 0.3);
    case "well":
      return pickRange(0.6, 0.9);
    case "elite":
      return pickRange(0.8, 1.0);
    case "normal":
    default:
      return pickRange(0.3, 0.7);
  }
}
