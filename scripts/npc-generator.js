/**
 * NPC generation logic
 * @module npc-generator
 */

import {
  CR_BY_TIER,
  PROF_BY_TIER,
  BASE_AC,
  HP_BASE,
  HP_PER_TIER,
  HP_VARIANCE_PER_TIER,
  HP_BOSS_BONUS,
  HP_MINIMUM,
  MAGIC_ITEM_CHANCE,
  getMonsterStatsByCr,
  BOSS_HP_MULTIPLIER,
  BOSS_AC_BONUS
} from "./constants.js";
import { DATA_CACHE } from "./data-loader.js";
import {
  pickRandom,
  pickRandomN,
  pickRandomOr,
  randInt,
  chance,
  cloneData,
  toItemData,
  escapeHtml
} from "./utils.js";
import {
  getPacks,
  cloneItemData,
  ensureActivities,
  getTokenImageForNpc,
  isAllowedItemEntry,
  isAllowedItemDoc,
  isWithinBudget,
  normalizeArmorItems,
  getRandomItemFromPacks,
  getRandomItemFromAllPacksWithBudget,
  getRandomItemByKeywordsFromAllPacksWithBudget,
  getRandomItemByKeywords,
  getRandomItemByKeywordsWithBudget,
  getItemByNameFromPacks,
  addUniqueItem,
  pickItemFromKeywords
} from "./items.js";
import {
  getCachedDoc,
  getRandomCachedDocByKeywords,
  getRandomCachedDocByKeywordsWithBudget,
  getCachedDocsForPacks,
  getPackIndex,
  getCachedDocByName,
  collectAllItemPackNames
} from "./cache.js";
import { getSearchStrings } from "./utils.js";
import { t } from "./i18n.js";

const LOOKUP_CACHE_MAX_CLASS_KEYS = 128;
const LOOKUP_CACHE_MAX_AI_INDEX_KEYS = 48;
const AI_ITEM_RESOLVE_MAX_CONCURRENCY = 4;
const NPC_GENERATOR_LOOKUP_CACHE = {
  source: null,
  spellPackNamesKey: "",
  spellPackNames: null,
  classFeatureCandidatesByKey: new Map(),
  aiLookupIndexByKey: new Map()
};

function ensureNpcGeneratorLookupCacheState() {
  const source = DATA_CACHE.compendiumCache?.packs || DATA_CACHE.compendiumLists || null;
  if (NPC_GENERATOR_LOOKUP_CACHE.source === source) return;
  NPC_GENERATOR_LOOKUP_CACHE.source = source;
  NPC_GENERATOR_LOOKUP_CACHE.spellPackNamesKey = "";
  NPC_GENERATOR_LOOKUP_CACHE.spellPackNames = null;
  NPC_GENERATOR_LOOKUP_CACHE.classFeatureCandidatesByKey.clear();
  NPC_GENERATOR_LOOKUP_CACHE.aiLookupIndexByKey.clear();
}

/**
 * Generate an NPC with all stats and traits
 * @param {Object} options - Generation options
 * @returns {Object} Generated NPC data
 */
export function generateNpc(options) {
  const {
    tier,
    archetype,
    culture,
    gender,
    race,
    budget,
    includeLoot,
    includeSecret,
    includeHook,
    importantNpc,
    usedNames
  } = options;
  const names = DATA_CACHE.names;
  const traits = DATA_CACHE.traits;

  const name = buildUniqueName(names, culture, importantNpc, usedNames, gender);

  const appearance = pickRandomN(traits?.appearance || [], 2 + randInt(0, 2));
  const speech = pickRandomOr(traits?.speech, "Plainspoken");
  const motivation = pickRandomOr(traits?.motivations, "Survival");
  const secret = includeSecret ? pickRandomOr(traits?.secrets, null) : null;
  const hook = includeHook ? pickRandomOr(traits?.hooks, null) : null;
  const quirk = pickRandomOr(traits?.quirks, "Unremarkable");
  const className = getClassForArchetype(archetype);

  const abilities = applyTierToAbilities(varyBaseAbilities(archetype.baseAbilities), tier, importantNpc);
  const prime = getPrimeAbilities(abilities);

  const cr = rollCrByTier(tier);
  const crStats = getMonsterStatsByCr(cr);

  const hpVariance = randInt(0, Math.max(1, Math.round(crStats.hp * 0.15)));
  const baseHp = crStats.hp + hpVariance;
  const hp = Math.max(HP_MINIMUM, importantNpc ? Math.round(baseHp * BOSS_HP_MULTIPLIER) : baseHp);
  const ac = Math.min(22, importantNpc ? crStats.ac + BOSS_AC_BONUS : crStats.ac);
  const speed = 30;

  const prof = crStats.prof;

  const loot = includeLoot ? buildLoot(archetype, tier) : null;

  return {
    name,
    archetype,
    className,
    attackStyle: archetype?.attackStyle || "",
    archetypeTags: Array.isArray(archetype?.tags) ? archetype.tags.slice() : [],
    tier,
    cr,
    prof,
    ac,
    hp,
    speed,
    culture,
    gender: normalizeGenderValue(gender),
    race,
    budget,
    abilities,
    prime,
    appearance,
    speech,
    motivation,
    secret,
    hook,
    quirk,
    loot,
    includeLoot,
    includeSecret,
    includeHook,
    importantNpc
  };
}

/**
 * Build unique name for NPC
 * @param {Object} names - Names data
 * @param {string} culture - Culture name
 * @param {boolean} importantNpc - Whether NPC is a boss
 * @param {Set<string>} usedNames - Set of already used names
 * @param {string} gender - Gender option (random/male/female)
 * @returns {string}
 */
export function buildUniqueName(names, culture, importantNpc, usedNames, gender = "random") {
  const tries = 12;
  const genderValue = normalizeGenderValue(gender);
  const namePool = getCultureNamePoolByGender(names, culture, genderValue);
  for (let i = 0; i < tries; i++) {
    const firstName = pickRandomOr(namePool, "Nameless");
    const surname = chance(0.6) ? pickRandomOr(names?.surnames, "") : "";
    const title = importantNpc && chance(0.4) ? pickRandomOr(names?.titles, "") : "";
    const full = [title, firstName, surname].filter(Boolean).join(" ");
    if (!usedNames || !usedNames.has(full)) {
      if (usedNames) usedNames.add(full);
      return full;
    }
  }
  const fallback = `Nameless ${randInt(1, 999)}`;
  if (usedNames) usedNames.add(fallback);
  return fallback;
}

function getCultureNamePoolByGender(names, culture, gender) {
  const selectedCulture = String(culture || "").trim();
  const cultureEntry = names?.cultures?.[selectedCulture];
  if (!cultureEntry) return [];

  if (Array.isArray(cultureEntry)) {
    return cultureEntry;
  }

  if (cultureEntry && typeof cultureEntry === "object") {
    const buckets = [];
    if (gender === "male") {
      buckets.push(cultureEntry.male, cultureEntry.m, cultureEntry.masculine);
    } else if (gender === "female") {
      buckets.push(cultureEntry.female, cultureEntry.f, cultureEntry.feminine);
    } else {
      buckets.push(
        cultureEntry.random,
        cultureEntry.any,
        cultureEntry.all,
        cultureEntry.male,
        cultureEntry.female
      );
    }
    const merged = buckets.flatMap((bucket) => (Array.isArray(bucket) ? bucket : []));
    if (merged.length) return merged;
  }

  const maleByCulture = names?.culturesMale?.[selectedCulture];
  const femaleByCulture = names?.culturesFemale?.[selectedCulture];
  if (gender === "male" && Array.isArray(maleByCulture) && maleByCulture.length) return maleByCulture;
  if (gender === "female" && Array.isArray(femaleByCulture) && femaleByCulture.length) return femaleByCulture;
  if (Array.isArray(maleByCulture) && Array.isArray(femaleByCulture)) {
    return [...maleByCulture, ...femaleByCulture];
  }
  return [];
}

function normalizeGenderValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["male", "m", "man"].includes(normalized)) return "male";
  if (["female", "f", "woman"].includes(normalized)) return "female";
  return "random";
}

/**
 * Apply tier bonuses to abilities
 * @param {Object} abilities - Base abilities
 * @param {number} tier - Tier level
 * @param {boolean} importantNpc - Whether NPC is a boss
 * @returns {Object}
 */
export function applyTierToAbilities(abilities, tier, importantNpc) {
  const bonus = (tier - 1) * 2 + (importantNpc ? 2 : 0);
  const ordered = Object.entries(abilities).sort((a, b) => b[1] - a[1]);

  let remaining = bonus;
  for (let i = 0; i < ordered.length && remaining > 0; i++) {
    const key = ordered[i][0];
    const add = Math.min(2, remaining);
    abilities[key] += add;
    remaining -= add;
  }

  return abilities;
}

/**
 * Add variance to base abilities
 * @param {Object} base - Base abilities
 * @returns {Object}
 */
export function varyBaseAbilities(base) {
  const abilities = { ...base };
  const keys = Object.keys(abilities);

  // Small random jitter so NPCs aren't identical
  for (const key of keys) {
    abilities[key] += randInt(-1, 1);
  }

  // Randomly shift a couple of points between stats
  const shifts = 2 + randInt(0, 2);
  for (let i = 0; i < shifts; i++) {
    const from = pickRandom(keys);
    const to = pickRandom(keys);
    if (from === to) continue;
    if (abilities[from] > 6) {
      abilities[from] -= 1;
      abilities[to] += 1;
    }
  }

  // Clamp to a sane range
  for (const key of keys) {
    abilities[key] = Math.max(6, Math.min(18, abilities[key]));
  }

  return abilities;
}

/**
 * Get prime (highest) abilities
 * @param {Object} abilities - Ability scores
 * @returns {string[]}
 */
export function getPrimeAbilities(abilities) {
  return Object.entries(abilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => key);
}

/**
 * Get proficiency bonus for tier
 * @param {number} tier - Tier level
 * @returns {number}
 */
export function getProfBonus(tier) {
  return PROF_BY_TIER[tier] || 2;
}

/**
 * Roll a CR based on tier
 * @param {number} tier - Tier level
 * @returns {number}
 */
export function rollCrByTier(tier) {
  const table = CR_BY_TIER[tier] || ["1"];
  const value = pickRandom(table);
  if (value.includes("/")) {
    const [num, den] = value.split("/").map((n) => Number(n));
    return den ? num / den : 0;
  }
  return Number(value) || 0;
}

/**
 * Check if NPC should be allowed magic items
 * @param {Object} npc - NPC data
 * @returns {boolean}
 */
export function shouldAllowMagicItem(npc) {
  if (!npc) return false;
  if (npc.importantNpc) return chance(MAGIC_ITEM_CHANCE.boss);
  return chance(MAGIC_ITEM_CHANCE[npc.tier] || 0);
}

/**
 * Build loot for NPC
 * @param {Object} archetype - Archetype data
 * @param {number} tier - Tier level
 * @returns {Object}
 */
export function buildLoot(archetype, tier) {
  const lootData = DATA_CACHE.loot;
  if (!lootData || !lootData.coins) {
    return {
      coins: { pp: 0, gp: randInt(0, 10), ep: 0, sp: randInt(0, 20), cp: randInt(0, 20) },
      items: []
    };
  }

  const coinRange = lootData.coins[String(tier)] || { gp: [0, 10], sp: [0, 20] };

  const coins = {
    pp: 0,
    gp: randInt(coinRange.gp[0], coinRange.gp[1]),
    ep: 0,
    sp: randInt(coinRange.sp[0], coinRange.sp[1]),
    cp: randInt(0, 10)
  };

  const items = [];
  if (Array.isArray(lootData.commonItems) && lootData.commonItems.length) {
    const item = pickRandom(lootData.commonItems);
    if (item) items.push(item);
  }
  if (lootData.tables?.[archetype.lootTable]?.length && chance(0.6)) {
    const item = pickRandom(lootData.tables[archetype.lootTable]);
    if (item) items.push(item);
  }
  if (tier >= 2 && Array.isArray(lootData.specialItems) && lootData.specialItems.length && chance(0.4)) {
    const item = pickRandom(lootData.specialItems);
    if (item) items.push(item);
  }

  return { coins, items };
}

/**
 * Build actor data from NPC
 * @param {Object} npc - Generated NPC
 * @param {string|null} folderId - Folder ID
 * @returns {Promise<Object>}
 */
