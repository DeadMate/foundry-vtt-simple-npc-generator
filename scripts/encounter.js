/**
 * Encounter generation and balancing
 * @module encounter
 */

import { MODULE_ID, CR_BY_TIER } from "./constants.js";

const SHOP_TYPE_FOLDER_LABEL_KEYS = {
  market: "ui.shop.folderTypeMarket",
  general: "ui.shop.folderTypeGeneral",
  alchemy: "ui.shop.folderTypeAlchemy",
  scrolls: "ui.shop.folderTypeScrolls",
  weapons: "ui.shop.folderTypeWeapons",
  armor: "ui.shop.folderTypeArmor",
  food: "ui.shop.folderTypeFood"
};

const LOOT_TYPE_FOLDER_LABEL_KEYS = {
  mixed: "ui.loot.folderTypeMixed",
  coins: "ui.loot.folderTypeCoins",
  gear: "ui.loot.folderTypeGear",
  consumables: "ui.loot.folderTypeConsumables",
  weapons: "ui.loot.folderTypeWeapons",
  armor: "ui.loot.folderTypeArmor",
  scrolls: "ui.loot.folderTypeScrolls"
};

function localizeModuleKey(key, fallback = "") {
  const fullKey = `${MODULE_ID}.${String(key || "").trim()}`;
  const localized = game.i18n?.localize?.(fullKey);
  if (localized && localized !== fullKey) return localized;
  return String(fallback || "").trim() || String(key || "").trim();
}

function sanitizeFolderSegment(input, fallback = "shop") {
  const base = String(input || "").trim();
  if (!base) return fallback;
  let safe = base.replace(/\s+/g, "-");
  try {
    safe = safe.replace(/[^\p{L}\p{N}_-]+/gu, "-");
  } catch {
    safe = safe.replace(/[^a-z0-9а-яё_-]+/gi, "-");
  }
  safe = safe.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return safe || fallback;
}

