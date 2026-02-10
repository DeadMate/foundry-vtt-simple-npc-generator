import { MODULE_ID } from "./constants.js";

function resolveKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return "";
  return raw.startsWith(`${MODULE_ID}.`) ? raw : `${MODULE_ID}.${raw}`;
}

function applyFallbackTemplate(template, data = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, token) => {
    const value = data[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

function getFallbackValue(fullKey) {
  if (!fullKey) return "";
  const fallbackRoot = game.i18n?._fallback;
  if (!fallbackRoot) return "";
  if (foundry?.utils?.getProperty) {
    const value = foundry.utils.getProperty(fallbackRoot, fullKey);
    return typeof value === "string" ? value : "";
  }
  const parts = String(fullKey).split(".");
  let cursor = fallbackRoot;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object" || !(part in cursor)) return "";
    cursor = cursor[part];
  }
  return typeof cursor === "string" ? cursor : "";
}

export function t(key, fallback = "") {
  const fullKey = resolveKey(key);
  if (!fullKey) return "";
  const localized = game.i18n?.localize?.(fullKey);
  if (localized && localized !== fullKey) return localized;
  const fallbackLocalized = getFallbackValue(fullKey);
  if (fallbackLocalized) return fallbackLocalized;
  return fallback || localized || fullKey;
}

export function tf(key, data = {}, fallback = "") {
  const fullKey = resolveKey(key);
  if (!fullKey) return "";
  const localized = game.i18n?.format?.(fullKey, data);
  if (localized && localized !== fullKey) return localized;
  const fallbackLocalized = getFallbackValue(fullKey);
  if (fallbackLocalized) return applyFallbackTemplate(fallbackLocalized, data);
  if (fallback) return applyFallbackTemplate(fallback, data);
  return localized || fullKey;
}