export async function buildActorData(npc, folderId = null) {
  const tokenImg = String(npc?.tokenImg || "").trim() || getTokenImageForNpc(npc);

  const biography = buildBiography(npc);
  const ALL_ALIGNMENTS = [
    "Lawful Good", "Neutral Good", "Chaotic Good",
    "Lawful Neutral", "Neutral", "Chaotic Neutral",
    "Lawful Evil", "Neutral Evil", "Chaotic Evil"
  ];
  const alignPool = npc.archetype?.alignmentPool;
  const alignment = Array.isArray(alignPool) && alignPool.length
    ? pickRandom(alignPool)
    : pickRandom(ALL_ALIGNMENTS);

  const abilityData = {};
  for (const [key, value] of Object.entries(npc.abilities)) {
    abilityData[key] = { value };
  }

  const skillsData = buildSkillsData(npc.archetype.skills);

  const items = [];
  const weaponItem = await buildWeaponItem(npc);
  items.push(weaponItem);
  const ammoItem = await buildAmmoItemForWeapon(weaponItem, npc);
  if (ammoItem) items.push(ammoItem);
  items.push(...(await buildRoleAbilityItems(npc)));
  items.push(...(await buildRoleItems(npc)));

  // Combat features: Multiattack, Legendary Actions, Legendary Resistance
  items.push(...(await buildCombatFeatureItems(npc)));

  if (npc.loot) {
    const lootItems = [];
    for (const name of npc.loot.items) {
      lootItems.push(await buildLootItem(name, npc));
    }
    lootItems.push(...(await buildRandomLootExtras(npc, lootItems)));
    items.push(...lootItems);
  }

  normalizeArmorItems(items);

  // Compute ability-based bonuses for NPC combat effectiveness
  const primeAbility = npc.prime?.[0] || "str";
  const primeScore = npc.abilities?.[primeAbility] || 10;
  const primeMod = Math.floor((primeScore - 10) / 2);
  const attackBonus = primeMod + npc.prof;
  const saveDc = 8 + primeMod + npc.prof;

  // Saving throw proficiencies by class
  const saveProficiencies = getSavingThrowProficiencies(npc.className);

  const actorData = {
    name: npc.name,
    type: "npc",
    folder: folderId || undefined,
    img: tokenImg,
    prototypeToken: {
      name: npc.name,
      img: tokenImg,
      displayName: 20,
      disposition: 0
    },
    system: {
      abilities: applyAbilitySaveProficiencies(abilityData, saveProficiencies),
      skills: skillsData,
      attributes: {
        ac: { value: npc.ac },
        hp: { value: npc.hp, max: npc.hp, temp: 0 },
        movement: { walk: npc.speed },
        prof: npc.prof
      },
      bonuses: {
        mwak: { attack: `+${attackBonus}`, damage: `+${primeMod}` },
        rwak: { attack: `+${attackBonus}`, damage: `+${primeMod}` },
        msak: { attack: `+${attackBonus}`, damage: "" },
        rsak: { attack: `+${attackBonus}`, damage: "" },
        spell: { dc: String(saveDc) }
      },
      details: {
        cr: npc.cr,
        alignment,
        race: npc.race,
        type: { value: "humanoid", subtype: "" },
        biography: { value: biography },
        spellLevel: npc.spellCasterLevel || 0
      },
      traits: {
        size: "med",
        languages: { value: [] }
      },
      currency: npc.loot ? npc.loot.coins : { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
    },
    items
  };

  // Add spell slots for caster NPCs
  if (npc.archetype?.tags?.includes("caster")) {
    actorData.system.spells = buildSpellSlots(npc.tier, npc.importantNpc);
  }

  return actorData;
}

/**
 * Build actor data from AI full blueprint (resolves named content via compendiums)
 * @param {Object} blueprint - AI full NPC blueprint
 * @param {string|null} folderId - Folder ID
 * @param {Object} [options]
 * @param {boolean} [options.collectMatchDetails=false] - Include per-item compendium match details
 * @returns {Promise<{actorData: Object, resolvedItems: number, missingItems: number, matchDetails: Object[]}>}
 */
export async function buildActorDataFromAiBlueprint(blueprint, folderId = null, options = {}) {
  const npc = normalizeAiBlueprintForActor(blueprint);
  const { items, resolvedItems, missingItems, matchDetails } = await resolveAiBlueprintItems(npc, options);

  if (!items.some((item) => String(item?.type || "").toLowerCase() === "weapon")) {
    const fallbackWeapon = await buildWeaponItem(npc);
    if (fallbackWeapon) items.push(fallbackWeapon);
  }

  // Combat features: Multiattack, Legendary Actions, Legendary Resistance
  items.push(...(await buildCombatFeatureItems(npc)));

  normalizeArmorItems(items);

  const biography = buildBiography(npc);
  const AI_ALL_ALIGNMENTS = [
    "Lawful Good", "Neutral Good", "Chaotic Good",
    "Lawful Neutral", "Neutral", "Chaotic Neutral",
    "Lawful Evil", "Neutral Evil", "Chaotic Evil"
  ];
  const aiAlignPool = npc.archetype?.alignmentPool;
  const alignment = String(npc.alignment || "").trim() ||
    (Array.isArray(aiAlignPool) && aiAlignPool.length ? pickRandom(aiAlignPool) : pickRandom(AI_ALL_ALIGNMENTS));

  const abilityData = {};
  for (const [key, value] of Object.entries(npc.abilities || {})) {
    abilityData[key] = { value: Number(value) || 10 };
  }
  const skillsData = buildSkillsData(npc.skillIds || npc.archetype.skills || []);

  const tokenImg = String(npc?.tokenImg || "").trim() || getTokenImageForNpc(npc);

  // Compute ability-based bonuses for AI NPC
  const primeAbility = npc.prime?.[0] || "str";
  const primeScore = npc.abilities?.[primeAbility] || 10;
  const primeMod = Math.floor((primeScore - 10) / 2);
  const attackBonus = primeMod + npc.prof;
  const saveDc = 8 + primeMod + npc.prof;

  const className = npc.className || "Fighter";
  const saveProficiencies = getSavingThrowProficiencies(className);

  const actorData = {
    name: npc.name,
    type: "npc",
    folder: folderId || undefined,
    img: tokenImg,
    prototypeToken: {
      name: npc.name,
      img: tokenImg,
      displayName: 20,
      disposition: 0
    },
    system: {
      abilities: applyAbilitySaveProficiencies(abilityData, saveProficiencies),
      skills: skillsData,
      attributes: {
        ac: { value: npc.ac },
        hp: { value: npc.hp, max: npc.hp, temp: 0 },
        movement: { walk: npc.speed },
        prof: npc.prof
      },
      bonuses: {
        mwak: { attack: `+${attackBonus}`, damage: `+${primeMod}` },
        rwak: { attack: `+${attackBonus}`, damage: `+${primeMod}` },
        msak: { attack: `+${attackBonus}`, damage: "" },
        rsak: { attack: `+${attackBonus}`, damage: "" },
        spell: { dc: String(saveDc) }
      },
      details: {
        cr: npc.cr,
        alignment,
        race: npc.race,
        type: { value: "humanoid", subtype: "" },
        biography: { value: biography },
        spellLevel: 0
      },
      traits: {
        size: "med",
        languages: { value: [] }
      },
      currency: npc.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
    },
    items
  };

  // Add spell slots if AI NPC is a caster
  const isCasterAi = npc.archetypeTags?.includes("caster") || npc.archetype?.tags?.includes("caster");
  if (isCasterAi) {
    actorData.system.spells = buildSpellSlots(npc.tier, npc.importantNpc);
  }

  return { actorData, resolvedItems, missingItems, matchDetails };
}

function normalizeAiBlueprintForActor(blueprint) {
  const source = blueprint && typeof blueprint === "object" ? blueprint : {};
  const tier = clampRange(source.tier, 1, 4, 1);
  const attackStyle = normalizeAttackStyle(source.attackStyle);
  const skillIds = normalizeSkillIdsForActor(source.skillIds || source.skills);
  const tags = normalizeTagListForActor(source.archetypeTags || source.tags, attackStyle);
  const className = String(source.className || source.class || getClassForArchetype({ tags }) || "Fighter").trim() || "Fighter";
  const archetypeName =
    String(source.archetypeName || source.archetype?.name || `${className} Operative`).trim() ||
    `${className} Operative`;

  const abilities = normalizeAbilityScoresForActor(source.abilities || source.stats, tier);
  const aiItemSource = source.items && typeof source.items === "object" && !Array.isArray(source.items)
    ? { ...source, ...source.items }
    : source;
  const personality = String(source.personality || "").trim();
  const description = String(source.description || "").trim();
  const appearanceRaw = normalizeStringArrayForActor(source.appearance, 4, 100, []);
  const appearanceFromDescription = extractAppearanceFromDescriptionForActor(description);
  const appearance = appearanceRaw.length
    ? appearanceRaw
    : normalizeStringArrayForActor(appearanceFromDescription, 4, 100, ["steady gaze", "travel-worn outfit"]);
  const personalityLine = firstSentenceForActor(personality) || firstSentenceForActor(description);

  return {
    name: String(source.name || "Nameless").trim() || "Nameless",
    archetype: {
      id: "ai-full",
      name: archetypeName,
      attackStyle,
      tags,
      skills: skillIds,
      baseAbilities: cloneData(abilities)
    },
    className,
    attackStyle,
    archetypeTags: tags,
    tier,
    cr: normalizeCrForActor(source.cr, tier),
    prof: clampRange(source.prof, 2, 6, getMonsterStatsByCr(normalizeCrForActor(source.cr, tier)).prof),
    ac: clampRange(source.ac, 10, 24, getMonsterStatsByCr(normalizeCrForActor(source.cr, tier)).ac),
    hp: clampRange(source.hp, 4, 400, getMonsterStatsByCr(normalizeCrForActor(source.cr, tier)).hp),
    speed: parseSpeedFeetForActor(source.speed, 30),
    culture: String(source.culture || "").trim(),
    alignment: String(source.alignment || "").trim(),
    race: String(source.race || "Humanoid").trim() || "Humanoid",
    budget: String(source.budget || "normal").trim() || "normal",
    abilities,
    prime: getPrimeAbilities(abilities),
    appearance,
    speech: String(source.speech || personalityLine || "Speaks with measured confidence.").trim(),
    motivation: String(source.motivation || personalityLine || "Pursues a practical objective with urgency.").trim(),
    secret: source.secret ? String(source.secret).trim() : null,
    hook: source.hook ? String(source.hook).trim() : null,
    quirk: String(source.quirk || personalityLine || "Keeps strict routines in tense moments.").trim(),
    rumor: source.rumor ? String(source.rumor).trim() : null,
    mannerism: source.mannerism ? String(source.mannerism).trim() : null,
    currency: normalizeCurrencyForActor(source.currency),
    includeLoot: source.includeLoot !== false,
    includeSecret: source.includeSecret !== false,
    includeHook: source.includeHook !== false,
    importantNpc: !!source.importantNpc,
    tokenImg: String(source.tokenImg || "").trim() || "",
    aiItems: normalizeAiItemGroups(source.aiItems || aiItemSource)
  };
}

async function resolveAiBlueprintItems(npc, options = {}) {
  const aiItems = npc.aiItems || {};
  const budget = npc.budget || "normal";
  const collectMatchDetails = options?.collectMatchDetails === true;
  const allGearPacks = uniquePackNames([...getPacks("weapons"), ...getPacks("loot")]);
  const featurePacks = uniquePackNames([...getPacks("classFeatures"), ...getPacks("features")]);
  const groups = [
    {
      key: "weapons",
      names: aiItems.weapons,
      packs: getPacks("weapons"),
      allowedTypes: ["weapon", "equipment"],
      equip: true
    },
    {
      key: "armor",
      names: aiItems.armor,
      packs: allGearPacks,
      allowedTypes: ["equipment"],
      equip: true
    },
    {
      key: "equipment",
      names: aiItems.equipment,
      packs: allGearPacks,
      allowedTypes: ["weapon", "equipment", "loot", "consumable", "tool"]
    },
    {
      key: "consumables",
      names: aiItems.consumables,
      packs: allGearPacks,
      allowedTypes: ["weapon", "consumable", "loot", "equipment", "tool"]
    },
    {
      key: "loot",
      names: aiItems.loot,
      packs: allGearPacks,
      allowedTypes: ["weapon", "loot", "consumable", "equipment", "tool"]
    },
    {
      key: "spells",
      names: aiItems.spells,
      packs: getPacks("spells"),
      allowedTypes: ["spell"]
    },
    {
      key: "features",
      names: aiItems.features,
      packs: featurePacks,
      allowedTypes: ["feat"],
      ensureFeatureActivities: true
    }
  ];

  const items = [];
  const addedNames = new Set();
  const matchDetails = [];
  let resolvedItems = 0;
  let missingItems = 0;

  const tasks = [];
  for (const group of groups) {
    for (const rawEntry of group.names || []) {
      const itemRef = normalizeAiItemReference(rawEntry);
      if (!itemRef?.name) continue;
      tasks.push({ group, itemRef });
    }
  }

  const taskResults = await mapWithConcurrencyPreserveOrder(
    tasks,
    AI_ITEM_RESOLVE_MAX_CONCURRENCY,
    async ({ group, itemRef }) => ({
      group,
      itemRef,
      resolved: await resolveAiNamedItem(itemRef, group, budget)
    })
  );

  for (const task of taskResults) {
    const { group, itemRef, resolved } = task || {};
    if (!resolved?.item) {
      missingItems += 1;
      if (collectMatchDetails) {
        matchDetails.push({
          group: group?.key || "items",
          status: "missing",
          requested: String(itemRef?.name || "").trim(),
          lookup: String(itemRef?.lookup || "").trim(),
          matchedName: "",
          matchedType: "",
          matchedPack: "",
          strategy: ""
        });
      }
      continue;
    }

    const item = resolved.item;
    const dedupeName = String(item.name || "").trim().toLowerCase();
    if (!dedupeName || addedNames.has(dedupeName)) {
      if (collectMatchDetails) {
        matchDetails.push({
          group: group?.key || "items",
          status: "duplicate",
          requested: String(itemRef?.name || "").trim(),
          lookup: String(itemRef?.lookup || "").trim(),
          matchedName: String(resolved?.meta?.matchedName || item?.name || "").trim(),
          matchedType: String(resolved?.meta?.matchedType || item?.type || "").trim(),
          matchedPack: String(resolved?.meta?.matchedPack || "").trim(),
          strategy: String(resolved?.meta?.strategy || "").trim()
        });
      }
      continue;
    }
    addedNames.add(dedupeName);
    items.push(item);
    resolvedItems += 1;
    if (collectMatchDetails) {
      matchDetails.push({
        group: group?.key || "items",
        status: "resolved",
        requested: String(itemRef?.name || "").trim(),
        lookup: String(itemRef?.lookup || "").trim(),
        matchedName: String(resolved?.meta?.matchedName || item?.name || "").trim(),
        matchedType: String(resolved?.meta?.matchedType || item?.type || "").trim(),
        matchedPack: String(resolved?.meta?.matchedPack || "").trim(),
        strategy: String(resolved?.meta?.strategy || "").trim()
      });
    }
  }

  return { items, resolvedItems, missingItems, matchDetails };
}

async function mapWithConcurrencyPreserveOrder(items, concurrency, worker) {
  const source = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, source.length));
  if (!limit) return [];

  const out = new Array(source.length);
  let cursor = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= source.length) return;
      out[index] = await worker(source[index], index);
    }
  });
  await Promise.all(runners);
  return out;
}

