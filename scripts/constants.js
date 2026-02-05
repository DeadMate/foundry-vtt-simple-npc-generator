/**
 * Constants and configuration for NPC Button module
 * @module constants
 */

export const MODULE_ID = "npc-button-5e";
export const COMPENDIUM_CACHE_FILE = "compendium-cache";
export const USE_COMPENDIUM_CACHE = true;

export const CACHE_DOC_TYPES = new Set([
  "weapon",
  "equipment",
  "loot",
  "consumable",
  "feat",
  "spell"
]);

export const COMPENDIUMS = {
  weapons: ["dnd5e.items", "dnd5e.equipment24"],
  loot: ["dnd5e.tradegoods", "dnd5e.items", "dnd5e.equipment24"],
  spells: ["dnd5e.spells", "dnd5e.spells24"],
  features: [
    "dnd5e.monsterfeatures",
    "dnd5e.monsterfeatures24",
    "dnd5e.classfeatures",
    "dnd5e.classfeatures24"
  ],
  classFeatures: ["dnd5e.classfeatures", "dnd5e.classfeatures24"],
  species: [
    "dnd5e.species",
    "dnd5e.species24",
    "dnd5e.races",
    "laaru-dnd5-hw.races",
    "laaru-dnd5-hw.racesMPMM"
  ]
};

export const TOKEN_ASSETS = [
  "token-01-warrior.svg",
  "token-02-rogue.svg",
  "token-03-archer.svg",
  "token-04-mage.svg",
  "token-05-cleric.svg",
  "token-06-ranger.svg",
  "token-07-bard.svg",
  "token-08-paladin.svg",
  "token-09-barbarian.svg",
  "token-10-monk.svg",
  "token-11-assassin.svg",
  "token-12-guardian.svg",
  "token-13-warlock.svg",
  "token-14-druid.svg",
  "token-15-sorcerer.svg",
  "token-16-necromancer.svg",
  "token-17-pirate.svg",
  "token-18-noble.svg",
  "token-19-soldier.svg",
  "token-20-hunter.svg"
];

export const TOKEN_ROLE_MAP = {
  warrior: ["martial", "melee"],
  rogue: ["criminal", "stealth"],
  archer: ["ranged", "wilderness"],
  mage: ["knowledge", "caster"],
  cleric: ["holy"],
  ranger: ["wilderness"],
  bard: ["social"],
  paladin: ["holy", "martial"],
  barbarian: ["brute"],
  monk: ["monk"],
  assassin: ["criminal"],
  guardian: ["law", "defense"],
  warlock: ["dark", "caster"],
  druid: ["wilderness", "nature"],
  sorcerer: ["caster"],
  necromancer: ["dark"],
  pirate: ["criminal"],
  noble: ["social", "law"],
  soldier: ["martial", "law"],
  hunter: ["wilderness", "ranged"]
};

/** Budget thresholds in copper pieces */
export const BUDGET_RANGES = {
  poor: { min: 0, max: 100 },      // up to 1 gp
  normal: { min: 10, max: 2000 },  // 0.1 gp to 20 gp
  well: { min: 50, max: 5000 },    // 0.5 gp to 50 gp
  elite: { min: 200, max: 20000 }, // 2 gp to 200 gp (non-magic)
  eliteMagic: { min: 200, max: 200000 } // 2 gp to 2000 gp (magic allowed)
};

/** CR tables by tier */
export const CR_BY_TIER = {
  1: ["1/8", "1/4", "1/2"],
  2: ["1", "2", "3"],
  3: ["4", "5", "6"],
  4: ["7", "8", "9", "10"]
};

/** Proficiency bonus by tier */
export const PROF_BY_TIER = {
  1: 2,
  2: 2,
  3: 3,
  4: 4
};

/** Base AC formula: 11 + tier + (boss bonus) */
export const BASE_AC = 11;

/** Base HP formula components */
export const HP_BASE = 8;
export const HP_PER_TIER = 8;
export const HP_VARIANCE_PER_TIER = 6;
export const HP_BOSS_BONUS = 6;
export const HP_MINIMUM = 6;

/** Probability for magic items by tier */
export const MAGIC_ITEM_CHANCE = {
  1: 0.02,
  2: 0.05,
  3: 0.1,
  4: 0.2,
  boss: 0.5
};
// trigger release
