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
  MAGIC_ITEM_CHANCE
} from "./constants.js";
import { DATA_CACHE } from "./data-loader.js";
import {
  pickRandom,
  pickRandomN,
  pickRandomOr,
  randInt,
  chance,
  cloneData,
  toItemData
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

  const ac = Math.min(20, BASE_AC + tier + (importantNpc ? 1 : 0));
  const hp = Math.max(HP_MINIMUM, HP_BASE + tier * HP_PER_TIER + randInt(0, tier * HP_VARIANCE_PER_TIER) + (importantNpc ? HP_BOSS_BONUS : 0));
  const speed = 30;

  const prof = getProfBonus(tier);
  const cr = rollCrByTier(tier);

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
  const alignment = pickRandom([
    "Lawful Good",
    "Neutral Good",
    "Chaotic Good",
    "Lawful Neutral",
    "Neutral",
    "Chaotic Neutral",
    "Lawful Evil",
    "Neutral Evil",
    "Chaotic Evil"
  ]);

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

  if (npc.loot) {
    const lootItems = [];
    for (const name of npc.loot.items) {
      lootItems.push(await buildLootItem(name, npc));
    }
    lootItems.push(...(await buildRandomLootExtras(npc, lootItems)));
    items.push(...lootItems);
  }

  normalizeArmorItems(items);

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
      abilities: abilityData,
      skills: skillsData,
      attributes: {
        ac: { value: npc.ac },
        hp: { value: npc.hp, max: npc.hp, temp: 0 },
        movement: { walk: npc.speed },
        prof: npc.prof
      },
      details: {
        cr: npc.cr,
        alignment,
        race: npc.race,
        type: { value: "humanoid", subtype: "" },
        biography: { value: biography }
      },
      traits: {
        size: "med",
        languages: { value: [] }
      },
      currency: npc.loot ? npc.loot.coins : { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
    },
    items
  };

  return actorData;
}

/**
 * Build actor data from AI full blueprint (resolves named content via compendiums)
 * @param {Object} blueprint - AI full NPC blueprint
 * @param {string|null} folderId - Folder ID
 * @returns {Promise<{actorData: Object, resolvedItems: number, missingItems: number}>}
 */
export async function buildActorDataFromAiBlueprint(blueprint, folderId = null) {
  const npc = normalizeAiBlueprintForActor(blueprint);
  const { items, resolvedItems, missingItems } = await resolveAiBlueprintItems(npc);

  if (!items.some((item) => String(item?.type || "").toLowerCase() === "weapon")) {
    const fallbackWeapon = await buildWeaponItem(npc);
    if (fallbackWeapon) items.push(fallbackWeapon);
  }

  normalizeArmorItems(items);

  const biography = buildBiography(npc);
  const alignment = String(npc.alignment || "").trim() || pickRandom([
    "Lawful Good",
    "Neutral Good",
    "Chaotic Good",
    "Lawful Neutral",
    "Neutral",
    "Chaotic Neutral",
    "Lawful Evil",
    "Neutral Evil",
    "Chaotic Evil"
  ]);

  const abilityData = {};
  for (const [key, value] of Object.entries(npc.abilities || {})) {
    abilityData[key] = { value: Number(value) || 10 };
  }
  const skillsData = buildSkillsData(npc.skillIds || npc.archetype.skills || []);

  const tokenImg = String(npc?.tokenImg || "").trim() || getTokenImageForNpc(npc);
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
      abilities: abilityData,
      skills: skillsData,
      attributes: {
        ac: { value: npc.ac },
        hp: { value: npc.hp, max: npc.hp, temp: 0 },
        movement: { walk: npc.speed },
        prof: npc.prof
      },
      details: {
        cr: npc.cr,
        alignment,
        race: npc.race,
        type: { value: "humanoid", subtype: "" },
        biography: { value: biography }
      },
      traits: {
        size: "med",
        languages: { value: [] }
      },
      currency: npc.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
    },
    items
  };

  return { actorData, resolvedItems, missingItems };
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
    prof: clampRange(source.prof, 2, 6, getProfBonus(tier)),
    ac: clampRange(source.ac, 10, 24, 12 + tier),
    hp: clampRange(source.hp, 4, 300, 10 + tier * 12),
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

