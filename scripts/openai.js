/**
 * OpenAI integration for NPC flavor generation
 * @module openai
 */

import { MODULE_ID } from "./constants.js";
import { t } from "./i18n.js";

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_DEFAULT_IMAGE_MODEL = "gpt-image-1-mini";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MAX_BATCH = 3;
const OPENAI_TIMEOUT_MS = 25000;
const AI_FULL_ATTACK_STYLES = ["melee", "ranged", "caster", "mixed"];
const AI_FULL_TAGS = [
  "martial",
  "criminal",
  "stealth",
  "wilderness",
  "knowledge",
  "caster",
  "holy",
  "dark",
  "social",
  "law",
  "defense",
  "brute",
  "nature"
];
const AI_FULL_CLASSES = [
  "Fighter",
  "Rogue",
  "Wizard",
  "Cleric",
  "Warlock",
  "Ranger",
  "Bard",
  "Paladin",
  "Barbarian",
  "Monk",
  "Druid",
  "Sorcerer"
];

const SETTING_KEYS = {
  enabled: "openAiEnabled",
  model: "openAiModel",
  imageModel: "openAiImageModel",
  baseUrl: "openAiBaseUrl",
  maxBatch: "openAiMaxBatch",
  apiKey: "openAiApiKey"
};

/**
 * OpenAI API key settings form
 */
class OpenAiApiKeyConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-openai-api-key-config`,
      title: t("openai.apiKeyForm.title"),
      template: `modules/${MODULE_ID}/templates/openai-api-key.hbs`,
      width: 520,
      closeOnSubmit: true
    });
  }

  getData() {
    const key = getOpenAiApiKey();
    return {
      hasKey: !!key,
      keyPreview: maskApiKey(key)
    };
  }

  async _updateObject(event, formData) {
    const inputKey = String(formData.apiKey || "").trim();
    const clearKey = formData.clearKey === true || formData.clearKey === "on";

    if (inputKey) {
      await game.settings.set(MODULE_ID, SETTING_KEYS.apiKey, inputKey);
      ui.notifications?.info(t("openai.apiKeyForm.saved"));
      return;
    }

    if (clearKey) {
      await game.settings.set(MODULE_ID, SETTING_KEYS.apiKey, "");
      ui.notifications?.info(t("openai.apiKeyForm.cleared"));
    }
  }
}

/**
 * Open API key config dialog for current GM
 */
export function openOpenAiApiKeyDialog() {
  if (!game.user?.isGM) return;
  new OpenAiApiKeyConfig().render(true);
}

/**
 * Register OpenAI-related module settings
 */
export function registerOpenAiSettings() {
  game.settings.register(MODULE_ID, SETTING_KEYS.enabled, {
    name: `${MODULE_ID}.settings.openAiEnabled.name`,
    hint: `${MODULE_ID}.settings.openAiEnabled.hint`,
    scope: "client",
    config: false,
    restricted: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.model, {
    name: `${MODULE_ID}.settings.openAiModel.name`,
    hint: `${MODULE_ID}.settings.openAiModel.hint`,
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: OPENAI_DEFAULT_MODEL
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.imageModel, {
    name: `${MODULE_ID}.settings.openAiImageModel.name`,
    hint: `${MODULE_ID}.settings.openAiImageModel.hint`,
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: OPENAI_DEFAULT_IMAGE_MODEL
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.baseUrl, {
    name: `${MODULE_ID}.settings.openAiBaseUrl.name`,
    hint: `${MODULE_ID}.settings.openAiBaseUrl.hint`,
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: OPENAI_DEFAULT_BASE_URL
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.maxBatch, {
    name: `${MODULE_ID}.settings.openAiMaxBatch.name`,
    hint: `${MODULE_ID}.settings.openAiMaxBatch.hint`,
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: OPENAI_DEFAULT_MAX_BATCH
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.apiKey, {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });

  game.settings.registerMenu(MODULE_ID, "openAiApiKeyConfig", {
    name: `${MODULE_ID}.settings.openAiApiKeyMenu.name`,
    label: `${MODULE_ID}.settings.openAiApiKeyMenu.label`,
    hint: `${MODULE_ID}.settings.openAiApiKeyMenu.hint`,
    icon: "fas fa-key",
    type: OpenAiApiKeyConfig,
    restricted: true
  });
}

/**
 * Check if OpenAI integration is enabled
 * @returns {boolean}
 */
export function isOpenAiEnabled() {
  if (!game.user?.isGM) return false;
  return !!getOpenAiApiKey();
}

/**
 * Get configured OpenAI API key (local client setting)
 * @returns {string}
 */
export function getOpenAiApiKey() {
  return String(game.settings?.get(MODULE_ID, SETTING_KEYS.apiKey) || "").trim();
}

/**
 * Check if current GM client is ready for OpenAI calls
 * @returns {boolean}
 */
export function isOpenAiConfigured() {
  return !!(game.user?.isGM && isOpenAiEnabled() && getOpenAiApiKey());
}

/**
 * Get max number of NPCs processed by OpenAI in one run
 * @returns {number}
 */
export function getOpenAiMaxBatch() {
  const raw = Number(game.settings?.get(MODULE_ID, SETTING_KEYS.maxBatch) || OPENAI_DEFAULT_MAX_BATCH);
  const maxBatch = Math.floor(raw);
  return Math.max(1, Math.min(50, Number.isFinite(maxBatch) ? maxBatch : OPENAI_DEFAULT_MAX_BATCH));
}

/**
 * Generate NPC flavor fields via OpenAI
 * @param {Object} npc - NPC generation object
 * @returns {Promise<Object|null>} Partial NPC fields or null
 */
export async function generateNpcFlavorWithOpenAi(npc) {
  if (!npc) return null;
  if (!game.user?.isGM) {
    throw new Error(t("openai.errorGmOnlyGeneration"));
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error(t("openai.errorApiKeyMissing"));
  }

  const model = String(game.settings?.get(MODULE_ID, SETTING_KEYS.model) || OPENAI_DEFAULT_MODEL).trim() || OPENAI_DEFAULT_MODEL;
  const baseUrl = normalizeBaseUrl(
    String(game.settings?.get(MODULE_ID, SETTING_KEYS.baseUrl) || OPENAI_DEFAULT_BASE_URL)
  );
  const endpoint = `${baseUrl}/chat/completions`;

  const language = getInterfaceLanguageContext();
  const systemPrompt = [
    "You generate high-quality D&D 5e NPC flavor for live tabletop play.",
    "Return strict JSON only with keys: name, appearance, speech, motivation, secret, hook, quirk, rumor, mannerism.",
    "Write concrete, playable text; avoid vague fragments and generic filler.",
    `Write all flavor text in ${language.name}.`,
    "Every non-empty text field must be a complete sentence.",
    "Do not use markdown. Do not add extra keys."
  ].join(" ");

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS) : null;

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    };

    let feedbackIssues = [];
    let previousFlavor = null;
    let bestFlavor = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const userPrompt = buildFlavorPrompt(npc, {
        attempt,
        feedbackIssues,
        previousFlavor
      });
      const requestData = {
        model,
        temperature: attempt === 0 ? 0.65 : 0.45,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      };

      const content = await requestOpenAiChatCompletion(endpoint, headers, requestData, controller?.signal);
      if (!content) {
        throw new Error(t("openai.errorEmptyResponse"));
      }

      const parsed = parseJsonContent(content);
      const normalized = normalizeAiFlavor(parsed, npc);
      bestFlavor = normalized;

      const issues = evaluateFlavorQuality(normalized, npc);
      if (!issues.length) return normalized;

      feedbackIssues = issues;
      previousFlavor = normalized;
    }

    if (bestFlavor) return bestFlavor;
    throw new Error(t("openai.errorFlavorValidationFailed"));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Generate a full NPC blueprint via OpenAI (stats, flavor, and item name lists)
 * @param {Object} context - Generation context from dialog options
 * @returns {Promise<Object|null>} Normalized full NPC blueprint
 */
export async function generateFullNpcWithOpenAi(context = {}) {
  if (!game.user?.isGM) {
    throw new Error(t("openai.errorGmOnlyGeneration"));
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error(t("openai.errorApiKeyMissing"));
  }

  const model = String(game.settings?.get(MODULE_ID, SETTING_KEYS.model) || OPENAI_DEFAULT_MODEL).trim() || OPENAI_DEFAULT_MODEL;
  const baseUrl = normalizeBaseUrl(
    String(game.settings?.get(MODULE_ID, SETTING_KEYS.baseUrl) || OPENAI_DEFAULT_BASE_URL)
  );
  const endpoint = `${baseUrl}/chat/completions`;

  const language = getInterfaceLanguageContext();
  const systemPrompt = [
    "You generate complete D&D 5e NPC blueprints for Foundry VTT import.",
    "Return strict JSON only.",
    "Prioritize practical gameplay output: coherent stats, concrete personality, and real compendium-friendly item names.",
    `Write narrative fields in ${language.name}.`,
    `Prefer item/spell/feature/action names in ${language.name} if available; otherwise use English canonical names.`,
    "For items, return array entries as objects with keys: name, lookup.",
    "The lookup value must be an English canonical D&D item name for cross-language compendium matching.",
    "Use canonical D&D-style item, spell, and feature naming where possible.",
    "Do not include markdown or explanation text."
  ].join(" ");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };

  const requestData = {
    model,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildFullNpcPrompt(context, { manualCodeBlock: false }) }
    ]
  };

  const content = await requestOpenAiChatCompletion(endpoint, headers, requestData);
  if (!content) {
    throw new Error(t("openai.errorEmptyResponse"));
  }

  const parsed = parseJsonContent(content);
  return normalizeAiFullNpc(parsed, context);
}

/**
 * Build manual ChatGPT prompt for full NPC blueprint generation (no API required in module)
 * @param {Object} context - Generation context from dialog options
 * @returns {string}
 */
export function buildManualFullNpcPrompt(context = {}) {
  return buildFullNpcPrompt(context, { manualCodeBlock: true });
}

/**
 * Build manual ChatGPT prompt for encounter generation (multiple NPCs in one JSON array)
 * @param {Object} context - Generation context from dialog options
 * @returns {string}
 */
export function buildManualEncounterNpcPrompt(context = {}) {
  const count = clampNumber(context.count, 1, 50, 3);
  const tier = clampNumber(context.tier, 1, 4, 1);
  const suggestedLevel = tierToLevel(tier);
  const language = getInterfaceLanguageContext();
  const preferredTags = Array.isArray(context.archetypeTags)
    ? context.archetypeTags.map((value) => sanitizeFlavorText(value, 24)).filter(Boolean)
    : [];

  return [
    "Output the final answer inside exactly one ```json code block``` for easy copy.",
    "Do not include any text before or after the code block.",
    "Inside the code block, output a JSON array (not an object).",
    `The array must contain exactly ${count} NPC objects.`,
    "Each NPC object must follow this exact key order and data shape:",
    ...getFullNpcSchemaLines(),
    "",
    "Strict formatting rules:",
    "- JSON inside the code block must be parseable by JSON.parse.",
    "- Use double quotes for all keys and string values.",
    "- No trailing commas.",
    "- \"stats\" must be an object, not a string.",
    "- \"features\", \"spells\", \"actions\" must always be arrays of strings (use [] if empty).",
    "- \"items\" must always be an array where each item is an object: {\"name\":\"...\", \"lookup\":\"...\"}.",
    "- \"lookup\" must be English canonical item name (if unknown, duplicate \"name\").",
    "- If unknown: use \"None\", 0, or [] (never null).",
    "- After the required keys, also include these extra keys in this order for richer import:",
    "  \"appearance\" (array), \"speech\", \"motivation\", \"secret\", \"hook\", \"quirk\", \"rumor\", \"mannerism\".",
    `- Write narrative text fields in ${language.name}.`,
    `- Prefer item/spell/feature/action names in ${language.name}; if unavailable use English canonical names.`,
    "",
    "Encounter consistency rules:",
    "- Keep NPCs coherent as one encounter group.",
    "- Vary names and personalities to avoid duplicates.",
    "- Respect the same tier/difficulty context across all entries.",
    "",
    "Context preferences:",
    `- NPC count: ${count}`,
    `- Tier target: ${tier}`,
    `- Suggested level: ${suggestedLevel}`,
    `- Preferred race: ${sanitizeFlavorText(context.race || "", 60) || "Any"}`,
    `- Preferred gender: ${formatGenderPreference(context.gender)}`,
    `- Preferred class/archetype: ${sanitizeFlavorText(context.className || context.archetypeName || "", 80) || "Any"}`,
    `- Preferred attack style: ${sanitizeFlavorText(context.attackStyle || "", 20) || "Any"}`,
    `- Preferred tags: ${preferredTags.length ? preferredTags.join(", ") : "Any"}`,
    `- Preferred culture: ${sanitizeFlavorText(context.culture || "", 50) || "Any"}`,
    `- Budget hint: ${sanitizeFlavorText(context.budget || "", 20) || "normal"}`,
    `- Important NPC: ${context.importantNpc ? "yes" : "no"}`,
    `- Encounter difficulty: ${sanitizeFlavorText(context.encounterDifficulty || "", 20) || "medium"}`,
    `- Interface language: ${language.code}`
  ].join("\n");
}

/**
 * Generate NPC token image via OpenAI image API
 * @param {Object} npc - NPC generation object
 * @returns {Promise<string|null>} Uploaded token image path or null
 */
export async function generateNpcTokenImageWithOpenAi(npc) {
  if (!npc) return null;
  if (!game.user?.isGM) {
    throw new Error(t("openai.errorGmOnlyTokenGeneration"));
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error(t("openai.errorApiKeyMissing"));
  }

  const model =
    String(game.settings?.get(MODULE_ID, SETTING_KEYS.imageModel) || OPENAI_DEFAULT_IMAGE_MODEL).trim() ||
    OPENAI_DEFAULT_IMAGE_MODEL;
  const baseUrl = normalizeBaseUrl(
    String(game.settings?.get(MODULE_ID, SETTING_KEYS.baseUrl) || OPENAI_DEFAULT_BASE_URL)
  );
  const endpoint = `${baseUrl}/images/generations`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };

  const requestData = {
    model,
    quality: "low",
    size: "1024x1024",
    prompt: buildTokenPrompt(npc)
  };

  const imagePayload = await requestOpenAiImageGeneration(endpoint, headers, requestData);
  const file = await imagePayloadToFile(imagePayload, buildTokenFilename(npc));
  if (!file) {
    throw new Error(t("openai.errorNoUsableImageData"));
  }

  const worldId = sanitizePathSegment(game.world?.id || "world");
  const targetDir = `worlds/${worldId}/${MODULE_ID}/tokens`;
  await ensureDataDirectory(targetDir);

  const uploaded = await FilePicker.upload("data", targetDir, file, {}, { notify: false });
  const uploadedPath = String(uploaded?.path || "").trim();
  return uploadedPath || `${targetDir}/${file.name}`;
}

function buildFullNpcPrompt(context = {}, options = {}) {
  const manualCodeBlock = !!options.manualCodeBlock;
  const tier = clampNumber(context.tier, 1, 4, 1);
  const suggestedLevel = tierToLevel(tier);
  const language = getInterfaceLanguageContext();
  const preferredTags = Array.isArray(context.archetypeTags)
    ? context.archetypeTags.map((value) => sanitizeFlavorText(value, 24)).filter(Boolean)
    : [];

  return [
    manualCodeBlock
      ? "Output the final answer inside exactly one ```json code block``` for easy copy."
      : "You must output ONLY one valid JSON object.",
    manualCodeBlock
      ? "Do not include any text before or after the code block."
      : "Do not output markdown.",
    manualCodeBlock ? "Do not include explanations or comments." : "Do not output code fences.",
    manualCodeBlock ? "Inside the code block, output exactly one JSON object." : "Do not output comments.",
    manualCodeBlock ? "JSON inside the code block must be valid for JSON.parse." : "Do not output explanations.",
    manualCodeBlock ? "No extra prose." : "No text before or after the JSON object.",
    "",
    "Generate one D&D 5e NPC blueprint for Foundry VTT.",
    "Use canonical D&D 5e names for items, spells, features, and actions whenever possible.",
    "All keys are required.",
    "Use this EXACT key order and data shape:",
    ...getFullNpcSchemaLines(),
    "",
    "Strict formatting rules:",
    "- JSON must be parseable by JSON.parse.",
    "- Use double quotes for all keys and string values.",
    "- No trailing commas.",
    "- \"stats\" must be an object, not a string.",
    "- \"features\", \"spells\", \"actions\" must always be arrays of strings (use [] if empty).",
    "- \"items\" must always be an array where each item is an object: {\"name\":\"...\", \"lookup\":\"...\"}.",
    "- \"lookup\" must be English canonical item name (if unknown, duplicate \"name\").",
    "- If unknown: use \"None\", 0, or [] (never null).",
    "- After the required keys, also include these extra keys in this order for richer import:",
    "  \"appearance\" (array), \"speech\", \"motivation\", \"secret\", \"hook\", \"quirk\", \"rumor\", \"mannerism\".",
    `- Write narrative text fields in ${language.name}.`,
    `- Prefer item/spell/feature/action names in ${language.name}; if unavailable use English canonical names.`,
    "",
    "Content rules:",
    "- Keep values practical for a coherent playable NPC.",
    "- Keep personality to 1-2 sentences.",
    "- Keep description concise and visual.",
    "",
    "Context preferences:",
    `- Tier target: ${tier}`,
    `- Suggested level: ${suggestedLevel}`,
    `- Preferred race: ${sanitizeFlavorText(context.race || "", 60) || "Any"}`,
    `- Preferred gender: ${formatGenderPreference(context.gender)}`,
    `- Preferred class/archetype: ${sanitizeFlavorText(context.className || context.archetypeName || "", 80) || "Any"}`,
    `- Preferred attack style: ${sanitizeFlavorText(context.attackStyle || "", 20) || "Any"}`,
    `- Preferred tags: ${preferredTags.length ? preferredTags.join(", ") : "Any"}`,
    `- Preferred culture: ${sanitizeFlavorText(context.culture || "", 50) || "Any"}`,
    `- Budget hint: ${sanitizeFlavorText(context.budget || "", 20) || "normal"}`,
    `- Important NPC: ${context.importantNpc ? "yes" : "no"}`,
    `- Encounter difficulty: ${sanitizeFlavorText(context.encounterDifficulty || "", 20) || "medium"}`,
    `- Interface language: ${language.code}`
  ].join("\n");
}

function getFullNpcSchemaLines() {
  return [
    "{",
    "  \"name\": \"...\",",
    "  \"race\": \"...\",",
    "  \"class\": \"...\",",
    "  \"background\": \"...\",",
    "  \"alignment\": \"...\",",
    "  \"level\": 0,",
    "  \"stats\": {",
    "    \"STR\": 0,",
    "    \"DEX\": 0,",
    "    \"CON\": 0,",
    "    \"INT\": 0,",
    "    \"WIS\": 0,",
    "    \"CHA\": 0",
    "  },",
    "  \"ac\": 0,",
    "  \"hp\": 0,",
    "  \"speed\": \"30 ft.\",",
    "  \"features\": [\"...\"],",
    "  \"items\": [{\"name\": \"...\", \"lookup\": \"English canonical name\"}],",
    "  \"spells\": [\"...\"],",
    "  \"actions\": [\"...\"],",
    "  \"personality\": \"...\",",
    "  \"description\": \"...\"",
    "}"
  ];
}

function normalizeAiFullNpc(data, context = {}) {
  const source = data && typeof data === "object" ? data : {};
  const fallbackTier = clampNumber(context.tier, 1, 4, 1);
  const tier = deriveTierFromSource(source, fallbackTier);
  const includeSecret = context.includeSecret !== false;
  const includeHook = context.includeHook !== false;
  const defaultAbilities = defaultAbilitiesByTier(tier);

  const classInput = source.class || source.className || context.className;
  const attackStyleRaw = String(source.attackStyle || context.attackStyle || "").trim().toLowerCase();
  const attackStyle = AI_FULL_ATTACK_STYLES.includes(attackStyleRaw)
    ? attackStyleRaw
    : deriveAttackStyleFromClass(classInput);

  const className = normalizeClassName(classInput);
  const archetypeTags = normalizeStringArray(source.archetypeTags || source.tags, 6, 20)
    .map((tag) => tag.toLowerCase())
    .filter((tag) => AI_FULL_TAGS.includes(tag));
  const skillIds = normalizeSkillIds(
    source.skillIds || source.skills,
    Array.isArray(context.allowedSkillIds) ? context.allowedSkillIds : []
  );

  const rawAppearance = normalizeStringArray(source.appearance, 4, 100);
  const descriptionAppearance = splitDescriptionToAppearance(source.description);
  const appearance = uniqueStrings([...rawAppearance, ...descriptionAppearance], 4);

  const personality = ensureSentence(sanitizeFlavorText(source.personality, 260));
  const description = ensureSentence(sanitizeFlavorText(source.description, 320));
  const speech = ensureSentence(sanitizeFlavorText(source.speech, 240) || personality);
  const motivation = ensureSentence(sanitizeFlavorText(source.motivation, 260) || personality);
  const secret = includeSecret ? ensureSentence(sanitizeFlavorText(source.secret, 320)) : "";
  const hook = includeHook ? ensureSentence(sanitizeFlavorText(source.hook, 320)) : "";
  const quirk = ensureSentence(sanitizeFlavorText(source.quirk, 220) || personality);
  const rumor = ensureSentence(sanitizeFlavorText(source.rumor, 240));
  const mannerism = ensureSentence(sanitizeFlavorText(source.mannerism, 220) || personality);

  const stats = source.stats && typeof source.stats === "object" ? source.stats : source.abilities;
  const flatItems = normalizeItemReferenceArray(source.items, 12, 80);
  const groupedItems =
    source.items && typeof source.items === "object" && !Array.isArray(source.items)
      ? source.items
      : {};
  const spells = uniqueStrings(
    normalizeStringArray(groupedItems.spells || source.spells, 12, 80),
    12
  );
  const features = uniqueStrings(
    normalizeStringArray(groupedItems.features || source.features, 10, 100),
    10
  );
  const actions = uniqueStrings(normalizeStringArray(source.actions, 10, 100), 10);
  const guessedGroups = groupFlatItems(flatItems);

  return {
    aiFull: true,
    name: sanitizeNpcName(source.name, 90) || sanitizeNpcName(context.name, 90) || "Nameless",
    race: sanitizeFlavorText(source.race, 60) || sanitizeFlavorText(context.race, 60) || "Humanoid",
    className,
    archetypeName:
      sanitizeFlavorText(source.archetypeName || source.background, 80) ||
      sanitizeFlavorText(context.archetypeName, 80) ||
      `${className} Operative`,
    attackStyle,
    archetypeTags: archetypeTags.length ? archetypeTags : normalizeFallbackTags(context.archetypeTags, attackStyle),
    tier,
    level: clampNumber(source.level, 1, 20, tierToLevel(tier)),
    alignment: sanitizeFlavorText(source.alignment, 40) || "Neutral",
    background: sanitizeFlavorText(source.background, 80) || "None",
    cr: normalizeCr(source.cr, tier),
    ac: clampNumber(source.ac, 10, 22, 12 + tier),
    hp: clampNumber(source.hp, 4, 260, 10 + tier * 12),
    speed: parseSpeedToFeet(source.speed, 30),
    prof: clampNumber(source.prof, 2, 6, tier >= 4 ? 4 : tier >= 3 ? 3 : 2),
    culture: sanitizeFlavorText(source.culture, 50) || sanitizeFlavorText(context.culture, 50) || "",
    budget: sanitizeFlavorText(source.budget, 20) || sanitizeFlavorText(context.budget, 20) || "normal",
    abilities: normalizeAbilityScores(stats, defaultAbilities),
    skillIds,
    appearance: appearance.length ? appearance : ["steady gaze", "travel-worn outfit"],
    speech: speech || "Speaks with practical clarity and controlled confidence.",
    motivation: motivation || "Pursues a concrete goal tied to survival, leverage, or duty.",
    secret: secret || null,
    hook: hook || null,
    quirk: quirk || "Keeps strict routines and checks exits before speaking.",
    rumor: rumor || null,
    mannerism: mannerism || null,
    personality: personality || null,
    description: description || null,
    actions,
    currency: normalizeCurrency(source.currency),
      items: {
      weapons: uniqueItemReferences([
        ...normalizeItemReferenceArray(groupedItems.weapons || source.weapons, 6, 80),
        ...guessedGroups.weapons
      ], 6),
      armor: uniqueItemReferences([
        ...normalizeItemReferenceArray(groupedItems.armor || source.armor, 4, 80),
        ...guessedGroups.armor
      ], 4),
      equipment: uniqueItemReferences([
        ...normalizeItemReferenceArray(groupedItems.equipment || source.equipment, 10, 80),
        ...guessedGroups.equipment
      ], 10),
      consumables: uniqueItemReferences([
        ...normalizeItemReferenceArray(groupedItems.consumables || source.consumables, 6, 80),
        ...guessedGroups.consumables
      ], 6),
      loot: uniqueItemReferences([
        ...normalizeItemReferenceArray(groupedItems.loot || source.loot, 8, 80),
        ...guessedGroups.loot
      ], 8),
      spells,
      features: uniqueStrings([...features, ...actions], 12)
    },
    includeLoot: context.includeLoot !== false,
    includeSecret,
    includeHook,
    importantNpc: !!context.importantNpc
  };
}

function normalizeClassName(value) {
  const raw = sanitizeFlavorText(value, 40);
  if (!raw) return "Fighter";
  const match = AI_FULL_CLASSES.find((cls) => cls.toLowerCase() === raw.toLowerCase());
  return match || raw;
}

function deriveAttackStyleFromClass(className) {
  const cls = String(className || "").toLowerCase();
  if (["wizard", "warlock", "sorcerer", "druid"].includes(cls)) return "caster";
  if (["ranger"].includes(cls)) return "ranged";
  if (["rogue", "bard", "monk"].includes(cls)) return "mixed";
  return "melee";
}

function normalizeFallbackTags(rawTags, attackStyle) {
  const tags = normalizeStringArray(rawTags, 6, 20)
    .map((tag) => tag.toLowerCase())
    .filter((tag) => AI_FULL_TAGS.includes(tag));
  if (tags.length) return tags;
  if (attackStyle === "caster") return ["caster", "knowledge"];
  if (attackStyle === "ranged") return ["wilderness", "martial"];
  if (attackStyle === "mixed") return ["criminal", "social"];
  return ["martial"];
}

function normalizeAbilityScores(rawAbilities, fallback) {
  const source = rawAbilities && typeof rawAbilities === "object" ? rawAbilities : {};
  const base = fallback && typeof fallback === "object" ? fallback : defaultAbilitiesByTier(1);
  return {
    str: clampNumber(source.STR ?? source.str, 3, 20, base.str),
    dex: clampNumber(source.DEX ?? source.dex, 3, 20, base.dex),
    con: clampNumber(source.CON ?? source.con, 3, 20, base.con),
    int: clampNumber(source.INT ?? source.int, 3, 20, base.int),
    wis: clampNumber(source.WIS ?? source.wis, 3, 20, base.wis),
    cha: clampNumber(source.CHA ?? source.cha, 3, 20, base.cha)
  };
}

function defaultAbilitiesByTier(tier) {
  const t = clampNumber(tier, 1, 4, 1);
  const base = 9 + t;
  return {
    str: base + 1,
    dex: base,
    con: base + 1,
    int: base,
    wis: base,
    cha: base
  };
}

function normalizeSkillIds(rawSkillIds, allowedSkillIds) {
  const allowed = new Set(
    (Array.isArray(allowedSkillIds) ? allowedSkillIds : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const list = normalizeStringArray(rawSkillIds, 8, 24).map((value) => value.toLowerCase());
  if (!allowed.size) return list.slice(0, 8);
  return list.filter((value) => allowed.has(value)).slice(0, 8);
}

function normalizeCurrency(rawCurrency) {
  const source = rawCurrency && typeof rawCurrency === "object" ? rawCurrency : {};
  return {
    pp: clampNumber(source.pp, 0, 5000, 0),
    gp: clampNumber(source.gp, 0, 50000, 0),
    ep: clampNumber(source.ep, 0, 5000, 0),
    sp: clampNumber(source.sp, 0, 50000, 0),
    cp: clampNumber(source.cp, 0, 50000, 0)
  };
}

function normalizeCr(value, tier) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 30) {
    return Math.round(numeric * 1000) / 1000;
  }
  if (tier <= 1) return 0.25;
  if (tier === 2) return 2;
  if (tier === 3) return 5;
  return 8;
}

function deriveTierFromSource(source, fallbackTier) {
  const level = clampNumber(source?.level, 1, 20, 0);
  if (level > 0) return levelToTier(level);
  return clampNumber(source?.tier, 1, 4, fallbackTier);
}

function levelToTier(level) {
  const safe = clampNumber(level, 1, 20, 1);
  if (safe <= 4) return 1;
  if (safe <= 8) return 2;
  if (safe <= 12) return 3;
  return 4;
}

function tierToLevel(tier) {
  const safe = clampNumber(tier, 1, 4, 1);
  if (safe === 1) return 3;
  if (safe === 2) return 6;
  if (safe === 3) return 10;
  return 14;
}

function parseSpeedToFeet(value, fallback = 30) {
  if (typeof value === "number") {
    return clampNumber(value, 10, 80, fallback);
  }
  const text = String(value || "").toLowerCase();
  const match = text.match(/(\d{1,3})/);
  if (!match) return fallback;
  return clampNumber(Number(match[1]), 10, 80, fallback);
}

function splitDescriptionToAppearance(description) {
  const text = sanitizeFlavorText(description, 320);
  if (!text) return [];
  return text
    .split(/[.,;]+/)
    .map((part) => part.trim())
    .filter((part) => countWords(part) >= 2)
    .slice(0, 4);
}

function groupFlatItems(flatItems) {
  const out = {
    weapons: [],
    armor: [],
    equipment: [],
    consumables: [],
    loot: []
  };
  for (const itemRef of flatItems || []) {
    const label = getItemReferenceLabel(itemRef);
    const lower = String(label || "").toLowerCase();
    if (!lower) continue;
    if (/(ammo|arrows?|bolts?|crossbow bolts?)/i.test(lower)) {
      out.consumables.push(itemRef);
      continue;
    }
    if (/(sword|axe|mace|hammer|bow|crossbow|dagger|spear|halberd|staff|rapier|whip|javelin|flail)/i.test(lower)) {
      out.weapons.push(itemRef);
      continue;
    }
    if (/(armor|mail|plate|shield|helm|gauntlet|breastplate|leather|chain)/i.test(lower)) {
      out.armor.push(itemRef);
      continue;
    }
    if (/(potion|elixir|scroll|ammo|arrows|bolts|kit|healer|ration)/i.test(lower)) {
      out.consumables.push(itemRef);
      continue;
    }
    if (/(gem|coin|ring|necklace|trinket|relic|idol|token)/i.test(lower)) {
      out.loot.push(itemRef);
      continue;
    }
    out.equipment.push(itemRef);
  }
  return {
    weapons: uniqueItemReferences(out.weapons, 6),
    armor: uniqueItemReferences(out.armor, 4),
    equipment: uniqueItemReferences(out.equipment, 10),
    consumables: uniqueItemReferences(out.consumables, 6),
    loot: uniqueItemReferences(out.loot, 8)
  };
}

function uniqueStrings(values, maxItems = 10) {
  const out = [];
  const seen = new Set();
  for (const rawValue of values || []) {
    const value = sanitizeFlavorText(rawValue, 120);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeItemReferenceArray(raw, maxItems = 6, maxLength = 80) {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? []
      : String(raw || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
  const out = [];
  for (const value of list) {
    const normalized = normalizeItemReference(value, maxLength);
    if (!normalized) continue;
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeItemReference(raw, maxLength = 80) {
  if (typeof raw === "string") {
    const name = sanitizeFlavorText(raw, maxLength);
    if (!name) return null;
    return { name, lookup: "" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const name = sanitizeFlavorText(raw.name || raw.label || raw.value || raw.item || "", maxLength);
  const lookup = sanitizeFlavorText(
    raw.lookup || raw.canonical || raw.canonicalName || raw.english || raw.en || "",
    maxLength
  );
  const resolvedName = name || lookup;
  if (!resolvedName) return null;
  return { name: resolvedName, lookup: lookup || "" };
}

function uniqueItemReferences(values, maxItems = 10) {
  const out = [];
  const seen = new Set();
  for (const rawValue of values || []) {
    const normalized = normalizeItemReference(rawValue, 120);
    if (!normalized) continue;
    const key = `${normalized.name.toLowerCase()}|${normalized.lookup.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function getItemReferenceLabel(itemRef) {
  if (!itemRef || typeof itemRef !== "object") {
    return sanitizeFlavorText(itemRef, 120);
  }
  return sanitizeFlavorText(itemRef.lookup || itemRef.name || "", 120);
}

function normalizeStringArray(raw, maxItems = 6, maxLength = 80) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  return list
    .map((value) => {
      const normalized =
        value && typeof value === "object" && !Array.isArray(value)
          ? value.name || value.lookup || value.label || value.value || ""
          : value;
      return sanitizeFlavorText(normalized, maxLength);
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function maskApiKey(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) return "";
  if (key.length <= 8) return `${key.slice(0, 2)}••••`;
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function buildTokenPrompt(npc) {
  const appearance = Array.isArray(npc?.appearance)
    ? npc.appearance.map((part) => sanitizeFlavorText(part, 80)).filter(Boolean).join(", ")
    : "";
  const role = sanitizeFlavorText(npc?.archetype?.name || npc?.className || "adventurer", 60);
  const race = sanitizeFlavorText(npc?.race || "humanoid", 50);
  const quirk = sanitizeFlavorText(npc?.quirk || "", 100);
  const speech = sanitizeFlavorText(npc?.speech || "", 100);
  const mannerism = sanitizeFlavorText(npc?.mannerism || "", 100);
  const raceHints = buildRaceTokenHints(race);

  return [
    "Create a fantasy tabletop RPG token portrait for one D&D 5e NPC.",
    "Composition: centered bust or upper-body, facing camera, readable silhouette, high contrast, clean edges.",
    "Style: polished painterly fantasy illustration, realistic proportions, no chibi, no cartoon exaggeration.",
    "Background: simple neutral backdrop with soft vignette; keep focus on character.",
    "Output goals: instantly readable at small size, strong face lighting, iconic class/race identity.",
    "Constraints: no text, no letters, no logo, no watermark, no border ring, no frame, no UI elements.",
    `Character: ${race} ${role}.`,
    `Primary race requirement: ${race}.`,
    "The portrait must be unmistakably this race at first glance.",
    "Do not default to a human look if the race is non-human.",
    ...raceHints,
    appearance ? `Appearance cues: ${appearance}.` : "",
    quirk ? `Visible quirk: ${quirk}.` : "",
    speech ? `Personality tone from speech: ${speech}.` : "",
    mannerism ? `Mannerism cue: ${mannerism}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function buildRaceTokenHints(race) {
  const raceText = String(race || "").toLowerCase();
  if (
    /warforged|forged|construct|automaton|golem|кован|конструкт|автоматон|голем/i.test(raceText)
  ) {
    return [
      "Race-specific hard rule: depict a forged construct body, not a human body.",
      "Required visual traits: segmented metal or stone plates, visible joints/rivets, artificial face structure.",
      "Forbidden traits: natural human skin as the main surface."
    ];
  }
  return [];
}

function buildTokenFilename(npc) {
  const baseName = sanitizePathSegment(sanitizeNpcName(npc?.name, 50) || "npc").slice(0, 40) || "npc";
  const stamp = Date.now();
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .padStart(4, "0");
  return `${baseName}-ai-token-${stamp}-${rand}.png`;
}

function sanitizePathSegment(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

async function requestOpenAiImageGeneration(endpoint, headers, requestData) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestData)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const reason = cleanErrorText(errorText) || response.statusText || t("openai.errorImageRequestFailed");
    throw new Error(`${response.status}: ${reason}`);
  }

  const payload = await response.json();
  return payload?.data?.[0] || null;
}

async function imagePayloadToFile(imagePayload, fileName) {
  const b64 = String(imagePayload?.b64_json || "").trim();
  if (b64) {
    const bytes = base64ToUint8Array(b64);
    return new File([bytes], fileName, { type: "image/png" });
  }

  const url = String(imagePayload?.url || "").trim();
  if (!url) return null;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${t("openai.errorDownloadGeneratedImage")}: ${response.status}`);
  }
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/png" });
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function ensureDataDirectory(path) {
  const parts = String(path || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return;

  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    try {
      await FilePicker.createDirectory("data", currentPath);
    } catch (err) {
      const message = String(err?.message || err || "").toLowerCase();
      if (
        message.includes("exists") ||
        message.includes("already") ||
        message.includes("eexist") ||
        message.includes("conflict")
      ) {
        continue;
      }
      throw err;
    }
  }
}

function normalizeBaseUrl(baseUrl) {
  const clean = String(baseUrl || "").trim() || OPENAI_DEFAULT_BASE_URL;
  return clean.replace(/\/+$/, "");
}

function getInterfaceLanguageContext() {
  const coreLang = game.settings?.get?.("core", "language");
  const raw = String(game.i18n?.lang || coreLang || "en").trim().toLowerCase();
  const codeMatch = raw.match(/^[a-z]{2}/);
  const code = codeMatch ? codeMatch[0] : "en";
  let localizedName = "";
  try {
    const display = new Intl.DisplayNames([raw, "en"], { type: "language" });
    localizedName = String(display.of(code) || "").trim();
  } catch {
    // no-op, fallback below
  }
  const nameByCode = {
    ru: t("openai.language.russian"),
    en: t("openai.language.english")
  };
  return {
    code,
    raw,
    name: localizedName || nameByCode[code] || raw || t("openai.language.english")
  };
}

function formatGenderPreference(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["male", "m", "man"].includes(normalized)) return "Male";
  if (["female", "f", "woman"].includes(normalized)) return "Female";
  return "Any";
}

function parseJsonContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error(t("openai.errorParseJsonResponse"));
    }
    const sliced = content.slice(firstBrace, lastBrace + 1);
    return JSON.parse(sliced);
  }
}

