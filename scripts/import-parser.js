/**
 * Import parsing and validation helpers for loose AI JSON payloads
 * @module import-parser
 */

import { t, tf } from "./i18n.js";

function i18nText(key, fallback = "") {
  return t(key, fallback);
}

function i18nFormat(key, data = {}, fallback = "") {
  return tf(key, data, fallback);
}

export function normalizeImportedBlueprints(parsed) {
  const isLikelyNpcBlueprint = (entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const npcSignals = [
      "race",
      "class",
      "className",
      "stats",
      "abilities",
      "ac",
      "hp",
      "tier",
      "level",
      "personality",
      "description",
      "speech",
      "motivation",
      "hook",
      "secret",
      "quirk",
      "mannerism",
      "rumor",
      "features",
      "spells",
      "actions"
    ];
    return npcSignals.some((key) => key in entry);
  };

  if (Array.isArray(parsed)) {
    return parsed.filter((entry) => isLikelyNpcBlueprint(entry));
  }
  if (!parsed || typeof parsed !== "object") return [];

  const containerKeys = ["npcs", "encounter", "actors", "data", "results"];
  for (const key of containerKeys) {
    if (!Array.isArray(parsed[key])) continue;
    const list = parsed[key].filter((entry) => isLikelyNpcBlueprint(entry));
    if (list.length) return list;
  }

  return isLikelyNpcBlueprint(parsed) ? [parsed] : [];
}

export function parseLooseJsonObject(rawText) {
  const text = normalizeImportJsonText(rawText);
  if (!text) throw new Error(i18nText("ui.importErrorEmptyInput"));
  try {
    return JSON.parse(text);
  } catch {
    const candidate = extractLikelyJsonBlock(text);
    try {
      return JSON.parse(candidate);
    } catch {
      const repaired = repairCommonImportJsonIssues(candidate);
      try {
        return JSON.parse(repaired);
      } catch (parseErr) {
        const fallbackArray = parseQuotedArrayFallback(repaired);
        if (fallbackArray?.length) {
          return fallbackArray;
        }
        const fallbackParsed = parseQuotedKeyValueFallback(repaired);
        if (fallbackParsed && Object.keys(fallbackParsed).length) {
          return fallbackParsed;
        }
        const reason = String(parseErr?.message || i18nText("ui.importErrorInvalidJsonShort"));
        throw new Error(i18nFormat("ui.importErrorInvalidJsonWithReason", { reason }));
      }
    }
  }
}

function extractLikelyJsonBlock(text) {
  const value = String(text || "").trim();
  const firstSquare = value.indexOf("[");
  const lastSquare = value.lastIndexOf("]");
  if (!(firstSquare === -1 || lastSquare === -1 || lastSquare <= firstSquare)) {
    return value.slice(firstSquare, lastSquare + 1);
  }

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (!(firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace)) {
    return value.slice(firstBrace, lastBrace + 1);
  }
  return value;
}

function normalizeImportJsonText(rawText) {
  let text = String(rawText || "").trim();
  if (!text) return "";
  text = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  text = text
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\u00A0/g, " ");
  return text;
}

function repairCommonImportJsonIssues(rawText) {
  let text = String(rawText || "").trim();
  if (!text) return text;

  const looksArray = text.startsWith("[");
  if (!looksArray) {
    if (!text.startsWith("{")) text = `{${text}`;
    if (!text.endsWith("}")) text = `${text}}`;
  }

  text = text.replace(/"stats"\s*:\s*"STR"\s*:/i, "\"stats\": {\"STR\":");
  text = text.replace(/("CHA"\s*:\s*[^,\}\n]+)\s*,\s*"ac"\s*:/i, "$1}, \"ac\":");

  text = text.replace(
    /"(features|items|spells|actions)"\s*:\s*(?=(,|\r?\n\s*"))/gi,
    "\"$1\": []"
  );
  text = text.replace(/"(features|items|spells|actions)"\s*:\s*""/gi, "\"$1\": []");
  text = text.replace(/"(features|items|spells|actions)"\s*:\s*null/gi, "\"$1\": []");

  text = text.replace(/,\s*([}\]])/g, "$1");
  return text;
}

