/**
 * Encounter generation and balancing
 * @module encounter
 */

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

/**
 * Calculate NPC count for an encounter
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

  let base = partySize;
  if (difficulty === "easy") base = Math.max(1, partySize - 1);
  if (difficulty === "hard") base = partySize + 1;
  if (difficulty === "deadly") base = partySize + 2;

  if (partyLevel >= 11) base += 1;
  if (partyLevel >= 17) base += 1;

  return Math.max(1, Math.min(12, base));
}

/**
 * Build an encounter plan with tier and boss assignments
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

  let tier = getTierForLevel(partyLevel);
  if (difficulty === "easy") tier -= 1;
  if (difficulty === "deadly") tier += 1;

  // More NPCs = lower individual tier
  if (total >= 6) tier -= 1;
  if (total >= 10) tier -= 1;

  tier = Math.max(1, Math.min(4, tier));

  const plan = [];
  const bossCount = difficulty === "deadly" ? 1 : difficulty === "hard" ? 1 : 0;
  const bossIndex = total > 1 ? Math.floor(Math.random() * total) : 0;

  for (let i = 0; i < total; i++) {
    let entryTier = tier;
    // Add variety - some NPCs are weaker
    if (total >= 4 && Math.random() < 0.35) entryTier = Math.max(1, tier - 1);
    if (total >= 6 && Math.random() < 0.2) entryTier = Math.max(1, tier - 2);
    entryTier = Math.max(1, Math.min(4, entryTier));

    const isBoss = bossCount > 0 && i === bossIndex && partySize >= 3;
    plan.push({ tier: entryTier, importantNpc: isBoss });
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