function normalizeAiFlavor(data, fallbackNpc) {
  const source = data && typeof data === "object" ? data : {};
  const name = sanitizeNpcName(source.name, 90) || sanitizeNpcName(fallbackNpc?.name, 90);
  const fallbackAppearance = Array.isArray(fallbackNpc?.appearance) ? fallbackNpc.appearance : [];
  const appearanceRaw = Array.isArray(source.appearance)
    ? source.appearance
    : String(source.appearance || "").split(",");
  const appearance = appearanceRaw
    .map((part) => sanitizeFlavorText(part, 110))
    .filter(Boolean)
    .slice(0, 4);

  const speech = ensureSentence(
    sanitizeFlavorText(source.speech, 220) || sanitizeFlavorText(fallbackNpc?.speech, 220)
  );
  const motivation = ensureSentence(
    sanitizeFlavorText(source.motivation, 240) || sanitizeFlavorText(fallbackNpc?.motivation, 240)
  );
  const secret = fallbackNpc?.includeSecret
    ? ensureSentence(
      sanitizeFlavorText(source.secret, 280) || sanitizeFlavorText(fallbackNpc?.secret, 280)
    )
    : fallbackNpc?.secret ?? null;
  const hook = fallbackNpc?.includeHook
    ? ensureSentence(
      sanitizeFlavorText(source.hook, 280) || sanitizeFlavorText(fallbackNpc?.hook, 280)
    )
    : fallbackNpc?.hook ?? null;
  const quirk = ensureSentence(
    sanitizeFlavorText(source.quirk, 180) || sanitizeFlavorText(fallbackNpc?.quirk, 180)
  );
  const rumor = ensureSentence(
    sanitizeFlavorText(source.rumor, 220) || sanitizeFlavorText(fallbackNpc?.rumor, 220)
  );
  const mannerism = ensureSentence(
    sanitizeFlavorText(source.mannerism, 180) || sanitizeFlavorText(fallbackNpc?.mannerism, 180)
  );

  return {
    name,
    appearance: appearance.length ? appearance : fallbackAppearance,
    speech,
    motivation,
    secret: secret || null,
    hook: hook || null,
    quirk,
    rumor: rumor || null,
    mannerism: mannerism || null
  };
}