export function validateAndNormalizeImportedBlueprint(input, entryIndex = 0) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(
      i18nFormat("ui.importErrorSchemaValidation", {
        index: entryIndex + 1,
        details: i18nText("ui.importSchema.entryMustBeObject")
      })
    );
  }

  const normalized = { ...input };
  const issues = [];
  const addIssue = (messageKey, data = {}) => {
    issues.push(i18nFormat(messageKey, data));
  };

  const requireString = (field) => {
    if (!(field in normalized) || normalized[field] === null || normalized[field] === undefined) return;
    if (typeof normalized[field] !== "string") {
      addIssue("ui.importSchema.fieldMustBeString", { field });
      return;
    }
    normalized[field] = String(normalized[field]).trim();
  };

  const requireNumeric = (field) => {
    if (!(field in normalized) || normalized[field] === null || normalized[field] === undefined) return;
    const raw = normalized[field];
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(num)) {
      addIssue("ui.importSchema.fieldMustBeNumber", { field });
      return;
    }
    normalized[field] = num;
  };

  const normalizeStrictStringArray = (value, fieldPath, maxItems = 20, maxLength = 120) => {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      addIssue("ui.importSchema.fieldMustBeStringArray", { field: fieldPath });
      return [];
    }
    const out = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item === null || item === undefined) continue;
      if (typeof item !== "string") {
        addIssue("ui.importSchema.arrayItemMustBeString", {
          field: fieldPath,
          index: i + 1
        });
        continue;
      }
      const clean = String(item).replace(/\s+/g, " ").trim();
      if (!clean) continue;
      out.push(clean.slice(0, maxLength));
      if (out.length >= maxItems) break;
    }
    return out;
  };

  const normalizeStrictItemRefArray = (value, fieldPath, maxItems = 20, maxLength = 120) => {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      addIssue("ui.importSchema.fieldMustBeStringArray", { field: fieldPath });
      return [];
    }

    const out = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item === null || item === undefined) continue;

      if (typeof item === "string") {
        const clean = String(item).replace(/\s+/g, " ").trim();
        if (!clean) continue;
        out.push({ name: clean.slice(0, maxLength), lookup: "" });
        if (out.length >= maxItems) break;
        continue;
      }

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        addIssue("ui.importSchema.arrayItemMustBeString", {
          field: fieldPath,
          index: i + 1
        });
        continue;
      }

      const name = String(item.name || item.label || item.value || item.item || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
      const lookup = String(item.lookup || item.canonical || item.canonicalName || item.english || item.en || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
      const resolvedName = name || lookup;
      if (!resolvedName) continue;

      out.push({ name: resolvedName, lookup: lookup || "" });
      if (out.length >= maxItems) break;
    }

    return out;
  };

  const normalizeAbilityBlock = (raw, fieldPath) => {
    if (raw === null || raw === undefined) return null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      addIssue("ui.importSchema.fieldMustBeObject", { field: fieldPath });
      return null;
    }
    const aliases = {
      STR: ["STR", "str"],
      DEX: ["DEX", "dex"],
      CON: ["CON", "con"],
      INT: ["INT", "int"],
      WIS: ["WIS", "wis"],
      CHA: ["CHA", "cha"]
    };
    const out = {};
    for (const [ability, keys] of Object.entries(aliases)) {
      const key = keys.find((candidate) => raw[candidate] !== undefined && raw[candidate] !== null);
      if (!key) continue;
      const num = Number(raw[key]);
      if (!Number.isFinite(num)) {
        addIssue("ui.importSchema.abilityMustBeNumber", {
          field: `${fieldPath}.${ability}`
        });
        continue;
      }
      out[ability] = num;
    }
    return out;
  };

  const validateItemsField = (value) => {
    if (value === null || value === undefined) {
      normalized.items = [];
      return;
    }
    if (typeof value === "string") {
      const list = String(value)
        .split(/[\r\n,;]+/)
        .map((entry) => String(entry || "").replace(/^"+|"+$/g, "").trim())
        .filter(Boolean);
      normalized.items = normalizeStrictItemRefArray(list, "items", 20, 100);
      return;
    }
    if (Array.isArray(value)) {
      normalized.items = normalizeStrictItemRefArray(value, "items", 20, 100);
      return;
    }
    if (!value || typeof value !== "object") {
      addIssue("ui.importSchema.itemsMustBeArrayOrObject");
      normalized.items = [];
      return;
    }

    const out = {};
    const groups = [
      "items",
      "weapons",
      "armor",
      "equipment",
      "consumables",
      "loot",
      "spells",
      "features",
      "actions"
    ];
    for (const key of groups) {
      if (!(key in value)) continue;
      if (["spells", "features", "actions"].includes(key)) {
        out[key] = normalizeStrictStringArray(value[key], `items.${key}`, 20, 100);
        continue;
      }
      out[key] = normalizeStrictItemRefArray(value[key], `items.${key}`, 20, 100);
    }
    normalized.items = out;
  };

  const validateCurrencyField = (value) => {
    if (value === null || value === undefined) return;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      addIssue("ui.importSchema.fieldMustBeObject", { field: "currency" });
      return;
    }
    const out = {};
    for (const key of ["pp", "gp", "ep", "sp", "cp"]) {
      if (!(key in value) || value[key] === null || value[key] === undefined) continue;
      const num = Number(value[key]);
      if (!Number.isFinite(num)) {
        addIssue("ui.importSchema.currencyMustBeNumber", { field: `currency.${key}` });
        continue;
      }
      out[key] = num;
    }
    normalized.currency = out;
  };

  for (const field of [
    "name",
    "race",
    "class",
    "className",
    "background",
    "alignment",
    "speed",
    "personality",
    "description",
    "speech",
    "motivation",
    "secret",
    "hook",
    "quirk",
    "rumor",
    "mannerism",
    "budget",
    "culture"
  ]) {
    requireString(field);
  }

  for (const field of ["tier", "level", "ac", "hp", "cr", "prof"]) {
    requireNumeric(field);
  }

  for (const field of ["features", "spells", "actions", "appearance"]) {
    normalized[field] = normalizeStrictStringArray(normalized[field], field, 20, 140);
  }

  validateItemsField(normalized.items);
  validateCurrencyField(normalized.currency);

  const stats = normalizeAbilityBlock(normalized.stats, "stats");
  if (stats) normalized.stats = stats;
  else if (normalized.stats !== undefined) delete normalized.stats;

  const abilities = normalizeAbilityBlock(normalized.abilities, "abilities");
  if (abilities) normalized.abilities = abilities;
  else if (normalized.abilities !== undefined) delete normalized.abilities;

  if (!normalized.stats && abilities) {
    normalized.stats = { ...abilities };
  }

  if (typeof normalized.name !== "string" || !normalized.name.trim()) {
    normalized.name = i18nText("ui.importDefaultName");
  }
  if (typeof normalized.race !== "string") {
    normalized.race = "";
  }

  if (issues.length) {
    const details = issues.slice(0, 8).join("; ");
    throw new Error(
      i18nFormat("ui.importErrorSchemaValidation", {
        index: entryIndex + 1,
        details
      })
    );
  }

  return normalized;
}