async function resolveAiBlueprintItems(npc) {
  const aiItems = npc.aiItems || {};
  const budget = npc.budget || "normal";
  const allGearPacks = uniquePackNames([...getPacks("weapons"), ...getPacks("loot")]);
  const featurePacks = uniquePackNames([...getPacks("classFeatures"), ...getPacks("features")]);
  const groups = [
    {
      names: aiItems.weapons,
      packs: getPacks("weapons"),
      allowedTypes: ["weapon", "equipment"],
      equip: true
    },
    {
      names: aiItems.armor,
      packs: allGearPacks,
      allowedTypes: ["equipment"],
      equip: true
    },
    {
      names: aiItems.equipment,
      packs: allGearPacks,
      allowedTypes: ["equipment", "loot", "consumable"]
    },
    {
      names: aiItems.consumables,
      packs: getPacks("loot"),
      allowedTypes: ["consumable", "loot", "equipment"]
    },
    {
      names: aiItems.loot,
      packs: getPacks("loot"),
      allowedTypes: ["loot", "consumable", "equipment"]
    },
    {
      names: aiItems.spells,
      packs: getPacks("spells"),
      allowedTypes: ["spell"]
    },
    {
      names: aiItems.features,
      packs: featurePacks,
      allowedTypes: ["feat"],
      ensureFeatureActivities: true
    }
  ];

  const items = [];
  const addedNames = new Set();
  let resolvedItems = 0;
  let missingItems = 0;

  for (const group of groups) {
    for (const rawName of group.names || []) {
      const name = String(rawName || "").trim();
      if (!name) continue;

      const item = await resolveAiNamedItem(name, group, budget);
      if (!item) {
        missingItems += 1;
        continue;
      }

      const dedupeName = String(item.name || "").trim().toLowerCase();
      if (!dedupeName || addedNames.has(dedupeName)) continue;
      addedNames.add(dedupeName);
      items.push(item);
      resolvedItems += 1;
    }
  }

  return { items, resolvedItems, missingItems };
}

async function resolveAiNamedItem(name, group, budget) {
  const packs = Array.isArray(group?.packs) ? group.packs : [];
  const allowedTypes = Array.isArray(group?.allowedTypes) ? group.allowedTypes : [];
  if (!packs.length || !allowedTypes.length) return null;

  const exact = await getItemByNameFromPacks(packs, name);
  if (exact && allowedTypes.includes(String(exact.type || "").toLowerCase())) {
    return prepareResolvedAiItem(exact, group);
  }

  const keywords = buildLookupKeywordsFromName(name);
  if (!keywords.length) return null;

  const fuzzy = await getRandomItemByKeywordsFromAllPacksWithBudget(
    packs,
    keywords,
    (entry) => allowedTypes.includes(String(entry.type || "").toLowerCase()),
    budget,
    true
  );
  if (!fuzzy) return null;
  return prepareResolvedAiItem(fuzzy, group);
}

function prepareResolvedAiItem(itemDoc, group) {
  const item = cloneItemData(toItemData(itemDoc));
  if (!item) return null;

  if (group?.equip && item.system?.equipped !== undefined) item.system.equipped = true;
  if (group?.equip && item.type === "weapon" && item.system?.proficient !== undefined) {
    item.system.proficient = true;
  }
  if (group?.ensureFeatureActivities && item.type === "feat") {
    return ensureActivities(item);
  }
  return item;
}

function normalizeAiItemGroups(rawItems) {
  const source = rawItems && typeof rawItems === "object" ? rawItems : {};
  const flatItems = normalizeStringArrayForActor(source.items, 18, 80);
  const groupedFlat = splitFlatItemNamesForActor(flatItems);
  const featuresFromActions = normalizeStringArrayForActor(source.actions, 12, 100);
  return {
    weapons: dedupeStringList([
      ...normalizeStringArrayForActor(source.weapons, 6, 80),
      ...groupedFlat.weapons
    ], 6),
    armor: dedupeStringList([
      ...normalizeStringArrayForActor(source.armor, 4, 80),
      ...groupedFlat.armor
    ], 4),
    equipment: dedupeStringList([
      ...normalizeStringArrayForActor(source.equipment, 12, 80),
      ...groupedFlat.equipment
    ], 12),
    consumables: dedupeStringList([
      ...normalizeStringArrayForActor(source.consumables, 8, 80),
      ...groupedFlat.consumables
    ], 8),
    loot: dedupeStringList([
      ...normalizeStringArrayForActor(source.loot, 10, 80),
      ...groupedFlat.loot
    ], 10),
    spells: dedupeStringList(normalizeStringArrayForActor(source.spells, 14, 80), 14),
    features: dedupeStringList([
      ...normalizeStringArrayForActor(source.features, 12, 100),
      ...featuresFromActions
    ], 14)
  };
}

