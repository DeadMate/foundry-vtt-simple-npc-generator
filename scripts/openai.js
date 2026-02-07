/**
 * OpenAI integration for NPC flavor generation
 * @module openai
 */

import { MODULE_ID } from "./constants.js";

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_DEFAULT_IMAGE_MODEL = "gpt-image-1";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MAX_BATCH = 3;
const OPENAI_TIMEOUT_MS = 25000;

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
      title: "NPC Button: OpenAI API Key",
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
      ui.notifications?.info("NPC Button: OpenAI API key saved for this browser.");
      return;
    }

    if (clearKey) {
      await game.settings.set(MODULE_ID, SETTING_KEYS.apiKey, "");
      ui.notifications?.info("NPC Button: OpenAI API key cleared.");
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
    name: "OpenAI flavor switch (legacy)",
    hint: "Legacy compatibility switch. OpenAI is auto-enabled when an API key exists on this GM browser.",
    scope: "client",
    config: false,
    restricted: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.model, {
    name: "OpenAI model",
    hint: "Model name used for NPC flavor generation.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: OPENAI_DEFAULT_MODEL
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.imageModel, {
    name: "OpenAI image model",
    hint: "Model name used for AI token image generation.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: OPENAI_DEFAULT_IMAGE_MODEL
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.baseUrl, {
    name: "OpenAI API base URL",
    hint: "Advanced: leave default unless using a compatible endpoint.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: OPENAI_DEFAULT_BASE_URL
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.maxBatch, {
    name: "OpenAI max NPCs per generation",
    hint: "Limits how many NPCs per click are sent to OpenAI to control cost and latency.",
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
    name: "OpenAI API Key",
    label: "Set API Key",
    hint: "Stored locally in this browser (client setting), never synced to the world database.",
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
    throw new Error("Only GM users can call OpenAI generation.");
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured.");
  }

  const model = String(game.settings?.get(MODULE_ID, SETTING_KEYS.model) || OPENAI_DEFAULT_MODEL).trim() || OPENAI_DEFAULT_MODEL;
  const baseUrl = normalizeBaseUrl(
    String(game.settings?.get(MODULE_ID, SETTING_KEYS.baseUrl) || OPENAI_DEFAULT_BASE_URL)
  );
  const endpoint = `${baseUrl}/chat/completions`;

  const systemPrompt = [
    "You generate high-quality D&D 5e NPC flavor for live tabletop play.",
    "Return strict JSON only with keys: name, appearance, speech, motivation, secret, hook, quirk, rumor, mannerism.",
    "Write concrete, playable text; avoid vague fragments and generic filler.",
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
        throw new Error("OpenAI returned an empty response.");
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
    throw new Error("OpenAI flavor quality validation failed.");
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Generate NPC token image via OpenAI image API
 * @param {Object} npc - NPC generation object
 * @returns {Promise<string|null>} Uploaded token image path or null
 */
export async function generateNpcTokenImageWithOpenAi(npc) {
  if (!npc) return null;
  if (!game.user?.isGM) {
    throw new Error("Only GM users can call OpenAI token generation.");
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured.");
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
    size: "1024x1024",
    prompt: buildTokenPrompt(npc)
  };

  const imagePayload = await requestOpenAiImageGeneration(endpoint, headers, requestData);
  const file = await imagePayloadToFile(imagePayload, buildTokenFilename(npc));
  if (!file) {
    throw new Error("OpenAI image response did not contain usable image data.");
  }

  const worldId = sanitizePathSegment(game.world?.id || "world");
  const targetDir = `worlds/${worldId}/${MODULE_ID}/tokens`;
  await ensureDataDirectory(targetDir);

  const uploaded = await FilePicker.upload("data", targetDir, file, {}, { notify: false });
  const uploadedPath = String(uploaded?.path || "").trim();
  return uploadedPath || `${targetDir}/${file.name}`;
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
    const reason = cleanErrorText(errorText) || response.statusText || "OpenAI image request failed";
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
    throw new Error(`Failed to download generated image: ${response.status}`);
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

function parseJsonContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Failed to parse OpenAI JSON response.");
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

  return JSON.stringify({
    task: "Generate rich, actionable NPC flavor text for D&D 5e.",
    qualityTarget: "Output must feel like a GM-ready NPC handout, not fragments.",
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
      "Use specific nouns (person, place, object, faction, ritual, debt, letter, relic, etc)."
    ],
    npc: {
      name: String(npc?.name || ""),
      race: String(npc?.race || ""),
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
    const secondReason = cleanErrorText(secondErrText) || secondResponse.statusText || "OpenAI request failed";
    throw new Error(`${secondResponse.status}: ${secondReason}`);
  }

  const reason = firstErrReason || firstResponse.statusText || "OpenAI request failed";
  throw new Error(`${firstResponse.status}: ${reason}`);
}