function parseQuotedKeyValueFallback(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;

  const out = {};
  const keyRe = /"([^"]+)"\s*:/g;
  const matches = Array.from(text.matchAll(keyRe));
  if (!matches.length) return null;

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const key = String(current[1] || "").trim();
    if (!key) continue;
    const valueStart = current.index + current[0].length;
    const valueEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    let rawValue = text.slice(valueStart, valueEnd).trim();
    rawValue = rawValue.replace(/,\s*$/, "").trim();
    if (!rawValue) continue;

    if (key.toLowerCase() === "stats") {
      const stats = parseStatsFromLooseText(rawValue);
      if (Object.keys(stats).length) out.stats = stats;
      continue;
    }

    const parsedValue = parseLooseScalarOrArray(rawValue);
    out[key] = parsedValue;
  }

  if (!out.stats) {
    const stats = parseStatsFromLooseText(text);
    if (Object.keys(stats).length) out.stats = stats;
  }

  return out;
}

function parseQuotedArrayFallback(rawText) {
  const blocks = extractTopLevelObjectBlocks(rawText);
  if (blocks.length < 2) return null;
  const parsed = [];
  for (const block of blocks) {
    const strict = parseLooseObjectBlock(block);
    if (strict && typeof strict === "object" && !Array.isArray(strict) && Object.keys(strict).length) {
      parsed.push(strict);
    }
  }
  return parsed.length ? parsed : null;
}

function parseLooseObjectBlock(rawText) {
  const source = String(rawText || "").trim();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    // continue
  }
  const repaired = repairCommonImportJsonIssues(source);
  try {
    return JSON.parse(repaired);
  } catch {
    // continue
  }
  const fallback = parseQuotedKeyValueFallback(source) || parseQuotedKeyValueFallback(repaired);
  return fallback && Object.keys(fallback).length ? fallback : null;
}

function extractTopLevelObjectBlocks(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return [];
  const blocks = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        blocks.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return blocks;
}

function parseLooseScalarOrArray(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/^[,;]+$/.test(value)) return "";

  try {
    return JSON.parse(value);
  } catch {
    // continue
  }

  if (value.startsWith("[") && !value.endsWith("]")) {
    try {
      return JSON.parse(`${value}]`);
    } catch {
      // continue
    }
  }

  const quotedValues = extractQuotedValues(value);
  if (quotedValues.length > 1) {
    return quotedValues;
  }

  if (/^".*"$/.test(value)) {
    return value.slice(1, -1);
  }
  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value.replace(/^"+|"+$/g, "").trim();
}

function extractQuotedValues(rawText) {
  const text = String(rawText || "");
  if (!text) return [];
  const values = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let match = re.exec(text);
  while (match) {
    const decoded = String(match[1] || "")
      .replace(/\\"/g, "\"")
      .replace(/\\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (decoded) values.push(decoded);
    match = re.exec(text);
  }
  return values;
}

function parseStatsFromLooseText(rawText) {
  const text = String(rawText || "");
  const stats = {};
  const statKeys = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
  for (const key of statKeys) {
    const re = new RegExp(`"${key}"\\s*:\\s*(-?\\d{1,2})`, "i");
    const match = re.exec(text);
    if (!match) continue;
    stats[key] = Number(match[1]);
  }
  return stats;
}