function normalizeStringArrayForActor(value, maxItems = 6, maxLength = 80, fallback = []) {
  const list = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  const clean = list
    .map((part) => String(part || "").replace(/\s+/g, " ").trim().slice(0, maxLength))
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

  for (const itemName of itemNames || []) {
    const lower = String(itemName || "").toLowerCase();
    if (!lower) continue;
    if (/(sword|axe|mace|hammer|bow|crossbow|dagger|spear|halberd|staff|rapier|whip|javelin|flail)/i.test(lower)) {
      result.weapons.push(itemName);
      continue;
    }
    if (/(armor|mail|plate|shield|helm|gauntlet|breastplate|leather|chain)/i.test(lower)) {
      result.armor.push(itemName);
      continue;
    }
    if (/(potion|elixir|scroll|ammo|arrows|bolts|kit|healer|ration)/i.test(lower)) {
      result.consumables.push(itemName);
      continue;
    }
    if (/(gem|coin|ring|necklace|trinket|relic|idol|token)/i.test(lower)) {
      result.loot.push(itemName);
      continue;
    }
    result.equipment.push(itemName);
  }

  return {
    weapons: dedupeStringList(result.weapons, 6),
    armor: dedupeStringList(result.armor, 4),
    equipment: dedupeStringList(result.equipment, 12),
    consumables: dedupeStringList(result.consumables, 8),
    loot: dedupeStringList(result.loot, 10)
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
  const lines = [];
  lines.push(`<p><strong>Role:</strong> ${npc.archetype.name} (Tier ${npc.tier}, CR ${npc.cr})</p>`);
  if (npc.className) lines.push(`<p><strong>Class:</strong> ${npc.className}</p>`);
  lines.push(`<p><strong>Race:</strong> ${npc.race}</p>`);
  lines.push(`<p><strong>Appearance:</strong> ${npc.appearance.join(", ")}</p>`);
  lines.push(`<p><strong>Speech:</strong> ${npc.speech}</p>`);
  lines.push(`<p><strong>Motivation:</strong> ${npc.motivation}</p>`);
  if (npc.secret) lines.push(`<p><strong>Secret:</strong> ${npc.secret}</p>`);
  if (npc.hook) lines.push(`<p><strong>Hook:</strong> ${npc.hook}</p>`);
  if (npc.rumor) lines.push(`<p><strong>Rumor:</strong> ${npc.rumor}</p>`);
  if (npc.mannerism) lines.push(`<p><strong>Mannerism:</strong> ${npc.mannerism}</p>`);
  lines.push(`<p><strong>Quirk:</strong> ${npc.quirk}</p>`);
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
 * Get max spell level by tier
 * @param {number} tier - Tier level
 * @returns {number}
 */
export function getMaxSpellLevelByTier(tier) {
  if (tier <= 1) return 1;
  if (tier === 2) return 2;
  if (tier === 3) return 3;
  return 4;
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

  return matches.length ? matches : fallback;
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

  return matches.length ? matches : fallback;
}

/**
 * Get all spell pack names
 * @returns {Promise<string[]>}
 */
export async function getSpellPackNames() {
  const preferred = new Set(getPacks("spells") || []);
  const allItemPacks = collectAllItemPackNames();
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
  return Array.from(preferred);
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

  const picked = pickRandomN(matches.length ? matches : pool, count);
  return picked.map((doc) => cloneItemData(doc));
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
  const matches = [];
  const fallback = [];
  const needle = className.toLowerCase();

  for (const packName of getPacks("classFeatures")) {
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

  return matches.length ? matches : fallback;
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