async function resolveAiNamedItem(itemRef, group, budget) {
  const packs = Array.isArray(group?.packs) ? group.packs : [];
  const allowedTypes = Array.isArray(group?.allowedTypes) ? group.allowedTypes : [];
  if (!packs.length || !allowedTypes.length) return null;

  const lookupSeeds = [itemRef.name, itemRef.lookup]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const nameCandidates = buildLookupNameCandidates(lookupSeeds);
  if (!nameCandidates.length) return null;

  const cachedLocalized = pickPreferredCachedAiItemByNames(itemRef, packs, allowedTypes, budget);
  if (cachedLocalized) {
    return prepareResolvedAiItem(cachedLocalized, group, { strategy: "cached-localized" });
  }

  for (const candidate of nameCandidates) {
    const exact = await getItemByNameFromPacks(packs, candidate);
    if (exact && allowedTypes.includes(String(exact.type || "").toLowerCase())) {
      return prepareResolvedAiItem(exact, group, { strategy: "exact-pack-name" });
    }
  }

  for (const candidate of nameCandidates) {
    const cachedExact = getCachedDocByName(packs, candidate);
    if (cachedExact && allowedTypes.includes(String(cachedExact.type || "").toLowerCase())) {
      return prepareResolvedAiItem(cachedExact, group, { strategy: "cached-exact-name" });
    }
  }

  const keywords = Array.from(
    new Set(nameCandidates.flatMap((candidate) => buildLookupKeywordsFromName(candidate)))
  );
  if (!keywords.length) return null;
  const strictKeywords = buildLookupKeywordsFromName(itemRef.lookup || itemRef.name);
  const minKeywordMatches = strictKeywords.length >= 2 ? 2 : 1;
  const ammoLike = isAmmoLikeItemRequest(itemRef.lookup || itemRef.name);

  const cachedByKeywords = pickBestCachedAiItemByKeywords(
    lookupSeeds,
    packs,
    allowedTypes,
    keywords,
    budget
  );
  if (cachedByKeywords) {
    return prepareResolvedAiItem(cachedByKeywords, group, { strategy: "cached-keywords" });
  }

  const fuzzy = await getRandomItemByKeywordsFromAllPacksWithBudget(
    packs,
    keywords,
    (entry) => {
      const type = String(entry?.type || "").toLowerCase();
      if (!allowedTypes.includes(type)) return false;

      const haystack = getSearchStrings(entry);
      const keywordPool = strictKeywords.length ? strictKeywords : keywords;
      if (countKeywordHits(haystack, keywordPool) < minKeywordMatches) return false;

      if (ammoLike && !isAllowedItemEntry(entry, false)) return false;
      return true;
    },
    budget,
    !ammoLike
  );
  if (!fuzzy) return null;
  return prepareResolvedAiItem(fuzzy, group, { strategy: "fuzzy-keywords" });
}

function prepareResolvedAiItem(itemDoc, group, meta = {}) {
  const item = cloneItemData(toItemData(itemDoc));
  if (!item) return null;

  if (group?.equip && item.system?.equipped !== undefined) item.system.equipped = true;
  if (group?.equip && item.type === "weapon" && item.system?.proficient !== undefined) {
    item.system.proficient = true;
  }
  if (group?.ensureFeatureActivities && item.type === "feat") {
    return {
      item: ensureActivities(item),
      meta: {
        matchedName: String(itemDoc?.name || item?.name || "").trim(),
        matchedType: String(itemDoc?.type || item?.type || "").trim(),
        matchedPack: getResolvedItemSourcePack(itemDoc),
        strategy: String(meta?.strategy || "").trim()
      }
    };
  }
  return {
    item,
    meta: {
      matchedName: String(itemDoc?.name || item?.name || "").trim(),
      matchedType: String(itemDoc?.type || item?.type || "").trim(),
      matchedPack: getResolvedItemSourcePack(itemDoc),
      strategy: String(meta?.strategy || "").trim()
    }
  };
}

function getResolvedItemSourcePack(itemDoc) {
  const direct = String(itemDoc?.pack || itemDoc?.collection || "").trim();
  if (direct) return direct;
  const uuid = String(itemDoc?.uuid || itemDoc?.flags?.core?.sourceId || itemDoc?.flags?.dnd5e?.sourceId || "").trim();
  if (!uuid) return "";
  const parts = uuid.split(".");
  if (parts.length >= 5 && parts[0] === "Compendium") {
    return parts.slice(1, -2).join(".");
  }
  return "";
}

function normalizeAiItemGroups(rawItems) {
  const source = rawItems && typeof rawItems === "object" ? rawItems : {};
  const flatItems = normalizeAiItemReferenceArray(source.items, 18, 80);
  const groupedFlat = splitFlatItemNamesForActor(flatItems);
  return {
    weapons: dedupeItemRefList([
      ...normalizeAiItemReferenceArray(source.weapons, 6, 80),
      ...groupedFlat.weapons
    ], 6),
    armor: dedupeItemRefList([
      ...normalizeAiItemReferenceArray(source.armor, 4, 80),
      ...groupedFlat.armor
    ], 4),
    equipment: dedupeItemRefList([
      ...normalizeAiItemReferenceArray(source.equipment, 12, 80),
      ...groupedFlat.equipment
    ], 12),
    consumables: dedupeItemRefList([
      ...normalizeAiItemReferenceArray(source.consumables, 8, 80),
      ...groupedFlat.consumables
    ], 8),
    loot: dedupeItemRefList([
      ...normalizeAiItemReferenceArray(source.loot, 10, 80),
      ...groupedFlat.loot
    ], 10),
    spells: dedupeStringList(normalizeStringArrayForActor(source.spells, 14, 80), 14),
    features: dedupeStringList(normalizeStringArrayForActor(source.features, 12, 100), 14)
  };
}