function sanitizeFlavorText(value, maxLength) {
  if (value === null || value === undefined) return "";
  const raw = String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>{}`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  return raw.slice(0, maxLength).trim();
}

function sanitizeNpcName(value, maxLength) {
  const raw = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9'’.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  return raw.slice(0, maxLength).trim();
}

function ensureSentence(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.charAt(0).toUpperCase() + text.slice(1);
  if (/[.!?]$/.test(normalized)) return normalized;
  return `${normalized}.`;
}

function buildFlavorPrompt(npc, options = {}) {
  const attempt = Number(options.attempt || 0);
  const feedbackIssues = Array.isArray(options.feedbackIssues) ? options.feedbackIssues : [];
  const previousFlavor = options.previousFlavor || null;
  const language = getInterfaceLanguageContext();

  return JSON.stringify({
    task: "Generate rich, actionable NPC flavor text for D&D 5e.",
    qualityTarget: "Output must feel like a GM-ready NPC handout, not fragments.",
    language: {
      interfaceCode: language.code,
      writeFlavorIn: language.name
    },
    outputSchema: {
      name: "2-4 words full fantasy-style name, culturally fitting, readable, and suitable for reuse in an Actor sheet",
      appearance: "array of 3 physical details, each 4-10 words, concrete and visual",
      speech: "1 complete sentence, 10-24 words, shows speaking style and conversational intent",
      motivation: "1 complete sentence, 12-28 words, includes goal and stake/risk",
      secret: "1 complete sentence, 12-28 words, concrete and consequential; empty string only if includeSecret=false",
      hook: "1 complete sentence, 14-30 words, includes actionable lead and implied urgency; empty string only if includeHook=false",
      quirk: "1 complete sentence, 9-18 words, visible at the table and not silly nonsense",
      rumor: "1 complete sentence, 10-24 words, what people in town whisper about this NPC",
      mannerism: "1 complete sentence, 8-16 words, repeatable at-the-table behavior"
    },
    hardRules: [
      "No sentence fragments.",
      "No generic filler like mysterious, strange, unusual, somehow.",
      "No duplicated appearance nouns (example: two scarf details).",
      "Keep tone grounded and playable for a live session.",
      "Keep generated name close to culture; avoid joke names or modern slang.",
      "Use specific nouns (person, place, object, faction, ritual, debt, letter, relic, etc).",
      `Write every output text field in ${language.name}.`
    ],
    npc: {
      name: String(npc?.name || ""),
      race: String(npc?.race || ""),
      gender: String(npc?.gender || "random"),
      tier: Number(npc?.tier || 1),
      archetype: String(npc?.archetype?.name || ""),
      className: String(npc?.className || ""),
      attackStyle: String(npc?.attackStyle || npc?.archetype?.attackStyle || ""),
      archetypeTags: Array.isArray(npc?.archetypeTags) ? npc.archetypeTags : (npc?.archetype?.tags || []),
      culture: String(npc?.culture || ""),
      importantNpc: !!npc?.importantNpc,
      includeSecret: !!npc?.includeSecret,
      includeHook: !!npc?.includeHook
    },
    baselineFlavor: {
      name: String(npc?.name || ""),
      appearance: Array.isArray(npc?.appearance) ? npc.appearance : [],
      speech: String(npc?.speech || ""),
      motivation: String(npc?.motivation || ""),
      secret: String(npc?.secret || ""),
      hook: String(npc?.hook || ""),
      quirk: String(npc?.quirk || ""),
      rumor: String(npc?.rumor || ""),
      mannerism: String(npc?.mannerism || "")
    },
    retryContext: attempt > 0 ? {
      reason: "Previous draft quality was too weak. Rewrite with stronger specificity.",
      failedChecks: feedbackIssues,
      previousDraft: previousFlavor
    } : null
  }, null, 2);
}

function evaluateFlavorQuality(flavor, npc) {
  const issues = [];
  const appearance = Array.isArray(flavor?.appearance) ? flavor.appearance : [];
  if (appearance.length < 2) {
    issues.push("appearance must have at least 2 concrete details");
  }
  for (const detail of appearance) {
    if (countWords(detail) < 3) {
      issues.push(`appearance detail is too short: "${detail}"`);
      break;
    }
  }

  const repeatedNouns = findRepeatedAppearanceNouns(appearance);
  if (repeatedNouns.length) {
    issues.push(`appearance repeats nouns: ${repeatedNouns.join(", ")}`);
  }

  if (countWords(flavor?.speech) < 8) {
    issues.push("speech must be a full, meaningful sentence");
  }
  if (countWords(flavor?.motivation) < 10) {
    issues.push("motivation must include a concrete goal and stake");
  }
  if (countWords(flavor?.quirk) < 7) {
    issues.push("quirk is too short or vague");
  }
  if (countWords(flavor?.rumor) < 8) {
    issues.push("rumor is too short or vague");
  }
  if (countWords(flavor?.mannerism) < 6) {
    issues.push("mannerism is too short or vague");
  }
  if (npc?.includeSecret && countWords(flavor?.secret) < 10) {
    issues.push("secret is too short or non-consequential");
  }
  if (npc?.includeHook && countWords(flavor?.hook) < 12) {
    issues.push("hook must include an actionable lead with urgency");
  }

  return issues.slice(0, 6);
}

function countWords(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function findRepeatedAppearanceNouns(appearance) {
  const nounCount = new Map();
  for (const detail of appearance || []) {
    const noun = extractTailWord(detail);
    if (!noun) continue;
    nounCount.set(noun, (nounCount.get(noun) || 0) + 1);
  }
  return Array.from(nounCount.entries())
    .filter(([, count]) => count > 1)
    .map(([noun]) => noun);
}

function extractTailWord(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return "";
  for (let i = tokens.length - 1; i >= 0; i--) {
    const word = tokens[i];
    if (!["the", "a", "an", "of", "with", "and", "in", "on", "for", "at", "to"].includes(word)) {
      return word;
    }
  }
  return tokens[tokens.length - 1];
}

function cleanErrorText(rawError) {
  const str = String(rawError || "").trim();
  if (!str) return "";
  try {
    const parsed = JSON.parse(str);
    const msg = parsed?.error?.message || parsed?.message || "";
    return sanitizeFlavorText(msg, 200);
  } catch {
    return sanitizeFlavorText(str, 200);
  }
}

async function requestOpenAiChatCompletion(endpoint, headers, requestData, signal) {
  const firstResponse = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestData),
    signal
  });
  if (firstResponse.ok) {
    const payload = await firstResponse.json();
    return String(payload?.choices?.[0]?.message?.content || "").trim();
  }

  const firstErrText = await firstResponse.text().catch(() => "");
  const firstErrReason = cleanErrorText(firstErrText);
  const unsupportedResponseFormat =
    firstResponse.status === 400 &&
    /response[_\s-]?format|json[_\s-]?object/i.test(firstErrReason);

  if (unsupportedResponseFormat) {
    const fallbackData = {
      ...requestData,
      messages: [
        ...(requestData.messages || []),
        { role: "system", content: "Return raw JSON object only. No markdown." }
      ]
    };
    delete fallbackData.response_format;
    const secondResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(fallbackData),
      signal
    });
    if (secondResponse.ok) {
      const payload = await secondResponse.json();
      return String(payload?.choices?.[0]?.message?.content || "").trim();
    }
    const secondErrText = await secondResponse.text().catch(() => "");
    const secondReason = cleanErrorText(secondErrText) || secondResponse.statusText || t("openai.errorRequestFailed");
    throw new Error(`${secondResponse.status}: ${secondReason}`);
  }

  const reason = firstErrReason || firstResponse.statusText || t("openai.errorRequestFailed");
  throw new Error(`${firstResponse.status}: ${reason}`);
}
