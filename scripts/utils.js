/**
 * Utility functions for NPC Button module
 * @module utils
 */

import { BUDGET_RANGES } from "./constants.js";

const LOOKUP_ALIAS_GROUPS = [
  [
    "half plate",
    "half-plate",
    "полулаты",
    "кольчужно-латный доспех",
    "кольчужно латный доспех"
  ],
  [
    "studded leather armor",
    "studded leather",
    "шипованная кожаная броня",
    "шипованный кожаный доспех"
  ],
  ["chain mail", "chainmail", "кольчуга", "кольчужный доспех"],
  ["plate armor", "plate", "full plate", "латы", "латный доспех", "полный латный доспех"],
  ["shield", "щит"],
  ["shortbow", "короткий лук"],
  ["longbow", "длинный лук"],
  ["rapier", "рапира"],
  ["thieves' tools", "thieves tools", "инструменты вора", "воровские инструменты"],
  [
    "potion of greater healing",
    "greater healing potion",
    "зелье большого лечения",
    "зелье великого лечения"
  ]
];

const LOOKUP_ALIAS_MAP = buildLookupAliasMap(LOOKUP_ALIAS_GROUPS);
const SEARCH_STRINGS_CACHE = new WeakMap();

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
 * Escape HTML special characters in dynamic text
 * @param {*} value - Value to escape
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const raw = String(text || "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase();
  if (!raw) return null;

  const denomMatch = raw.match(/\b(pp|gp|ep|sp|cp)\b/);
  const denom = denomMatch?.[1] || "gp";

  const valueMatch = raw.match(/-?\d[\d\s,._]*/);
  if (!valueMatch) return null;

  const value = parseNumericPriceToken(valueMatch[0]);
  if (!Number.isFinite(value)) return null;
  return { value, denom };
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
  const source = entry && typeof entry === "object" ? entry : {};
  if (SEARCH_STRINGS_CACHE.has(source)) {
    return SEARCH_STRINGS_CACHE.get(source);
  }

  const out = new Set();
  const add = (value) => {
    if (!value) return;
    const str = String(value).trim().toLowerCase();
    if (!str) return;
    out.add(str);
    const normalized = normalizeLookupText(str);
    if (normalized) out.add(normalized);
    for (const alias of LOOKUP_ALIAS_MAP.get(normalized) || []) {
      out.add(alias);
    }
  };

  add(source.name);
  add(source.originalName);
  add(source.flags?.babele?.originalName);
  add(source.system?.identifier);
  const result = Object.freeze(Array.from(out));
  SEARCH_STRINGS_CACHE.set(source, result);
  return result;
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
  const denom = String(
    price.denomination ||
    price.unit ||
    price.currency ||
    value?.denomination ||
    value?.unit ||
    value?.currency ||
    ""
  ).toLowerCase();
  if (typeof value === "number") return convertToCp(value, denom);
  if (typeof value === "string") {
    const parsed = parsePriceString(value);
    if (parsed) return convertToCp(parsed.value, parsed.denom);
  }
  if (value && typeof value === "object") {
    if (typeof value.value === "number" || typeof value.value === "string") {
      const nestedDenom = String(value.denomination || value.unit || denom || "").toLowerCase();
      if (typeof value.value === "number") return convertToCp(value.value, nestedDenom);
      const parsedNested = parsePriceString(String(value.value));
      if (parsedNested) return convertToCp(parsedNested.value, nestedDenom || parsedNested.denom);
    }

    // Support compendiums that store split currency values like {gp: 12, sp: 5}
    const currencies = ["pp", "gp", "ep", "sp", "cp"];
    let sumCp = 0;
    let hasAny = false;
    for (const cur of currencies) {
      const raw = value[cur];
      if (raw === null || raw === undefined || raw === "") continue;
      let amount = null;
      if (typeof raw === "number") {
        amount = raw;
      } else if (typeof raw === "string") {
        amount = parseNumericPriceToken(raw);
      }
      if (!Number.isFinite(amount)) continue;
      hasAny = true;
      sumCp += convertToCp(amount, cur);
    }
    if (hasAny) return Math.round(sumCp);
  }
  return null;
}

function parseNumericPriceToken(token) {
  let raw = String(token || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .trim();
  if (!raw) return Number.NaN;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    // Assume the right-most separator is decimal, the rest are thousands.
    if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    const decimalLike = /,\d{1,2}$/.test(raw);
    if (decimalLike) raw = raw.replace(",", ".");
    else raw = raw.replace(/,/g, "");
  } else if (hasDot) {
    const decimalLike = /\.\d{1,2}$/.test(raw);
    const groupedThousands = /^\d{1,3}(?:\.\d{3})+$/.test(raw);
    if (groupedThousands) {
      raw = raw.replace(/\./g, "");
    } else if (!decimalLike && raw.split(".").length > 2) {
      raw = raw.replace(/\./g, "");
    }
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Resolve budget range in copper pieces
 * @param {string} budget - Budget tier
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @returns {{min: number, max: number}}
 */
export function getBudgetPriceRange(budget, allowMagic = false) {
  const key = String(budget || "normal").toLowerCase();
  if (key === "elite" && allowMagic) {
    return BUDGET_RANGES.eliteMagic;
  }
  return BUDGET_RANGES[key] || BUDGET_RANGES.normal;
}

/**
 * Pick item by budget: first by explicit price range, then by percentile for variety
 * @param {Array} candidates - Array of candidates
 * @param {string} budget - Budget tier
 * @param {boolean} allowMagic - Whether magic items are allowed
 * @param {Function} priceFn - Function to get price from candidate
 * @returns {*} Selected candidate
 */
export function pickByBudget(candidates, budget, allowMagic, priceFn) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const getPrice = typeof priceFn === "function" ? priceFn : () => null;
  const priced = candidates
    .map((c) => ({ c, price: getPrice(c) }))
    .filter((p) => Number.isFinite(p.price));
  if (!priced.length) return pickRandom(candidates);

  const range = getBudgetPriceRange(budget, allowMagic);
  const inRange = priced.filter((p) => p.price >= range.min && p.price <= range.max);
  let budgetPool = inRange;
  if (!budgetPool.length) {
    // If nothing fits exactly, pick from nearest prices to budget bounds.
    const withDistance = priced.map((p) => {
      if (p.price < range.min) return { ...p, distance: range.min - p.price };
      if (p.price > range.max) return { ...p, distance: p.price - range.max };
      return { ...p, distance: 0 };
    });
    const minDistance = Math.min(...withDistance.map((p) => p.distance));
    budgetPool = withDistance
      .filter((p) => p.distance === minDistance)
      .map(({ c, price }) => ({ c, price }));
  }

  const sorted = budgetPool.sort((a, b) => a.price - b.price);
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

function normalizeLookupText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[`'’"]/g, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLookupAliasMap(groups) {
  const map = new Map();
  for (const group of groups || []) {
    const normalized = Array.from(
      new Set((group || []).map((entry) => normalizeLookupText(entry)).filter(Boolean))
    );
    for (const term of normalized) {
      const aliases = normalized.filter((entry) => entry !== term);
      if (!aliases.length) continue;
      const existing = map.get(term) || [];
      map.set(term, Array.from(new Set([...existing, ...aliases])));
    }
  }
  return map;
}