function escapeRegExp(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Get tier for a character level
 * @param {number} level - Character level (1-20)
 * @returns {number} Tier (1-4)
 */
export function getTierForLevel(level) {
  const lvl = Number(level) || 1;
  if (lvl <= 3) return 1;
  if (lvl <= 6) return 2;
  if (lvl <= 10) return 3;
  return 4;
}

/**
 * Get auto tier based on party level
 * @returns {number} Tier (1-4)
 */
export function getAutoTier() {
  const pcs = game.actors?.filter((a) => a.hasPlayerOwner && a.type === "character") || [];
  if (!pcs.length) return 1;

  const levels = pcs.map((a) => getActorLevel(a)).filter((n) => Number.isFinite(n));
  const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 1;

  if (avg <= 3) return 1;
  if (avg <= 6) return 2;
  if (avg <= 10) return 3;
  return 4;
}

/**
 * Get actor level
 * @param {Object} actor - Foundry Actor
 * @returns {number}
 */
export function getActorLevel(actor) {
  const level = actor.system?.details?.level ?? actor.system?.details?.cr ?? 1;
  return Number(level) || 1;
}

// ========== XP-Budget Encounter Balancing (DMG p.81-83) ==========

/**
 * XP thresholds per character level by difficulty (DMG p.82).
 * Index 0 is unused; index 1 = level 1, etc.
 */
const XP_THRESHOLDS = [
  null,
  /* 1*/ { easy: 25,  medium: 50,   hard: 75,   deadly: 100 },
  /* 2*/ { easy: 50,  medium: 100,  hard: 150,  deadly: 200 },
  /* 3*/ { easy: 75,  medium: 150,  hard: 225,  deadly: 400 },
  /* 4*/ { easy: 125, medium: 250,  hard: 375,  deadly: 500 },
  /* 5*/ { easy: 250, medium: 500,  hard: 750,  deadly: 1100 },
  /* 6*/ { easy: 300, medium: 600,  hard: 900,  deadly: 1400 },
  /* 7*/ { easy: 350, medium: 750,  hard: 1100, deadly: 1700 },
  /* 8*/ { easy: 450, medium: 900,  hard: 1400, deadly: 2100 },
  /* 9*/ { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  /*10*/ { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  /*11*/ { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  /*12*/ { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  /*13*/ { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  /*14*/ { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  /*15*/ { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  /*16*/ { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  /*17*/ { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  /*18*/ { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  /*19*/ { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  /*20*/ { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 }
];

/**
 * XP values by CR (DMG p.275).
 */
const CR_XP = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
  1: 200, 2: 450, 3: 700, 4: 1100,
  5: 1800, 6: 2300, 7: 2900, 8: 3900,
  9: 5000, 10: 5900
};

/**
 * Encounter multiplier by number of monsters (DMG p.82).
 * Returns the adjusted-XP multiplier for a group of N monsters.
 * @param {number} count - Number of monsters
 * @returns {number}
 */
function getEncounterMultiplier(count) {
  if (count <= 1) return 1;
  if (count === 2) return 1.5;
  if (count <= 6) return 2;
  if (count <= 10) return 2.5;
  if (count <= 14) return 3;
  return 4;
}

/**
 * Get the party's total XP threshold for a given difficulty.
 * @param {number} partyLevel
 * @param {number} partySize
 * @param {string} difficulty
 * @returns {number}
 */
function getPartyXpBudget(partyLevel, partySize, difficulty) {
  const lvl = Math.max(1, Math.min(20, partyLevel));
  const row = XP_THRESHOLDS[lvl];
  const perPlayer = row?.[difficulty] || row?.medium || 50;
  return perPlayer * partySize;
}

/**
 * Parse a CR string (e.g. "1/4") to a number.
 * @param {string} cr
 * @returns {number}
 */
function parseCr(cr) {
  const s = String(cr);
  if (s.includes("/")) {
    const [n, d] = s.split("/").map(Number);
    return d ? n / d : 0;
  }
  return Number(s) || 0;
}

/**
 * Get XP for a numeric CR value.
 * @param {number} cr
 * @returns {number}
 */
function getXpForCr(cr) {
  if (CR_XP[cr] !== undefined) return CR_XP[cr];
  // Find nearest lower
  const keys = Object.keys(CR_XP).map(Number).sort((a, b) => a - b);
  let best = keys[0];
  for (const k of keys) {
    if (k <= cr) best = k;
    else break;
  }
  return CR_XP[best] || 10;
}

/**
 * Pick a representative CR for a tier (middle of the CR range).
 * @param {number} tier
 * @returns {number}
 */
function getTypicalCrForTier(tier) {
  const table = CR_BY_TIER[tier] || CR_BY_TIER[1];
  // Use the middle entry for "typical" CR
  const mid = table[Math.floor(table.length / 2)];
  return parseCr(mid);
}

/**
 * Calculate NPC count for an encounter using XP budget.
 * Keeps the same function signature for backward compatibility.
 * @param {Object} options - Options
 * @param {number} options.partyLevel - Party level (1-20)
 * @param {number} options.partySize - Party size (1-8)
 * @param {string} options.difficulty - Difficulty (easy, medium, hard, deadly)
 * @returns {number} NPC count
 */
export function buildEncounterCount(options) {
  const partyLevel = Math.max(1, Math.min(20, Number(options?.partyLevel) || 1));
  const partySize = Math.max(1, Math.min(8, Number(options?.partySize) || 4));
  const difficulty = String(options?.difficulty || "medium").toLowerCase();

  const budget = getPartyXpBudget(partyLevel, partySize, difficulty);
  const tier = getTierForLevel(partyLevel);
  const typicalCr = getTypicalCrForTier(tier);
  const xpPerNpc = getXpForCr(typicalCr);

  if (xpPerNpc <= 0) return Math.max(1, partySize);

  // Iteratively find how many NPCs fit the budget with the encounter multiplier
  for (let n = 1; n <= 12; n++) {
    const adjustedXp = xpPerNpc * n * getEncounterMultiplier(n);
    if (adjustedXp > budget) {
      return Math.max(1, n - 1);
    }
  }

  return 12;
}

/**
 * Build an encounter plan with tier and boss assignments using XP budget.
 * Allocates CR/tier per NPC to fit within the party's XP budget,
 * with a boss NPC getting a higher tier/CR for hard/deadly encounters.
 * Keeps the same function signature for backward compatibility.
 * @param {number} count - Number of NPCs
 * @param {Object} options - Options
 * @param {number} options.partyLevel - Party level (1-20)
 * @param {number} options.partySize - Party size (1-8)
 * @param {string} options.difficulty - Difficulty (easy, medium, hard, deadly)
 * @returns {Array<{tier: number, importantNpc: boolean}>}
 */
export function buildEncounterPlan(count, options) {
  const total = Math.max(1, Number(count) || 1);
  const partyLevel = Math.max(1, Math.min(20, Number(options?.partyLevel) || 1));
  const partySize = Math.max(1, Math.min(8, Number(options?.partySize) || 4));
  const difficulty = String(options?.difficulty || "medium").toLowerCase();

  const budget = getPartyXpBudget(partyLevel, partySize, difficulty);
  const multiplier = getEncounterMultiplier(total);
  // Effective per-NPC XP budget after multiplier
  const perNpcXp = total > 0 ? budget / (total * multiplier) : budget;

  const baseTier = getTierForLevel(partyLevel);
  const hasBoss = (difficulty === "hard" || difficulty === "deadly") && total > 1 && partySize >= 3;
  const bossIndex = hasBoss ? 0 : -1;

  const plan = [];

  for (let i = 0; i < total; i++) {
    const isBoss = i === bossIndex;

    if (isBoss) {
      // Boss gets higher tier — spend ~40% of remaining budget on them
      const bossTier = Math.min(4, baseTier + 1);
      plan.push({ tier: bossTier, importantNpc: true });
    } else {
      // Find the tier whose typical CR XP fits within the per-NPC budget
      let tier = baseTier;
      for (let t = 4; t >= 1; t--) {
        const cr = getTypicalCrForTier(t);
        if (getXpForCr(cr) <= perNpcXp * 1.15) {
          tier = t;
          break;
        }
      }
      // Add slight variety: ~25% chance of one tier lower for groups of 4+
      if (total >= 4 && Math.random() < 0.25) {
        tier = Math.max(1, tier - 1);
      }
      tier = Math.max(1, Math.min(4, tier));
      plan.push({ tier, importantNpc: false });
    }
  }

  return plan;
}

/**
 * Ensure an encounter folder exists, creating one if needed
 * @returns {Promise<string|null>} Folder ID or null
 */
export async function ensureEncounterFolder() {
  if (!game.user?.isGM || typeof Folder?.create !== "function") return null;
  const folders = (game.folders || []).filter((folder) => folder.type === "Actor");
  const used = new Set();
  for (const folder of folders) {
    const match = String(folder.name || "").match(/^Encounter-(\d+)$/);
    if (match) used.add(Number(match[1]));
  }
  let next = 1;
  while (used.has(next)) next += 1;
  const name = `Encounter-${next}`;
  try {
    const created = await Folder.create({ name, type: "Actor" });
    return created?.id || null;
  } catch {
    return null;
  }
}

/**
 * Ensure a shop folder exists, creating one if needed
 * @param {string} [shopType] - Shop type key for folder naming
 * @returns {Promise<string|null>} Folder ID or null
 */
export async function ensureShopFolder(shopType = "shop") {
  if (!game.user?.isGM || typeof Folder?.create !== "function") return null;
  const folders = (game.folders || []).filter((folder) => folder.type === "Actor");
  const normalizedType = String(shopType || "shop").trim().toLowerCase();
  const typeLabelKey = SHOP_TYPE_FOLDER_LABEL_KEYS[normalizedType];
  const localizedType = typeLabelKey
    ? localizeModuleKey(typeLabelKey, normalizedType)
    : normalizedType;
  const localizedPrefix = localizeModuleKey("ui.shop.folderPrefix", "Shop");

  const safePrefix = sanitizeFolderSegment(localizedPrefix, "Shop");
  const safeType = sanitizeFolderSegment(localizedType, "shop");

  let next = 1;
  const re = new RegExp(`^${escapeRegExp(safePrefix)}-${escapeRegExp(safeType)}-(\\d+)$`, "i");
  for (const folder of folders) {
    const match = String(folder.name || "").match(re);
    if (!match) continue;
    const id = Number(match[1]);
    if (Number.isFinite(id) && id >= next) next = id + 1;
  }
  const name = `${safePrefix}-${safeType}-${next}`;
  try {
    const created = await Folder.create({ name, type: "Actor" });
    return created?.id || null;
  } catch {
    return null;
  }
}

/**
 * Ensure a loot folder exists, creating one if needed
 * @param {string} [lootType] - Loot type key for folder naming
 * @returns {Promise<string|null>} Folder ID or null
 */
export async function ensureLootFolder(lootType = "loot") {
  if (!game.user?.isGM || typeof Folder?.create !== "function") return null;
  const folders = (game.folders || []).filter((folder) => folder.type === "Actor");
  const normalizedType = String(lootType || "loot").trim().toLowerCase();
  const typeLabelKey = LOOT_TYPE_FOLDER_LABEL_KEYS[normalizedType];
  const localizedType = typeLabelKey
    ? localizeModuleKey(typeLabelKey, normalizedType)
    : normalizedType;
  const localizedPrefix = localizeModuleKey("ui.loot.folderPrefix", "Loot");

  const safePrefix = sanitizeFolderSegment(localizedPrefix, "Loot");
  const safeType = sanitizeFolderSegment(localizedType, "loot");

  let next = 1;
  const re = new RegExp(`^${escapeRegExp(safePrefix)}-${escapeRegExp(safeType)}-(\\d+)$`, "i");
  for (const folder of folders) {
    const match = String(folder.name || "").match(re);
    if (!match) continue;
    const id = Number(match[1]);
    if (Number.isFinite(id) && id >= next) next = id + 1;
  }
  const name = `${safePrefix}-${safeType}-${next}`;
  try {
    const created = await Folder.create({ name, type: "Actor" });
    return created?.id || null;
  } catch {
    return null;
  }
}