function normalizeAiItemReferenceArray(value, maxItems = 6, maxLength = 80) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
  const out = [];
  for (const entry of list) {
    const normalized = normalizeAiItemReference(entry, maxLength);
    if (!normalized) continue;
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeAiItemReference(value, maxLength = 80) {
  if (typeof value === "string") {
    const name = String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
    if (!name) return null;
    return { name, lookup: "" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const name = String(value.name || value.label || value.value || value.item || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  const lookup = String(value.lookup || value.canonical || value.canonicalName || value.english || value.en || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  const resolvedName = name || lookup;
  if (!resolvedName) return null;
  return {
    name: resolvedName,
    lookup
  };
}

function dedupeItemRefList(values, maxItems = 10) {
  const out = [];
  const seen = new Set();
  for (const rawValue of values || []) {
    const value = normalizeAiItemReference(rawValue, 120);
    if (!value) continue;
    const key = `${value.name.toLowerCase()}|${String(value.lookup || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeStringArrayForActor(value, maxItems = 6, maxLength = 80, fallback = []) {
  const list = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  const clean = list
    .map((part) => {
      const raw =
        part && typeof part === "object" && !Array.isArray(part)
          ? part.name || part.lookup || part.value || part.label || ""
          : part;
      return String(raw || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
    })
    .filter(Boolean)
    .slice(0, maxItems);
  if (clean.length) return clean;
  return Array.isArray(fallback) ? fallback.slice(0, maxItems) : [];
}

function normalizeAttackStyle(value) {
  const style = String(value || "").trim().toLowerCase();
  if (["melee", "ranged", "caster", "mixed"].includes(style)) return style;
  return "mixed";
}

function normalizeTagListForActor(rawTags, attackStyle) {
  const tags = normalizeStringArrayForActor(rawTags, 8, 24).map((tag) => tag.toLowerCase());
  if (tags.length) return tags;
  if (attackStyle === "caster") return ["caster", "knowledge"];
  if (attackStyle === "ranged") return ["wilderness", "martial"];
  if (attackStyle === "melee") return ["martial"];
  return ["criminal", "social"];
}

function normalizeSkillIdsForActor(rawSkillIds) {
  const allowed = new Set(Object.keys(CONFIG?.DND5E?.skills || {}));
  const raw = normalizeStringArrayForActor(rawSkillIds, 10, 24).map((value) => value.toLowerCase());
  if (!allowed.size) return raw;
  return raw.filter((value) => allowed.has(value));
}

function normalizeAbilityScoresForActor(rawAbilities, tier) {
  const source = rawAbilities && typeof rawAbilities === "object" ? rawAbilities : {};
  const base = 9 + clampRange(tier, 1, 4, 1);
  return {
    str: clampRange(source.str ?? source.STR, 6, 22, base + 1),
    dex: clampRange(source.dex ?? source.DEX, 6, 22, base),
    con: clampRange(source.con ?? source.CON, 6, 22, base + 1),
    int: clampRange(source.int ?? source.INT, 6, 22, base),
    wis: clampRange(source.wis ?? source.WIS, 6, 22, base),
    cha: clampRange(source.cha ?? source.CHA, 6, 22, base)
  };
}

function normalizeCurrencyForActor(rawCurrency) {
  const source = rawCurrency && typeof rawCurrency === "object" ? rawCurrency : {};
  return {
    pp: clampRange(source.pp, 0, 5000, 0),
    gp: clampRange(source.gp, 0, 50000, 0),
    ep: clampRange(source.ep, 0, 5000, 0),
    sp: clampRange(source.sp, 0, 50000, 0),
    cp: clampRange(source.cp, 0, 50000, 0)
  };
}

function normalizeCrForActor(value, tier) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 30) {
    return Math.round(numeric * 1000) / 1000;
  }
  if (tier <= 1) return 0.25;
  if (tier === 2) return 2;
  if (tier === 3) return 5;
  return 8;
}

function parseSpeedFeetForActor(rawSpeed, fallback = 30) {
  if (typeof rawSpeed === "number") {
    return clampRange(rawSpeed, 20, 60, fallback);
  }
  const text = String(rawSpeed || "").trim();
  if (!text) return fallback;
  const match = text.match(/(\d{2,3})/);
  return match ? clampRange(Number(match[1]), 20, 60, fallback) : fallback;
}

function firstSentenceForActor(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const match = value.match(/^(.+?[.!?])(\s|$)/);
  return (match ? match[1] : value).trim();
}

function extractAppearanceFromDescriptionForActor(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return [];
  return value
    .split(/[,.]| and /i)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 8)
    .slice(0, 4);
}

function clampRange(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function uniquePackNames(packs) {
  return Array.from(new Set((packs || []).filter(Boolean)));
}

function buildLookupNameCandidates(names) {
  const seeds = Array.isArray(names) ? names : [names];
  const variants = new Set();
  for (const seed of seeds) {
    const base = String(seed || "").replace(/\s+/g, " ").trim();
    if (!base) continue;
    variants.add(base);
    for (const extra of expandLookupNameVariants(base)) {
      const normalized = String(extra || "").replace(/\s+/g, " ").trim();
      if (!normalized) continue;
      variants.add(normalized);
    }
    for (const value of getSearchStrings({ name: base })) {
      const clean = String(value || "").replace(/\s+/g, " ").trim();
      if (!clean) continue;
      variants.add(clean);
    }
  }
  return Array.from(variants).sort((a, b) => b.length - a.length);
}

function normalizeLookupKey(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildLookupWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function addDocToLookupBucket(map, key, doc) {
  const bucketKey = normalizeLookupKey(key);
  if (!bucketKey || !doc) return;
  const bucket = map.get(bucketKey);
  if (bucket) {
    bucket.push(doc);
    return;
  }
  map.set(bucketKey, [doc]);
}

function buildAiLookupCacheKey(packs, allowedTypes) {
  const packKey = uniquePackNames(packs).slice().sort().join("|");
  const typeKey = Array.from(new Set((allowedTypes || []).map((entry) => String(entry || "").toLowerCase()).filter(Boolean)))
    .sort()
    .join("|");
  return `${packKey}::${typeKey}`;
}

function getAiLookupIndex(packs, allowedTypes) {
  ensureNpcGeneratorLookupCacheState();
  const cacheKey = buildAiLookupCacheKey(packs, allowedTypes);
  if (NPC_GENERATOR_LOOKUP_CACHE.aiLookupIndexByKey.has(cacheKey)) {
    return NPC_GENERATOR_LOOKUP_CACHE.aiLookupIndexByKey.get(cacheKey);
  }

  const docs = getCachedDocsForPacks(packs);
  const allowed = new Set((allowedTypes || []).map((entry) => String(entry || "").toLowerCase()).filter(Boolean));
  const tokenToDocs = new Map();
  const wordToDocs = new Map();
  const filteredDocs = [];

  for (const doc of docs) {
    const type = String(doc?.type || "").toLowerCase();
    if (!allowed.has(type)) continue;
    filteredDocs.push(doc);

    const tokenSet = new Set(
      getSearchStrings(doc)
        .map((token) => normalizeLookupKey(token))
        .filter(Boolean)
    );
    if (!tokenSet.size) continue;

    const wordSet = new Set();
    for (const token of tokenSet) {
      addDocToLookupBucket(tokenToDocs, token, doc);
      for (const word of buildLookupWords(token)) {
        wordSet.add(word);
      }
    }
    for (const word of wordSet) {
      addDocToLookupBucket(wordToDocs, word, doc);
    }
  }

  const index = { docs: filteredDocs, tokenToDocs, wordToDocs };
  if (NPC_GENERATOR_LOOKUP_CACHE.aiLookupIndexByKey.size >= LOOKUP_CACHE_MAX_AI_INDEX_KEYS) {
    NPC_GENERATOR_LOOKUP_CACHE.aiLookupIndexByKey.clear();
  }
  NPC_GENERATOR_LOOKUP_CACHE.aiLookupIndexByKey.set(cacheKey, index);
  return index;
}

function collectAiLookupCandidates(index, terms, fallbackToAll = false) {
  if (!index?.docs?.length) return [];
  const out = new Set();
  const list = Array.isArray(terms) ? terms : [terms];
  for (const rawTerm of list) {
    const normalizedTerm = normalizeLookupKey(rawTerm);
    if (!normalizedTerm) continue;

    const termVariants = getSearchStrings({ name: normalizedTerm })
      .map((entry) => normalizeLookupKey(entry))
      .filter(Boolean);
    for (const variant of termVariants) {
      for (const doc of index.tokenToDocs.get(variant) || []) out.add(doc);
      for (const word of buildLookupWords(variant)) {
        for (const doc of index.wordToDocs.get(word) || []) out.add(doc);
      }
    }
  }

  if (out.size) return Array.from(out);
  return fallbackToAll ? index.docs.slice() : [];
}

function pickBestCachedAiItemByKeywords(referenceNames, packs, allowedTypes, keywords, budget) {
  const lookupIndex = getAiLookupIndex(packs, allowedTypes);
  if (!lookupIndex.docs.length || !keywords.length) return null;

  const names = (Array.isArray(referenceNames) ? referenceNames : [referenceNames])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const targetTokens = new Set(
    names
      .flatMap((name) => getSearchStrings({ name }))
      .map((value) => normalizeLookupKey(value))
      .filter(Boolean)
  );
  const expandedKeywords = Array.from(
    new Set(
      keywords
        .flatMap((keyword) => getSearchStrings({ name: keyword }))
        .map((value) => normalizeLookupKey(value))
        .filter(Boolean)
    )
  );
  if (!expandedKeywords.length) return null;

  const docs = collectAiLookupCandidates(
    lookupIndex,
    [...expandedKeywords, ...Array.from(targetTokens)],
    true
  );
  if (!docs.length) return null;

  const requiredMatches = expandedKeywords.length >= 2 ? 2 : 1;
  const targetTokenList = Array.from(targetTokens);
  let best = null;

  for (const doc of docs) {
    const haystack = getSearchStrings(doc)
      .map((token) => normalizeLookupKey(token))
      .filter(Boolean);
    if (!haystack.length) continue;
    const haystackWordSet = buildSearchWordSet(haystack);

    let matchCount = 0;
    for (const keyword of expandedKeywords) {
      if (haystack.some((token) => token.includes(keyword)) || haystackWordSet.has(keyword)) matchCount += 1;
    }
    if (matchCount < requiredMatches) continue;

    const exactNameToken =
      haystack.some((token) => targetTokens.has(token)) ||
      targetTokenList.some((token) => haystackWordSet.has(token));
    const withinBudget = isWithinBudget(doc, budget, true);
    const score = (exactNameToken ? 100 : 0) + matchCount * 10 + (withinBudget ? 1 : 0);
    const tieBreaker = names.length
      ? Math.min(...names.map((name) => Math.abs(String(doc?.name || "").length - name.length)))
      : Math.abs(String(doc?.name || "").length);

    if (
      !best ||
      score > best.score ||
      (score === best.score && withinBudget && !best.withinBudget) ||
      (score === best.score && withinBudget === best.withinBudget && tieBreaker < best.tieBreaker)
    ) {
      best = { doc, score, withinBudget, tieBreaker };
    }
  }

  return best?.doc || null;
}

function pickPreferredCachedAiItemByNames(itemRef, packs, allowedTypes, budget) {
  const lookupIndex = getAiLookupIndex(packs, allowedTypes);
  if (!lookupIndex.docs.length) return null;

  const localizedSeeds = Array.from(
    new Set(
      buildLookupNameCandidates(itemRef?.name || "")
        .flatMap((seed) => getSearchStrings({ name: seed }))
        .map((seed) => normalizeLookupKey(seed))
        .filter(Boolean)
    )
  );
  const lookupSeeds = Array.from(
    new Set(
      buildLookupNameCandidates(itemRef?.lookup || itemRef?.name || "")
        .flatMap((seed) => getSearchStrings({ name: seed }))
        .map((seed) => normalizeLookupKey(seed))
        .filter(Boolean)
    )
  );
  const combined = Array.from(new Set([...localizedSeeds, ...lookupSeeds]));
  if (!combined.length) return null;
  const docs = collectAiLookupCandidates(lookupIndex, combined, true);
  if (!docs.length) return null;

  const preferredScript =
    detectPreferredScriptByLanguage() ||
    detectTextScript(itemRef?.name);

  let best = null;
  for (const doc of docs) {
    const haystack = getSearchStrings(doc)
      .map((token) => normalizeLookupKey(token))
      .filter(Boolean);
    if (!haystack.length) continue;
    const haystackWordSet = buildSearchWordSet(haystack);

    let localizedExact = 0;
    let lookupExact = 0;
    let localizedPartial = 0;
    let lookupPartial = 0;
    let localizedFuzzy = 0;
    let lookupFuzzy = 0;
    for (const term of localizedSeeds) {
      if (haystack.includes(term) || haystackWordSet.has(term)) localizedExact += 1;
      if (haystack.some((token) => token.includes(term))) localizedPartial += 1;
      localizedFuzzy += getBestFuzzySimilarity(term, haystack);
    }
    for (const term of lookupSeeds) {
      if (haystack.includes(term) || haystackWordSet.has(term)) lookupExact += 1;
      if (haystack.some((token) => token.includes(term))) lookupPartial += 1;
      lookupFuzzy += getBestFuzzySimilarity(term, haystack);
    }
    const hasFuzzy = localizedFuzzy >= 0.72 || lookupFuzzy >= 0.72;
    if (!localizedPartial && !lookupPartial && !hasFuzzy) continue;

    const withinBudget = isWithinBudget(doc, budget, true);
    const nameScript = detectTextScript(doc?.name);
    const scriptBonus = preferredScript && preferredScript === nameScript ? 25 : 0;
    const score =
      localizedExact * 90 +
      lookupExact * 70 +
      localizedPartial * 15 +
      lookupPartial * 12 +
      localizedFuzzy * 18 +
      lookupFuzzy * 14 +
      scriptBonus +
      (withinBudget ? 1 : 0);

    const tieBreaker = Math.abs(String(doc?.name || "").length - String(itemRef?.name || "").length);
    if (
      !best ||
      score > best.score ||
      (score === best.score && withinBudget && !best.withinBudget) ||
      (score === best.score && withinBudget === best.withinBudget && tieBreaker < best.tieBreaker)
    ) {
      best = { doc, score, withinBudget, tieBreaker };
    }
  }

  return best?.doc || null;
}

function getBestFuzzySimilarity(term, haystackTokens) {
  const source = normalizeFuzzyName(term);
  if (!source || source.length < 4) return 0;
  const expanded = new Set();
  for (const token of haystackTokens || []) {
    const normalized = normalizeFuzzyName(token);
    if (!normalized) continue;
    expanded.add(normalized);
    for (const part of normalized.split(/\s+/).filter((entry) => entry.length >= 3)) {
      expanded.add(part);
    }
  }
  if (!expanded.size) return 0;
  let best = 0;
  for (const candidate of expanded) {
    const score = diceSimilarity(source, candidate);
    if (score > best) best = score;
  }
  return best;
}

function normalizeFuzzyName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[`'’"]/g, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diceSimilarity(a, b) {
  const left = normalizeFuzzyName(a);
  const right = normalizeFuzzyName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);
  if (!leftBigrams.length || !rightBigrams.length) return 0;
  const rightMap = new Map();
  for (const gram of rightBigrams) {
    rightMap.set(gram, (rightMap.get(gram) || 0) + 1);
  }
  let overlap = 0;
  for (const gram of leftBigrams) {
    const count = rightMap.get(gram) || 0;
    if (count <= 0) continue;
    overlap += 1;
    rightMap.set(gram, count - 1);
  }
  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function buildBigrams(text) {
  const value = String(text || "");
  if (value.length < 2) return [];
  const grams = [];
  for (let i = 0; i < value.length - 1; i++) {
    grams.push(value.slice(i, i + 2));
  }
  return grams;
}

function buildSearchWordSet(tokens) {
  const out = new Set();
  for (const token of tokens || []) {
    const parts = String(token || "")
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, " ")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3);
    for (const part of parts) out.add(part);
  }
  return out;
}

function countKeywordHits(haystack, keywords) {
  const terms = (keywords || []).map((value) => String(value || "").trim()).filter(Boolean);
  if (!terms.length) return 0;
  let hits = 0;
  for (const term of terms) {
    if ((haystack || []).some((token) => String(token || "").includes(term))) hits += 1;
  }
  return hits;
}

function isAmmoLikeItemRequest(value) {
  const text = String(value || "").toLowerCase();
  return /(crossbow bolts?|bolts?|arrows?|ammo|боеприпас|болт|болты|стрела|стрелы)/i.test(text);
}

function expandLookupNameVariants(base) {
  const text = String(base || "").trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  const out = [];

  if (/(crossbow bolts?|болты(?:\s+для)?\s+арбалет|арбалетные\s+болты)/i.test(lower)) {
    out.push(
      "Crossbow Bolts",
      "Crossbow Bolt",
      "Crossbow Bolts (20)",
      "Crossbow Bolt (20)",
      "Bolts (20)",
      "арбалетные болты",
      "арбалетный болт",
      "болты для арбалета"
    );
  }
  if (/(arrows?|стрелы?|стрел)/i.test(lower)) {
    out.push("Arrows", "Arrows (20)", "Arrow", "стрелы", "стрела");
  }

  return out;
}

function detectTextScript(value) {
  const text = String(value || "");
  if (/[а-яё]/i.test(text)) return "cyrillic";
  if (/[a-z]/i.test(text)) return "latin";
  return null;
}

function detectPreferredScriptByLanguage() {
  const lang = String(game?.i18n?.lang || game?.settings?.get?.("core", "language") || "")
    .trim()
    .toLowerCase();
  if (lang.startsWith("ru") || lang.startsWith("uk") || lang.startsWith("be")) {
    return "cyrillic";
  }
  if (lang.startsWith("en")) return "latin";
  return null;
}

function buildLookupKeywordsFromName(name) {
  const stopWords = new Set([
    "of",
    "the",
    "and",
    "a",
    "an",
    "with",
    "for",
    "to",
    "in",
    "на",
    "и",
    "с",
    "для"
  ]);
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s'-]/gi, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !stopWords.has(part))
    .slice(0, 5);
}

function splitFlatItemNamesForActor(itemNames) {
  const result = {
    weapons: [],
    armor: [],
    equipment: [],
    consumables: [],
    loot: []
  };

  for (const rawItem of itemNames || []) {
    const itemRef = normalizeAiItemReference(rawItem, 100);
    if (!itemRef) continue;
    const label = String(itemRef.lookup || itemRef.name || "").trim();
    const lower = label.toLowerCase();
    if (!lower) continue;
    if (
      /(ammo|arrows?|bolts?|crossbow bolts?|боеприпас|стрел|болт|снаряд)/i.test(lower)
    ) {
      result.consumables.push(itemRef);
      continue;
    }
    if (
      /(sword|axe|mace|hammer|bow|crossbow|dagger|spear|halberd|staff|rapier|whip|javelin|flail|меч|топор|булав|молот|лук|арбалет|кинжал|копь|алебард|посох|рапир|кнут|дротик)/i.test(
        lower
      )
    ) {
      result.weapons.push(itemRef);
      continue;
    }
    if (
      /(armor|mail|plate|shield|helm|gauntlet|breastplate|leather|chain|брон|доспех|кольчуг|латы|щит|шлем|панцир|кирас)/i.test(
        lower
      )
    ) {
      result.armor.push(itemRef);
      continue;
    }
    if (
      /(potion|elixir|scroll|ammo|arrows|bolts|healer|ration|зель|эликсир|свит|боеприпас|стрел|болт|аптеч|рацион|яд)/i.test(
        lower
      )
    ) {
      result.consumables.push(itemRef);
      continue;
    }
    if (
      /(gem|coin|ring|necklace|trinket|relic|idol|token|самоцвет|монет|кольц|ожерел|безделуш|релик|идол|жетон|драгоцен)/i.test(
        lower
      )
    ) {
      result.loot.push(itemRef);
      continue;
    }
    result.equipment.push(itemRef);
  }

  return {
    weapons: dedupeItemRefList(result.weapons, 6),
    armor: dedupeItemRefList(result.armor, 4),
    equipment: dedupeItemRefList(result.equipment, 12),
    consumables: dedupeItemRefList(result.consumables, 8),
    loot: dedupeItemRefList(result.loot, 10)
  };
}

function dedupeStringList(values, maxItems = 10) {
  const out = [];
  const seen = new Set();
  for (const rawValue of values || []) {
    const value = String(rawValue || "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Build biography HTML
 * @param {Object} npc - NPC data
 * @returns {string}
 */
export function buildBiography(npc) {
  const e = escapeHtml;
  const lines = [];
  lines.push(`<p><strong>Role:</strong> ${e(npc.archetype.name)} (Tier ${e(npc.tier)}, CR ${e(npc.cr)})</p>`);
  if (npc.className) lines.push(`<p><strong>Class:</strong> ${e(npc.className)}</p>`);
  lines.push(`<p><strong>Race:</strong> ${e(npc.race)}</p>`);
  lines.push(`<p><strong>Appearance:</strong> ${(npc.appearance || []).map(e).join(", ")}</p>`);
  lines.push(`<p><strong>Speech:</strong> ${e(npc.speech)}</p>`);
  lines.push(`<p><strong>Motivation:</strong> ${e(npc.motivation)}</p>`);
  if (npc.secret) lines.push(`<p><strong>Secret:</strong> ${e(npc.secret)}</p>`);
  if (npc.hook) lines.push(`<p><strong>Hook:</strong> ${e(npc.hook)}</p>`);
  if (npc.rumor) lines.push(`<p><strong>Rumor:</strong> ${e(npc.rumor)}</p>`);
  if (npc.mannerism) lines.push(`<p><strong>Mannerism:</strong> ${e(npc.mannerism)}</p>`);
  lines.push(`<p><strong>Quirk:</strong> ${e(npc.quirk)}</p>`);
  return lines.join("\n");
}

/**
 * Build skills data
 * @param {string[]} skillIds - Skill IDs with proficiency
 * @returns {Object}
 */
export function buildSkillsData(skillIds) {
  const data = {};
  const skillConfig = CONFIG?.DND5E?.skills ?? {};
  for (const key of Object.keys(skillConfig)) {
    data[key] = { value: 0 };
  }
  skillIds.forEach((skill) => {
    if (data[skill]) data[skill].value = 1;
  });
  return data;
}

// ========== Saving Throws & Spell Slots ==========

/**
 * Get saving throw proficiency abilities for a given class.
 * Based on PHB class save proficiencies.
 * @param {string} className - Class name
 * @returns {string[]} Array of ability keys (e.g. ["str", "con"])
 */
export function getSavingThrowProficiencies(className) {
  switch (String(className || "").trim()) {
    case "Fighter":   return ["str", "con"];
    case "Barbarian":  return ["str", "con"];
    case "Paladin":    return ["wis", "cha"];
    case "Ranger":     return ["str", "dex"];
    case "Rogue":      return ["dex", "int"];
    case "Monk":       return ["str", "dex"];
    case "Cleric":     return ["wis", "cha"];
    case "Wizard":     return ["int", "wis"];
    case "Sorcerer":   return ["con", "cha"];
    case "Warlock":    return ["wis", "cha"];
    case "Bard":       return ["dex", "cha"];
    case "Druid":      return ["int", "wis"];
    default:           return ["str", "con"];
  }
}

/**
 * Apply saving throw proficiencies to ability data object.
 * Mutates the abilityData in-place and returns it.
 * @param {Object} abilityData - Ability data object ({str: {value}, ...})
 * @param {string[]} proficientSaves - Array of ability keys with proficiency
 * @returns {Object}
 */
export function applyAbilitySaveProficiencies(abilityData, proficientSaves) {
  const savesSet = new Set(proficientSaves || []);
  for (const key of Object.keys(abilityData)) {
    if (savesSet.has(key)) {
      abilityData[key].proficient = 1;
    }
  }
  return abilityData;
}

/**
 * Build spell slot allocation for a caster NPC.
 * Models a half- to full-caster slot progression based on tier.
 * @param {number} tier - NPC tier (1-4)
 * @param {boolean} importantNpc - Whether NPC is a boss
 * @returns {Object} Foundry-compatible spells object
 */
export function buildSpellSlots(tier, importantNpc) {
  const bonus = importantNpc ? 1 : 0;
  const slots = {};

  if (tier >= 1) slots.spell1 = { value: 3 + bonus, max: 3 + bonus, override: null };
  if (tier >= 1) slots.spell2 = { value: 2 + bonus, max: 2 + bonus, override: null };
  if (tier >= 2) slots.spell3 = { value: 2 + bonus, max: 2 + bonus, override: null };
  if (tier >= 3) slots.spell4 = { value: 2, max: 2, override: null };
  if (tier >= 3) slots.spell5 = { value: 1 + bonus, max: 1 + bonus, override: null };
  if (tier >= 4) slots.spell6 = { value: 1, max: 1, override: null };
  if (tier >= 4 && importantNpc) slots.spell7 = { value: 1, max: 1, override: null };

  return slots;
}

// ========== Combat Feature Items ==========

/**
 * Build combat feature items based on NPC tier and boss status.
 * - Tier 2+: Multiattack (2 weapon attacks)
 * - Tier 3+ boss: Legendary Actions (3/day)
 * - Tier 4 boss: Legendary Resistance (3/day)
 * @param {Object} npc - NPC data
 * @returns {Object[]} Array of feature item data objects
 */
/**
 * Search for a cached document by multiple name variants (handles localized compendiums).
 * Names are collected from lang files under compendiumLookup.<key> so any locale
 * can list its own compendium item names without touching JS code.
 * Falls back to the English canonical name if nothing matches.
 * @param {string[]} packs - Pack collection names
 * @param {string} lookupKey - Key under compendiumLookup (e.g. "multiattack")
 * @param {string} canonicalName - English fallback name
 * @returns {Object|null}
 */
function findCombatFeatureDoc(packs, lookupKey, canonicalName) {
  // Collect localized name variants from lang file (pipe-separated)
  const langNames = t(`compendiumLookup.${lookupKey}`, "");
  const names = langNames
    ? langNames.split("|").map((s) => s.trim()).filter(Boolean)
    : [];
  // Always include canonical English name as last resort
  if (!names.includes(canonicalName)) names.push(canonicalName);
  for (const name of names) {
    const doc = getCachedDocByName(packs, name);
    if (doc) return doc;
  }
  return null;
}

export async function buildCombatFeatureItems(npc) {
  const items = [];
  const tier = npc?.tier || 1;
  const isBoss = !!npc?.importantNpc;
  const attackCount = tier >= 3 ? 3 : 2;
  const featurePacks = getPacks("features");

  // Multiattack for tier 2+ (most MM NPCs above CR 1 have this)
  if (tier >= 2) {
    const compendiumMultiattack = findCombatFeatureDoc(featurePacks, "multiattack", "Multiattack");
    if (compendiumMultiattack) {
      const item = cloneItemData(compendiumMultiattack);
      // Override description with correct attack count for this NPC
      if (item.system?.description) {
        item.system.description.value = `<p>This creature makes ${attackCount} attacks with its weapon.</p>`;
      }
      items.push(ensureActivities(item));
    } else {
      items.push({
        name: "Multiattack",
        type: "feat",
        system: {
          description: {
            value: `<p>This creature makes ${attackCount} attacks with its weapon.</p>`
          },
          type: { value: "monster", subtype: "" },
          activation: { type: "action", cost: 1 },
          duration: {},
          target: {},
          range: {},
          uses: {},
          actionType: "",
          damage: { parts: [] }
        }
      });
    }
  }

  // Legendary Resistance for tier 3+ boss (3/day, standard MM pattern)
  if (isBoss && tier >= 3) {
    const compendiumLR = findCombatFeatureDoc(featurePacks, "legendaryResistance", "Legendary Resistance");
    if (compendiumLR) {
      const item = cloneItemData(compendiumLR);
      // Ensure 3/day uses
      if (item.system) {
        item.system.uses = Object.assign(item.system.uses || {}, { value: 3, max: "3", per: "day" });
      }
      items.push(ensureActivities(item));
    } else {
      items.push({
        name: "Legendary Resistance (3/Day)",
        type: "feat",
        system: {
          description: {
            value: "<p>If this creature fails a saving throw, it can choose to succeed instead.</p>"
          },
          type: { value: "monster", subtype: "" },
          activation: { type: "special", cost: null },
          duration: {},
          target: {},
          range: {},
          uses: { value: 3, max: "3", per: "day", recovery: "" },
          actionType: "",
          damage: { parts: [] }
        }
      });
    }
  }

  // Legendary Actions for tier 3+ boss (3 per round, standard MM pattern)
  if (isBoss && tier >= 3) {
    const compendiumLA = findCombatFeatureDoc(featurePacks, "legendaryActions", "Legendary Actions");
    if (compendiumLA) {
      const item = cloneItemData(compendiumLA);
      if (item.system) {
        item.system.uses = Object.assign(item.system.uses || {}, { value: 3, max: "3", per: "round" });
      }
      items.push(ensureActivities(item));
    } else {
      const legendaryCost2Desc = tier >= 4
        ? "<p>This creature moves up to its speed without provoking opportunity attacks.</p>"
        : "<p>This creature moves up to half its speed.</p>";

      items.push({
        name: "Legendary Actions",
        type: "feat",
        system: {
          description: {
            value: [
              "<p>This creature can take 3 legendary actions, choosing from the options below.",
              "Only one legendary action can be used at a time and only at the end of another creature's turn.",
              "Spent legendary actions are regained at the start of each turn.</p>",
              "<ul>",
              "<li><strong>Attack (Costs 1 Action).</strong> <p>This creature makes one weapon attack.</p></li>",
              `<li><strong>Move (Costs 1 Action).</strong> ${legendaryCost2Desc}</li>`,
              "<li><strong>Detect (Costs 1 Action).</strong> <p>This creature makes a Wisdom (Perception) check.</p></li>",
              "</ul>"
            ].join("\n")
          },
          type: { value: "monster", subtype: "" },
          activation: { type: "legendary", cost: 1 },
          duration: {},
          target: {},
          range: {},
          uses: { value: 3, max: "3", per: "round", recovery: "" },
          actionType: "",
          damage: { parts: [] }
        }
      });
    }
  }

  return items;
}

// ========== Weapon Building ==========

/**
 * Get weapon by attack style
 * @param {string} style - Attack style
 * @returns {Object}
 */
export function getWeaponByStyle(style) {
  if (style === "ranged") {
    return {
      name: "Shortbow",
      actionType: "rwak",
      ability: "dex",
      base: "bow",
      damageType: "piercing",
      range: { value: 80, long: 320, units: "ft" }
    };
  }

  if (style === "caster") {
    return {
      name: "Quarterstaff",
      actionType: "mwak",
      ability: "str",
      base: "staff",
      damageType: "bludgeoning",
      range: { value: 5, long: 5, units: "ft" }
    };
  }

  if (style === "mixed") {
    return {
      name: "Dagger",
      actionType: "mwak",
      ability: "dex",
      base: "dagger",
      damageType: "piercing",
      range: { value: 5, long: 20, units: "ft" }
    };
  }

  return {
    name: "Longsword",
    actionType: "mwak",
    ability: "str",
    base: "sword",
    damageType: "slashing",
    range: { value: 5, long: 5, units: "ft" }
  };
}

/**
 * Get damage dice by tier
 * @param {number} tier - Tier level
 * @param {string} base - Weapon base type
 * @returns {string}
 */
export function getDamageByTier(tier, base) {
  if (base === "bow") {
    if (tier <= 1) return "1d6 + 2";
    if (tier === 2) return "1d8 + 3";
    if (tier === 3) return "2d6 + 3";
    return "2d8 + 4";
  }

  if (base === "dagger") {
    if (tier <= 1) return "1d4 + 2";
    if (tier === 2) return "1d6 + 3";
    if (tier === 3) return "2d4 + 3";
    return "2d6 + 4";
  }

  if (tier <= 1) return "1d6 + 2";
  if (tier === 2) return "1d8 + 3";
  if (tier === 3) return "2d6 + 3";
  return "2d8 + 4";
}

/**
 * Get weapon keywords for search
 * @param {string} style - Attack style
 * @param {string[]} tags - Archetype tags
 * @returns {string[]}
 */
export function getWeaponKeywords(style, tags) {
  if (tags.includes("criminal")) {
    return ["dagger", "shortsword", "rapier", "hand crossbow", "shortbow"];
  }
  if (style === "ranged") return ["shortbow", "longbow", "crossbow", "sling"];
  if (style === "caster") return ["staff", "dagger", "wand"];
  if (style === "mixed") return ["dagger", "shortsword", "handaxe", "rapier"];
  return ["sword", "axe", "mace", "spear"];
}

/**
 * Get class for archetype
 * @param {Object} archetype - Archetype data
 * @returns {string}
 */
export function getClassForArchetype(archetype) {
  const tags = archetype.tags || [];
  const id = archetype.id || "";
  // Exact archetype-to-class overrides for new archetypes
  if (id === "paladin") return "Paladin";
  if (id === "barbarian") return "Barbarian";
  if (id === "monk") return "Monk";
  if (id === "druid") return "Druid";
  if (id === "sorcerer") return "Sorcerer";
  if (id === "necromancer") return "Wizard";
  // Tag-based fallback
  if (tags.includes("nature")) return "Druid";
  if (tags.includes("brute")) return "Barbarian";
  if (tags.includes("monk")) return "Monk";
  if (tags.includes("holy")) return "Cleric";
  if (tags.includes("dark")) return "Warlock";
  if (tags.includes("knowledge")) return "Wizard";
  if (tags.includes("wilderness")) return "Ranger";
  if (tags.includes("criminal")) return "Rogue";
  if (tags.includes("martial")) return "Fighter";
  if (tags.includes("social")) return "Bard";
  if (tags.includes("caster")) return "Wizard";
  return "Fighter";
}

/**
 * Get class-specific weapon keywords
 * @param {string} className - Class name
 * @returns {string[]}
 */
export function getClassWeaponKeywords(className) {
  switch (className) {
    case "Rogue":
      return ["dagger", "shortsword", "rapier", "hand crossbow", "shortbow"];
    case "Cleric":
      return ["mace", "warhammer", "flail", "staff", "shield"];
    case "Wizard":
      return ["staff", "dagger", "wand"];
    case "Warlock":
      return ["rod", "wand", "dagger", "staff"];
    case "Ranger":
      return ["shortbow", "longbow", "scimitar", "shortsword"];
    case "Bard":
      return ["rapier", "shortsword", "dagger", "hand crossbow", "whip"];
    default:
      return ["sword", "axe", "mace", "spear"];
  }
}

/**
 * Get class-specific equipment keywords
 * @param {string} className - Class name
 * @returns {string[]}
 */
export function getClassEquipmentKeywords(className) {
  switch (className) {
    case "Rogue":
      return ["leather", "studded", "thieves' tools", "cloak"];
    case "Cleric":
      return ["holy", "symbol", "chain", "scale", "shield", "mace"];
    case "Wizard":
      return ["spellbook", "component", "focus", "robe", "staff"];
    case "Warlock":
      return ["focus", "component", "rod", "tome", "chain"];
    case "Ranger":
      return ["leather", "cloak", "quiver", "arrows", "rations"];
    case "Bard":
      return ["instrument", "fine clothes", "rapier", "lute"];
    default:
      return ["chain", "scale", "shield", "pack"];
  }
}

/**
 * Build weapon item for NPC
 * @param {Object} npc - NPC data
 * @returns {Promise<Object>}
 */
export async function buildWeaponItem(npc) {
  const style = npc.archetype.attackStyle;
  const tags = npc.archetype.tags || [];
  const className = getClassForArchetype(npc.archetype);
  const weaponKeywords = getWeaponKeywords(style, tags).concat(getClassWeaponKeywords(className));
  const weaponPacks = getPacks("weapons");
  const budget = npc.budget || "normal";
  const compendiumWeapon =
    (await getRandomItemByKeywordsFromAllPacksWithBudget(
      weaponPacks,
      weaponKeywords,
      (entry) => (entry.type === "weapon" || entry.type === "equipment") && isAllowedItemEntry(entry),
      budget
    )) ||
    (await getRandomItemFromAllPacksWithBudget(
      weaponPacks,
      (entry) => entry.type === "weapon" && isAllowedItemEntry(entry),
      budget
    ));

  if (compendiumWeapon) {
    const weaponData = cloneItemData(toItemData(compendiumWeapon));
    if (weaponData.system?.equipped !== undefined) weaponData.system.equipped = true;
    if (weaponData.system?.proficient !== undefined) weaponData.system.proficient = true;
    return weaponData;
  }

  const cachedWeapon =
    getRandomCachedDocByKeywordsWithBudget(
      weaponPacks,
      weaponKeywords,
      (doc) => (doc.type === "weapon" || doc.type === "equipment") && isAllowedItemDoc(doc),
      budget
    ) ||
    getRandomCachedDocByKeywordsWithBudget(
      weaponPacks,
      [],
      (doc) => doc.type === "weapon" && isAllowedItemDoc(doc),
      budget
    );

  if (cachedWeapon) {
    const weaponData = cloneItemData(cachedWeapon);
    if (weaponData.system?.equipped !== undefined) weaponData.system.equipped = true;
    if (weaponData.system?.proficient !== undefined) weaponData.system.proficient = true;
    return weaponData;
  }

  const weapon = getWeaponByStyle(style);
  const ability = weapon.ability;
  const damage = getDamageByTier(npc.tier, weapon.base);

  return {
    name: weapon.name,
    type: "weapon",
    system: {
      actionType: weapon.actionType,
      ability,
      equipped: true,
      proficient: true,
      damage: { parts: [[damage, weapon.damageType]] },
      range: weapon.range,
      properties: {}
    }
  };
}

/**
 * Build ammo item for a weapon
 * @param {Object} weaponItem - Weapon item data
 * @param {Object} npc - NPC data
 * @returns {Promise<Object|null>}
 */
export async function buildAmmoItemForWeapon(weaponItem, npc) {
  if (!weaponItem) return null;
  const name = String(weaponItem.name || "").toLowerCase();
  const props = weaponItem.system?.properties || [];
  const isAmmoWeapon = Array.isArray(props) && props.includes("amm");
  if (!isAmmoWeapon) return null;

  let ammoName = null;
  let ammoKeywords = [];
  if (name.includes("crossbow")) ammoName = "Crossbow Bolts";
  else if (name.includes("bow")) ammoName = "Arrows";
  if (!ammoName) return null;
  if (ammoName === "Crossbow Bolts") {
    ammoKeywords = ["crossbow bolt", "crossbow bolts", "bolt", "bolts"];
  } else {
    ammoKeywords = ["arrow", "arrows"];
  }

  const packs = getPacks("loot").concat(getPacks("weapons") || []);
  const budget = npc?.budget || "normal";
  const nameCandidates = ammoName === "Crossbow Bolts"
    ? [ammoName, "Crossbow Bolt", "Crossbow Bolts (20)", "Bolts"]
    : [ammoName, "Arrows (20)", "Arrow"];
  let byName = null;
  for (const candidate of nameCandidates) {
    byName = await getItemByNameFromPacks(packs, candidate);
    if (byName) break;
  }
  const picked =
    (byName && isAllowedItemDoc(byName, true) ? byName : null) ||
    (await getRandomItemByKeywordsFromAllPacksWithBudget(
      packs,
      ammoKeywords,
      (entry) =>
        (entry.type === "consumable" || entry.type === "loot" || entry.type === "equipment") &&
        isAllowedItemEntry(entry, true),
      budget,
      true
    ));

  if (picked) {
    const data = cloneItemData(toItemData(picked));
    if (data?.system?.quantity !== undefined) {
      data.system.quantity = 20;
    }
    return data;
  }

  return {
    name: ammoName,
    type: "consumable",
    system: { quantity: 20, description: { value: "" }, consumableType: "" }
  };
}

// ========== Role Abilities & Items ==========

/**
 * Build role ability items (spells, features)
 * @param {Object} npc - NPC data
 * @returns {Promise<Object[]>}
 */
export async function buildRoleAbilityItems(npc) {
  const tags = npc.archetype.tags || [];
  const isCaster = tags.includes("caster");
  const out = [];
  if (isCaster) {
    out.push(...(await buildSpellItems(npc)));
  }
  out.push(...(await buildClassFeatureItems(npc)));
  if (out.length) return out;
  return buildFeatureItems(npc);
}

/**
 * Build spell items for caster
 * @param {Object} npc - NPC data
 * @returns {Promise<Object[]>}
 */
export async function buildSpellItems(npc) {
  const tags = npc.archetype.tags || [];
  const maxLevel = getMaxSpellLevelByTier(npc.tier);
  const spellCount = getSpellCountByTier(npc.tier, npc.importantNpc);
  const cantripCount = getCantripCountByTier(npc.tier);
  const keywords = getSpellKeywords(tags);

  const out = [];

  // Get cantrips (level 0)
  const cantripCandidates = await getCantripCandidates(keywords);
  const chosenCantrips = pickRandomN(cantripCandidates, cantripCount);
  for (const entry of chosenCantrips) {
    const cached = getCachedDoc(entry.pack, entry._id);
    if (cached) {
      out.push(cloneItemData(cached));
      continue;
    }
    const pack = game.packs?.get(entry.pack);
    if (!pack) continue;
    const doc = await pack.getDocument(entry._id);
    if (doc) out.push(doc.toObject());
  }

  // Get leveled spells (1+)
  const candidates = await getSpellCandidates(maxLevel, keywords);
  const chosen = pickRandomN(candidates, spellCount);
  for (const entry of chosen) {
    const cached = getCachedDoc(entry.pack, entry._id);
    if (cached) {
      out.push(cloneItemData(cached));
      continue;
    }
    const pack = game.packs?.get(entry.pack);
    if (!pack) continue;
    const doc = await pack.getDocument(entry._id);
    if (doc) out.push(doc.toObject());
  }

  if (out.length) return out;
  return buildCachedSpellItemsFallback(maxLevel, keywords, spellCount);
}

/**
 * Get spell count by tier (leveled spells only, 1+)
 * @param {number} tier - Tier level
 * @param {boolean} importantNpc - Whether NPC is boss
 * @returns {number}
 */
export function getSpellCountByTier(tier, importantNpc) {
  const base = tier <= 1 ? 3 : tier === 2 ? 4 : tier === 3 ? 5 : 6;
  return importantNpc ? base + 2 : base;
}

/**
 * Get cantrip count by tier
 * @param {number} tier - Tier level
 * @returns {number}
 */
export function getCantripCountByTier(tier) {
  if (tier <= 1) return 2;
  if (tier === 2) return 3;
  if (tier === 3) return 3;
  return 4;
}

/**
 * Get max spell level by tier.
 * Aligned with typical NPC caster power in the Monster Manual:
 * Tier 1 (CR 0-1/2): cantrips + 1st level
 * Tier 2 (CR 1-3): up to 3rd level spells
 * Tier 3 (CR 4-6): up to 5th level spells (Fireball, Counterspell, etc.)
 * Tier 4 (CR 7-10): up to 7th level spells (Forcecage, etc.)
 * @param {number} tier - Tier level
 * @returns {number}
 */
export function getMaxSpellLevelByTier(tier) {
  if (tier <= 1) return 2;
  if (tier === 2) return 3;
  if (tier === 3) return 5;
  return 7;
}

/**
 * Get spell keywords for tags
 * @param {string[]} tags - Archetype tags
 * @returns {string[]}
 */
export function getSpellKeywords(tags) {
  const keywords = [];
  if (tags.includes("holy")) keywords.push("cure", "healing", "bless", "sanctuary", "guiding", "restoration", "ward", "sacred", "flame", "light", "spare");
  if (tags.includes("dark")) keywords.push("necrotic", "hex", "curse", "blight", "shadow", "fear", "chill", "touch", "toll", "dead", "infestation");
  if (tags.includes("knowledge")) keywords.push("detect", "identify", "divination", "locate", "comprehend", "illusion", "minor", "prestidigitation", "mage", "hand", "message");
  if (tags.includes("wilderness")) keywords.push("entangle", "thorn", "beast", "hunter", "wind", "ice", "druidcraft", "produce", "flame", "shillelagh", "thorn", "whip");
  if (tags.includes("social")) keywords.push("charm", "friends", "command", "suggestion", "calm", "heroism", "vicious", "mockery", "minor", "illusion");
  // Generic caster keywords for cantrips
  if (!keywords.length) keywords.push("fire", "bolt", "ray", "frost", "shock", "acid", "splash", "blade");
  return keywords;
}

/**
 * Get cantrip candidates from packs (level 0 spells)
 * @param {string[]} keywords - Keywords to match
 * @returns {Promise<Array>}
 */
export async function getCantripCandidates(keywords) {
  const normalized = (keywords || []).map((k) => k.toLowerCase());
  const matches = [];
  const fallback = [];

  for (const packName of await getSpellPackNames()) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    const index = await getPackIndex(pack, ["type", "name", "system.level"]);
    for (const entry of index) {
      if (entry.type !== "spell") continue;
      const level = Number(entry.system?.level ?? 0);
      if (level !== 0) continue; // Only cantrips
      const haystack = getSearchStrings(entry);
      const record = { ...entry, pack: pack.collection };
      if (normalized.length && normalized.some((k) => haystack.some((h) => h.includes(k)))) {
        matches.push(record);
      } else {
        fallback.push(record);
      }
    }
  }

  return preferLocalizedNamedEntries(matches.length ? matches : fallback);
}

/**
 * Get spell candidates from packs (leveled spells 1+)
 * @param {number} maxLevel - Max spell level
 * @param {string[]} keywords - Keywords to match
 * @returns {Promise<Array>}
 */
export async function getSpellCandidates(maxLevel, keywords) {
  const normalized = (keywords || []).map((k) => k.toLowerCase());
  const matches = [];
  const fallback = [];

  for (const packName of await getSpellPackNames()) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    const index = await getPackIndex(pack, ["type", "name", "system.level"]);
    for (const entry of index) {
      if (entry.type !== "spell") continue;
      const level = Number(entry.system?.level ?? 0);
      if (!Number.isFinite(level) || level < 1 || level > maxLevel) continue; // Skip cantrips (level 0)
      const haystack = getSearchStrings(entry);
      const record = { ...entry, pack: pack.collection };
      if (normalized.length && normalized.some((k) => haystack.some((h) => h.includes(k)))) {
        matches.push(record);
      } else {
        fallback.push(record);
      }
    }
  }

  return preferLocalizedNamedEntries(matches.length ? matches : fallback);
}

/**
 * Get all spell pack names
 * @returns {Promise<string[]>}
 */
export async function getSpellPackNames() {
  ensureNpcGeneratorLookupCacheState();
  const preferredSeed = getPacks("spells") || [];
  const allItemPacks = Array.from(collectAllItemPackNames()).sort();
  const cacheKey = `${preferredSeed.join("|")}::${allItemPacks.join("|")}`;
  if (
    NPC_GENERATOR_LOOKUP_CACHE.spellPackNames &&
    NPC_GENERATOR_LOOKUP_CACHE.spellPackNamesKey === cacheKey
  ) {
    return NPC_GENERATOR_LOOKUP_CACHE.spellPackNames.slice();
  }

  const preferred = new Set(preferredSeed);
  for (const packName of allItemPacks) {
    if (preferred.has(packName)) continue;
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    try {
      const index = await getPackIndex(pack, ["type"]);
      if (index.some((entry) => entry.type === "spell")) {
        preferred.add(packName);
      }
    } catch {
      // ignore
    }
  }
  const resolved = Array.from(preferred);
  NPC_GENERATOR_LOOKUP_CACHE.spellPackNamesKey = cacheKey;
  NPC_GENERATOR_LOOKUP_CACHE.spellPackNames = resolved;
  return resolved.slice();
}


/**
 * Build cached spells fallback
 * @param {number} maxLevel - Max spell level
 * @param {string[]} keywords - Keywords
 * @param {number} count - Count
 * @returns {Object[]}
 */
export function buildCachedSpellItemsFallback(maxLevel, keywords, count) {
  const normalized = (keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
  const docs = getCachedDocsForPacks(getPacks("spells")).filter((doc) => doc.type === "spell");
  if (!docs.length) return [];

  const byLevel = docs.filter((doc) => {
    const level = Number(doc.system?.level ?? 0);
    return Number.isFinite(level) && level <= maxLevel;
  });

  const pool = byLevel.length ? byLevel : docs;
  const matches = normalized.length
    ? pool.filter((doc) => normalized.some((k) => getSearchStrings(doc).some((h) => h.includes(k))))
    : pool;

  const preferredPool = preferLocalizedNamedEntries(matches.length ? matches : pool);
  const picked = pickRandomN(preferredPool.length ? preferredPool : pool, count);
  return picked.map((doc) => cloneItemData(doc));
}

function preferLocalizedNamedEntries(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!list.length) return [];

  const preferredScript = detectPreferredScriptByLanguage();
  if (!preferredScript) return list;

  const preferred = list.filter((entry) => detectTextScript(entry?.name) === preferredScript);
  if (preferred.length) return preferred;

  if (preferredScript !== "latin") {
    const latin = list.filter((entry) => detectTextScript(entry?.name) === "latin");
    if (latin.length) return latin;
  }
  return list;
}

/**
 * Build feature items
 * @param {Object} npc - NPC data
 * @returns {Promise<Object[]>}
 */
export async function buildFeatureItems(npc) {
  const tags = npc.archetype.tags || [];
  const count = npc.importantNpc ? 2 : 1;
  const keywords = getFeatureKeywords(tags, npc.archetype.attackStyle);
  const out = [];

  for (let i = 0; i < count; i++) {
    const feature =
      (await getRandomItemByKeywords(
        getPacks("features"),
        keywords,
        (entry) => entry.type === "feat"
      )) || (await getRandomItemFromPacks(getPacks("features"), (entry) => entry.type === "feat"));

    if (feature) out.push(cloneItemData(toItemData(feature)));
  }

  if (out.length) return out;
  const cachedFeature = getRandomCachedDocByKeywords(
    getPacks("features"),
    keywords,
    (doc) => doc.type === "feat"
  );
  if (cachedFeature) return [ensureActivities(cloneItemData(cachedFeature))];
  return out;
}

/**
 * Get feature keywords
 * @param {string[]} tags - Archetype tags
 * @param {string} attackStyle - Attack style
 * @returns {string[]}
 */
export function getFeatureKeywords(tags, attackStyle) {
  const keywords = ["attack", "strike", "parry", "brute", "multiattack", "aggressive"];
  if (attackStyle === "ranged") keywords.push("archery", "aim", "sharpshooter", "sniper");
  if (attackStyle === "melee") keywords.push("cleave", "riposte", "grapple", "shield");
  if (tags.includes("criminal")) keywords.push("sneak", "backstab", "poison", "ambush", "evasion");
  if (tags.includes("wilderness")) keywords.push("hunter", "tracker", "skirmisher", "camouflage", "beast");
  if (tags.includes("law")) keywords.push("guard", "sentinel", "defense");
  return keywords;
}

/**
 * Build class feature items
 * @param {Object} npc - NPC data
 * @returns {Promise<Object[]>}
 */
export async function buildClassFeatureItems(npc) {
  const className = getClassForArchetype(npc.archetype);
  const count = npc.importantNpc ? 2 : 1;
  const out = [];

  const candidates = await getClassFeatureCandidates(className);
  const picked = pickRandomN(candidates, count);
  for (const entry of picked) {
    const cached = getCachedDoc(entry.pack, entry._id);
    if (cached) {
      const item = cloneItemData(cached);
      out.push(ensureActivities(item));
      continue;
    }
    const pack = game.packs?.get(entry.pack);
    if (!pack) continue;
    const doc = await pack.getDocument(entry._id);
    if (doc) {
      const item = doc.toObject();
      out.push(ensureActivities(item));
    }
  }

  if (out.length) return out;
  const cachedFallback = getRandomCachedDocByKeywords(
    getPacks("classFeatures"),
    [className],
    (doc) => doc.type === "feat"
  );
  return cachedFallback ? [ensureActivities(cloneItemData(cachedFallback))] : out;
}

/**
 * Get class feature candidates
 * @param {string} className - Class name
 * @returns {Promise<Array>}
 */
export async function getClassFeatureCandidates(className) {
  ensureNpcGeneratorLookupCacheState();
  const packs = getPacks("classFeatures");
  const matches = [];
  const fallback = [];
  const needle = className.toLowerCase();
  const cacheKey = `${packs.join("|")}|${needle}`;
  if (NPC_GENERATOR_LOOKUP_CACHE.classFeatureCandidatesByKey.has(cacheKey)) {
    return NPC_GENERATOR_LOOKUP_CACHE.classFeatureCandidatesByKey.get(cacheKey).slice();
  }

  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    const index = await getPackIndex(pack, ["type", "name", "system.requirements"]);
    for (const entry of index) {
      if (entry.type !== "feat") continue;
      const requirements = String(entry.system?.requirements || "").toLowerCase();
      const record = { ...entry, pack: pack.collection };
      if (requirements.includes(needle)) {
        matches.push(record);
      } else {
        fallback.push(record);
      }
    }
  }

  const result = matches.length ? matches : fallback;
  if (NPC_GENERATOR_LOOKUP_CACHE.classFeatureCandidatesByKey.size >= LOOKUP_CACHE_MAX_CLASS_KEYS) {
    NPC_GENERATOR_LOOKUP_CACHE.classFeatureCandidatesByKey.clear();
  }
  NPC_GENERATOR_LOOKUP_CACHE.classFeatureCandidatesByKey.set(cacheKey, result);
  return result.slice();
}

// ========== Role Items (Equipment) ==========

/**
 * Build role items (armor, equipment)
 * @param {Object} npc - NPC data
 * @returns {Promise<Object[]>}
 */
export async function buildRoleItems(npc) {
  const tags = npc.archetype.tags || [];
  const style = npc.archetype.attackStyle;
  const out = [];
  const added = new Set();
  const packs = getPacks("weapons").concat(getPacks("loot"));
  const budget = npc.budget || "normal";

  const armor = await getArmorItemByStyle(style, tags);
  if (armor && isWithinBudget(armor, budget)) {
    addUniqueItem(out, added, cloneItemData(toItemData(armor)));
  }
  if (!armor) {
    const cachedArmor = getRandomCachedDocByKeywordsWithBudget(
      packs,
      ["armor", "shield", "mail", "leather"],
      (doc) => (doc.type === "equipment" || doc.type === "armor") && isAllowedItemDoc(doc),
      budget
    );
    if (cachedArmor) addUniqueItem(out, added, cloneItemData(cachedArmor));
  }

  const className = getClassForArchetype(npc.archetype);
  const equipmentKeywords = getClassEquipmentKeywords(className);
  if (style === "melee") equipmentKeywords.push("armor", "shield", "chain", "leather", "mail");
  if (style === "ranged") equipmentKeywords.push("quiver", "arrows", "bolts");
  if (style === "mixed") equipmentKeywords.push("dagger", "shortsword", "leather");
  if (style === "caster") equipmentKeywords.push("focus", "component", "spellbook", "staff");

  if (tags.includes("criminal")) equipmentKeywords.push("thieves' tools", "lockpick", "dagger");
  if (tags.includes("wilderness")) equipmentKeywords.push("explorer", "rope", "cloak", "rations");
  if (tags.includes("social")) equipmentKeywords.push("fine clothes", "signet", "perfume");
  if (tags.includes("holy")) equipmentKeywords.push("holy", "symbol", "prayer");
  if (tags.includes("dark")) equipmentKeywords.push("hood", "poison");

  const desiredCount = getRoleItemCount(npc.tier, npc.importantNpc);
  const pools = buildEquipmentKeywordPools(style, tags, className);
  const picks = pickRandomN(pools, desiredCount);
  for (const keywords of picks) {
    const item = await pickItemFromKeywords(
      packs,
      keywords,
      (entry) =>
        (entry.type === "equipment" || entry.type === "loot" || entry.type === "consumable") &&
        isAllowedItemEntry(entry),
      (doc) =>
        (doc.type === "equipment" || doc.type === "loot" || doc.type === "consumable") &&
        isAllowedItemDoc(doc),
      budget
    );
    if (item) addUniqueItem(out, added, item);
  }

  // Extra class-flavored pick as a fallback for variety
  if (equipmentKeywords.length) {
    const picked = await pickItemFromKeywords(
      packs,
      equipmentKeywords,
      (entry) =>
        (entry.type === "equipment" || entry.type === "loot" || entry.type === "consumable") &&
        isAllowedItemEntry(entry),
      (doc) =>
        (doc.type === "equipment" || doc.type === "loot" || doc.type === "consumable") &&
        isAllowedItemDoc(doc),
      budget
    );
    if (picked) addUniqueItem(out, added, picked);
  }

  return out;
}

/**
 * Get role item count
 * @param {number} tier - Tier level
 * @param {boolean} importantNpc - Whether NPC is boss
 * @returns {number}
 */
export function getRoleItemCount(tier, importantNpc) {
  let count = 1;
  if (tier >= 2) count += 1;
  if (tier >= 3) count += 1;
  if (importantNpc) count += 1;
  return Math.min(4, Math.max(1, count));
}

/**
 * Build equipment keyword pools
 * @param {string} style - Attack style
 * @param {string[]} tags - Archetype tags
 * @param {string} className - Class name
 * @returns {string[][]}
 */
export function buildEquipmentKeywordPools(style, tags, className) {
  const pools = [];
  pools.push(getClassEquipmentKeywords(className));

  if (style === "melee") pools.push(["shield", "buckler"]);
  if (style === "ranged") pools.push(["arrows", "bolts", "quiver"]);
  if (style === "mixed") pools.push(["dagger", "shortsword", "handaxe"]);
  if (style === "caster") pools.push(["component", "focus", "spellbook", "wand", "staff"]);

  if (tags.includes("criminal")) pools.push(["thieves' tools", "lockpick", "crowbar", "disguise"]);
  if (tags.includes("wilderness")) pools.push(["rope", "rations", "torch", "bedroll", "waterskin"]);
  if (tags.includes("social")) pools.push(["fine clothes", "instrument", "signet", "perfume"]);
  if (tags.includes("holy")) pools.push(["holy symbol", "censer", "prayer", "reliquary"]);
  if (tags.includes("dark")) pools.push(["poison", "antitoxin", "hood", "mask"]);

  pools.push(["backpack", "pouch", "satchel"]);
  pools.push(["healer's kit", "bandage", "salve"]);
  pools.push(["oil", "lantern", "flask", "candle"]);
  pools.push(["chalk", "mirror", "bell", "whistle"]);
  pools.push(["grappling hook", "crowbar", "hammer", "piton"]);

  return pools.filter((p) => p && p.length);
}

/**
 * Get armor item by style
 * @param {string} style - Attack style
 * @param {string[]} tags - Archetype tags
 * @returns {Promise<Object|null>}
 */
export async function getArmorItemByStyle(style, tags) {
  const armorKeywords = [];
  if (style === "melee") armorKeywords.push("chain", "scale", "breastplate", "plate", "shield");
  if (style === "ranged") armorKeywords.push("leather", "studded", "chain shirt");
  if (style === "mixed") armorKeywords.push("leather", "studded", "chain shirt");
  if (style === "caster") armorKeywords.push("mage armor", "robe", "cloak");

  if (tags.includes("criminal")) armorKeywords.push("leather", "studded");
  if (tags.includes("wilderness")) armorKeywords.push("leather", "hide");
  if (tags.includes("holy")) armorKeywords.push("chain", "scale", "shield");

  const preferredNames = [];
  if (tags.includes("criminal")) {
    preferredNames.push("Leather Armor", "Studded Leather Armor");
  } else if (style === "melee") {
    preferredNames.push("Chain Mail", "Scale Mail", "Breastplate", "Chain Shirt", "Shield");
  } else {
    preferredNames.push("Leather Armor", "Studded Leather Armor", "Chain Shirt");
  }

  for (const name of preferredNames) {
    const byName = await getItemByNameFromPacks(
      getPacks("weapons").concat(getPacks("loot")),
      name
    );
    if (byName && isAllowedItemDoc(byName)) return byName;
  }

  const armor =
    (await getRandomItemByKeywords(
      getPacks("weapons"),
      armorKeywords,
      (entry) => (entry.type === "equipment" || entry.type === "armor") && isAllowedItemEntry(entry)
    )) ||
    (await getRandomItemByKeywords(
      getPacks("loot"),
      armorKeywords,
      (entry) => (entry.type === "equipment" || entry.type === "armor") && isAllowedItemEntry(entry)
    ));

  return armor;
}

// ========== Loot Building ==========

/**
 * Build loot item
 * @param {string} name - Item name
 * @param {Object} npc - NPC data
 * @returns {Promise<Object>}
 */
export async function buildLootItem(name, npc) {
  const allowMagic = shouldAllowMagicItem(npc);
  const lootPacks = getPacks("loot");
  const budget = npc?.budget || "normal";
  const byName = await getItemByNameFromPacks(lootPacks, name);
  if (byName && isAllowedItemDoc(byName, allowMagic) && isWithinBudget(byName, budget, true)) {
    const lootData = cloneItemData(toItemData(byName));
    if (lootData.system?.quantity !== undefined) lootData.system.quantity = 1;
    return lootData;
  }

  const cachedByName = getCachedDocByName(lootPacks, name);
  if (cachedByName && isAllowedItemDoc(cachedByName, allowMagic) && isWithinBudget(cachedByName, budget, true)) {
    const lootData = cloneItemData(cachedByName);
    if (lootData.system?.quantity !== undefined) lootData.system.quantity = 1;
    return lootData;
  }

  const compendiumLoot = await getRandomItemFromAllPacksWithBudget(
    lootPacks,
    (entry) =>
      (entry.type === "loot" || entry.type === "consumable" || entry.type === "equipment") &&
      isAllowedItemEntry(entry, allowMagic),
    budget,
    true
  );

  if (compendiumLoot) {
    const lootData = cloneItemData(toItemData(compendiumLoot));
    if (lootData.system?.quantity !== undefined) lootData.system.quantity = 1;
    return lootData;
  }

  const cachedLoot =
    getRandomCachedDocByKeywordsWithBudget(
      lootPacks,
      [name],
      (doc) => (doc.type === "loot" || doc.type === "consumable" || doc.type === "equipment") &&
        isAllowedItemDoc(doc, allowMagic),
      budget,
      true
    ) ||
    getRandomCachedDocByKeywordsWithBudget(
      lootPacks,
      [],
      (doc) => (doc.type === "loot" || doc.type === "consumable" || doc.type === "equipment") &&
        isAllowedItemDoc(doc, allowMagic),
      budget,
      true
    );

  if (cachedLoot) {
    const lootData = cloneItemData(cachedLoot);
    if (lootData.system?.quantity !== undefined) lootData.system.quantity = 1;
    return lootData;
  }

  const isPotion = name.toLowerCase().includes("potion");
  return {
    name,
    type: isPotion ? "consumable" : "loot",
    system: {
      quantity: 1,
      description: { value: "" },
      consumableType: isPotion ? "potion" : ""
    }
  };
}

/**
 * Build random loot extras
 * @param {Object} npc - NPC data
 * @param {Object[]} existingItems - Already added items
 * @returns {Promise<Object[]>}
 */
export async function buildRandomLootExtras(npc, existingItems = []) {
  const allowMagic = shouldAllowMagicItem(npc);
  const budget = npc?.budget || "normal";
  const lootPacks = getPacks("loot");
  let extraCount = 0;
  if (npc.tier >= 3) extraCount = 2;
  else if (npc.tier >= 2) extraCount = 1;
  if (npc.importantNpc) extraCount += 1;
  if (extraCount <= 0) return [];

  const used = new Set(
    existingItems
      .map((i) => String(i?.name || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const extras = [];
  for (let i = 0; i < extraCount; i++) {
    const item = await getRandomItemFromAllPacksWithBudget(
      lootPacks,
      (entry) => {
        const itemName = String(entry.name || "").trim().toLowerCase();
        if (itemName && used.has(itemName)) return false;
        return (
          (entry.type === "loot" || entry.type === "consumable" || entry.type === "equipment") &&
          isAllowedItemEntry(entry, allowMagic)
        );
      },
      budget,
      true
    );
    if (!item) continue;
    const data = cloneItemData(toItemData(item));
    if (data?.name) used.add(String(data.name).trim().toLowerCase());
    if (data?.system?.quantity !== undefined) data.system.quantity = 1;
    extras.push(data);
  }

  return extras;
}
