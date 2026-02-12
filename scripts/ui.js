/**
 * UI components and dialog handling
 * @module ui
 */

import { MODULE_ID } from "./constants.js";
import { DATA_CACHE, loadData } from "./data-loader.js";
import { buildCompendiumCache } from "./cache.js";
import { t, tf } from "./i18n.js";
import { buildNpcDialogContent } from "./ui-dialog-template.js";
import { capitalize, pickRandom, shuffleArray, escapeHtml, randInt, toItemData, getItemPriceValue } from "./utils.js";
import {
  getSpeciesEntries,
  getSpeciesOptions,
  buildSpeciesItem,
  applySpeciesTraitsToActor,
  applySpeciesAdvancements
} from "./species.js";
import {
  getAutoTier,
  buildEncounterCount,
  buildEncounterPlan,
  ensureEncounterFolder,
  ensureShopFolder,
  ensureLootFolder
} from "./encounter.js";
import { generateNpc, buildActorData, buildActorDataFromAiBlueprint, getClassForArchetype } from "./npc-generator.js";
import {
  getPacks,
  cloneItemData,
  isAllowedItemDoc,
  isWithinBudget,
  getBudgetRange
} from "./items.js";
import {
  isOpenAiConfigured,
  getOpenAiMaxBatch,
  buildManualEncounterNpcPrompt,
  buildManualFullNpcPrompt,
  generateFullNpcWithOpenAi,
  generateNpcFlavorWithOpenAi,
  generateNpcTokenImageWithOpenAi,
  openOpenAiApiKeyDialog
} from "./openai.js";

function i18nText(key, fallback = "") {
  return t(key, fallback);
}

function i18nFormat(key, data = {}, fallback = "") {
  return tf(key, data, fallback);
}

function i18nHtml(key, fallback = "") {
  return escapeHtml(i18nText(key, fallback));
}

function i18nHtmlFormat(key, data = {}, fallback = "") {
  return escapeHtml(i18nFormat(key, data, fallback));
}

const BUDGET_OPTIONS = new Set(["poor", "normal", "well", "elite"]);
const SHOP_TYPES = new Set(["market", "general", "alchemy", "scrolls", "weapons", "armor", "food"]);
const LOOT_TYPES = new Set(["mixed", "coins", "gear", "consumables", "weapons", "armor", "scrolls"]);
const SHOP_TYPE_WEIGHTS = [
  { type: "general", weight: 4 },
  { type: "food", weight: 3 },
  { type: "alchemy", weight: 2 },
  { type: "weapons", weight: 2 },
  { type: "armor", weight: 2 },
  { type: "scrolls", weight: 1 }
];
const LOOT_TYPE_WEIGHTS = [
  { type: "gear", weight: 4 },
  { type: "consumables", weight: 3 },
  { type: "weapons", weight: 2 },
  { type: "armor", weight: 2 },
  { type: "scrolls", weight: 1 }
];
const SHOPKEEPER_ICON_PATH = `modules/${MODULE_ID}/assets/icons/shopkeeper.svg`;
const LOOT_CONTAINER_ICON_PATH = `modules/${MODULE_ID}/assets/icons/loot-bag.svg`;

/**
 * Get actor folder options as HTML
 * @returns {string}
 */
export function getActorFolderOptions() {
  const folders = (game.folders || []).filter((folder) => folder.type === "Actor");
  if (!folders.length) return "";
  const sorted = folders.slice().sort((a, b) => {
    const aName = String(a.name || "").toLowerCase();
    const bName = String(b.name || "").toLowerCase();
    return aName.localeCompare(bName);
  });
  return sorted
    .map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`)
    .join("");
}

/**
 * Get last used folder ID from settings
 * @returns {string}
 */
export function getLastFolderId() {
  const stored = game.settings?.get(MODULE_ID, "lastFolderId");
  if (!stored) return "";
  const folder = game.folders?.get(stored);
  return folder ? stored : "";
}

/**
 * Save last used folder ID to settings
 * @param {string} folderId - Folder ID
 */
export function setLastFolderId(folderId) {
  if (!game.settings) return;
  game.settings.set(MODULE_ID, "lastFolderId", folderId || "");
}

/**
 * Get last used species key from settings
 * @returns {string}
 */
export function getLastSpeciesKey() {
  return game.settings?.get(MODULE_ID, "lastSpeciesKey") || "";
}

/**
 * Save last used species key to settings
 * @param {string} value - Species key
 */
export function setLastSpeciesKey(value) {
  if (!game.settings) return;
  game.settings.set(MODULE_ID, "lastSpeciesKey", value || "");
}

/**
 * Get last NPC options from settings
 * @returns {Object|null}
 */
export function getLastNpcOptions() {
  const raw = game.settings?.get(MODULE_ID, "lastNpcOptions");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Save last NPC options to settings
 * @param {Object} options - Options object
 */
export function setLastNpcOptions(options) {
  if (!game.settings) return;
  try {
    const payload = options ? JSON.stringify(options) : "";
    game.settings.set(MODULE_ID, "lastNpcOptions", payload);
  } catch {
    game.settings.set(MODULE_ID, "lastNpcOptions", "");
  }
}

/**
 * Attach species search functionality to inputs
 * @param {jQuery} searchInput - Search input element
 * @param {jQuery} selectEl - Select element
 * @param {HTMLOptionElement[]} allOptions - All option elements
 */
export function attachSpeciesSearch(searchInput, selectEl, allOptions) {
  if (!searchInput?.length || !selectEl?.length) return;
  searchInput.on("input", () => {
    const q = String(searchInput.val() || "").trim().toLowerCase();
    const currentValue = String(selectEl.val() || "");
    selectEl.empty();

    const startsWith = [];
    const wordStart = [];
    const contains = [];
    let randomOpt = null;

    for (const opt of allOptions || []) {
      if (opt.value === "random") {
        randomOpt = opt;
        continue;
      }
      const text = (opt.textContent || "").toLowerCase();
      if (!q) {
        contains.push(opt);
        continue;
      }
      if (text.startsWith(q)) {
        startsWith.push(opt);
        continue;
      }
      if (text.split(/\s+/).some((part) => part.startsWith(q))) {
        wordStart.push(opt);
        continue;
      }
      if (text.includes(q)) {
        contains.push(opt);
      }
    }

    if (randomOpt) selectEl.append(randomOpt);
    for (const opt of startsWith.concat(wordStart, contains)) {
      selectEl.append(opt);
    }

    const stillExists = currentValue && selectEl.find(`option[value="${currentValue}"]`).length;
    const hasMatches = startsWith.length || wordStart.length || contains.length;
    if (stillExists && currentValue !== "random") {
      selectEl.val(currentValue);
    } else if (hasMatches) {
      selectEl.val((startsWith[0] || wordStart[0] || contains[0]).value);
    } else if (!q && randomOpt) {
      selectEl.val("random");
    }
  });
}

/**
 * Show changelog if module was updated
 */
export async function showChangelogIfUpdated() {
  if (!game.user?.isGM) return;
  const version = game.modules?.get(MODULE_ID)?.version;
  if (!version) return;
  const lastSeen = game.settings?.get(MODULE_ID, "lastSeenVersion") || "";
  if (lastSeen === version) return;

  const notes = await loadChangelogNotes(version);
  if (!notes?.length) return;

  const content = `
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      <div style="font-weight: 600;">${i18nHtmlFormat("ui.changelog.whatsNew", { version })}</div>
      <ul style="margin: 0; padding-left: 1.25rem;">
        ${notes.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
      </ul>
    </div>
  `;

  new Dialog({
    title: i18nText("ui.changelog.title"),
    content,
    buttons: {
      dismiss: {
        label: i18nText("ui.changelog.dismissUntilNextUpdate"),
        callback: () => {
          game.settings?.set(MODULE_ID, "lastSeenVersion", version);
        }
      }
    },
    default: "dismiss"
  }).render(true);
}

/**
 * Load changelog notes for a version
 * @param {string} version - Version string
 * @returns {Promise<string[]|null>}
 */
export async function loadChangelogNotes(version) {
  try {
    const response = await fetch(`modules/${MODULE_ID}/CHANGELOG.md`);
    if (!response.ok) return null;
    const text = await response.text();
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const headingRe = new RegExp(`^##\\s+${escaped}\\s*$`, "m");
    const headingMatch = headingRe.exec(text);
    if (!headingMatch) return null;

    const start = headingMatch.index + headingMatch[0].length;
    const rest = text.slice(start).replace(/^\r?\n/, "");
    const nextHeadingIndex = rest.search(/^##\s+/m);
    const sectionText = nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);

    const bullets = sectionText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.replace(/^-\s+/, "").trim())
      .filter(Boolean);
    return bullets.length ? bullets : null;
  } catch {
    return null;
  }
}

/**
 * Add NPC button to actor directory
 * @param {jQuery|HTMLElement} html - Directory HTML
 */
export function addNpcButton(html) {
  const $html = html?.jquery ? html : $(html);
  if (!$html?.length || typeof $html.find !== "function") return;
  $html
    .find(`.npc-btn-header-actions [data-${MODULE_ID}='create']`)
    .filter((_, el) => $(el).closest(".directory-header").length === 0)
    .remove();
  $html
    .find(`.npc-btn-header-actions[data-${MODULE_ID}='actions']`)
    .filter((_, el) => $(el).closest(".directory-header").length === 0)
    .remove();
  const selectors = [
    ".directory-header .header-actions",
    ".directory-header .action-buttons",
    ".directory-header .controls",
    ".directory-header .action-buttons.flexrow",
    ".directory-header .action-buttons .actions",
    ".directory-header",
    ".header-actions"
  ];

  let headerActions = null;
  for (const selector of selectors) {
    const found = $html.find(selector).first();
    if (found.length) {
      headerActions = found;
      break;
    }
  }

  const existing = $html.find(`.directory-header [data-${MODULE_ID}='create'], [data-${MODULE_ID}='create'].npc-btn-sidebar-button`);
  if (existing.length) return;

  const button = $(
    `<button type="button" class="npc-btn-sidebar-button" data-${MODULE_ID}="create">
      <i class="fas fa-user-plus"></i> ${i18nHtml("ui.sidebarButton.label")}
    </button>`
  );
  button.attr("style", "display:inline-flex !important;align-items:center;gap:0.35rem;");

  button.on("click", () => openNpcDialog());

  if (headerActions) {
    headerActions.append(button);
    return;
  }

  const createButton = $html.find(
    ".directory-header button[data-action='create'], .directory-header button.create-entity"
  ).first();

  if (createButton.length) {
    createButton.after(button);
    return;
  }

  const directoryHeader = $html.find(".directory-header").first();
  if (directoryHeader.length) {
    let fallbackActions = directoryHeader.find(`.npc-btn-header-actions[data-${MODULE_ID}='actions']`).first();
    if (!fallbackActions.length) {
      fallbackActions = $(
        `<div class="npc-btn-header-actions action-buttons flexrow" data-${MODULE_ID}="actions"></div>`
      );
      directoryHeader.append(fallbackActions);
    }
    fallbackActions.append(button);
    return;
  }
}

/**
 * Open the NPC creation dialog
 */
export async function openNpcDialog() {
  if (game.system?.id !== "dnd5e") {
    ui.notifications?.error(i18nText("ui.errorRequiresDnd5e"));
    return;
  }

  try {
    await loadData();

    const archetypes = DATA_CACHE.archetypes;
    if (!DATA_CACHE.speciesEntries?.length) {
      ui.notifications?.warn(i18nText("ui.warnNoSpeciesCompendiumEntries"));
    }
    const options = archetypes
      .map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`)
      .join("");
    const folderOptions = getActorFolderOptions();
    const lastFolder = getLastFolderId();
    const speciesOptions = await getSpeciesOptions();
    const lastSpeciesKey = getLastSpeciesKey();
    const lastOptions = getLastNpcOptions();
    const aiReady = isOpenAiConfigured();
    const speciesEntries = Array.isArray(DATA_CACHE.speciesEntries) ? DATA_CACHE.speciesEntries : [];
    const cultureOptions = Object.keys(DATA_CACHE.names?.cultures || {})
      .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(capitalize(k))}</option>`)
      .join("");

    const content = buildNpcDialogContent({
      archetypeOptionsHtml: options,
      cultureOptionsHtml: cultureOptions,
      folderOptionsHtml: folderOptions,
      speciesOptionsHtml: speciesOptions,
      aiReady,
      i18nHtml
    });

    new Dialog({
      title: i18nText("ui.dialog.title"),
      content,
      buttons: {
      cache: {
        label: i18nText("ui.dialog.buttonBuildCache"),
        callback: async () => {
          await buildCompendiumCache();
        }
      },
      create: {
        label: i18nText("ui.dialog.buttonCreateNpc"),
        callback: async (html) => {
          const form = html.find("form")[0];
          const formData = new FormData(form);
          await createNpcFromForm(formData);
        }
      },
      createAi: {
        label: i18nText("ui.dialog.buttonCreateAiNpc"),
        callback: async (html) => {
          const form = html.find("form")[0];
          const formData = new FormData(form);
          await createNpcFromForm(formData, { aiFull: true });
        }
      },
      cancel: { label: i18nText("common.cancel") }
      },
      default: "create",
      render: (html) => {
      const form = html.find("form");
      const tabButtons = form.find("[data-tab]");
      const tabPanels = form.find("[data-tab-panel]");
      const encounterModeInput = form.find("input[name='encounterMode']");
      const createButton = html.find("button[data-button='create']");
      const createAiButton = html.find("button[data-button='createAi']");
      const aiSection = form.find("[data-ai-section]");
      const dialogButtons = html.closest(".dialog").find(".dialog-buttons");
      dialogButtons.addClass("npc-btn-dialog-buttons");
      createAiButton.hide();
      const updateCreateLabel = () => {
        const mode = String(encounterModeInput.val() || "main");
        if (mode === "encounter") {
          createButton.text(i18nText("ui.dialog.buttonCreateEncounter"));
          createAiButton.text(i18nText("ui.dialog.buttonCreateAiEncounter"));
          return;
        }
        if (mode === "shop") {
          createButton.text(i18nText("ui.dialog.buttonCreateShop"));
          createAiButton.text(i18nText("ui.dialog.buttonCreateAiNpc"));
          return;
        }
        if (mode === "loot") {
          createButton.text(i18nText("ui.dialog.buttonCreateLoot"));
          createAiButton.text(i18nText("ui.dialog.buttonCreateAiNpc"));
          return;
        }
        createButton.text(i18nText("ui.dialog.buttonCreateNpc"));
        createAiButton.text(i18nText("ui.dialog.buttonCreateAiNpc"));
      };
      if (lastFolder) {
        form.find("select[name='folder']").val(lastFolder);
        form.find("select[name='shopFolder']").val(lastFolder);
      }
      if (lastSpeciesKey) {
        form.find("select[name='species']").val(lastSpeciesKey);
      }
      if (lastOptions) {
        if (lastOptions.tier) form.find("select[name='tier']").val(String(lastOptions.tier));
        if (lastOptions.budget) form.find("select[name='budget']").val(String(lastOptions.budget));
        if (lastOptions.culture) form.find("select[name='culture']").val(String(lastOptions.culture));
        if (lastOptions.gender) form.find("select[name='gender']").val(String(lastOptions.gender));
        if (lastOptions.archetype) form.find("select[name='archetype']").val(String(lastOptions.archetype));
        if (lastOptions.encounterSpecies) {
          form.find("select[name='encounterSpecies']").val(String(lastOptions.encounterSpecies));
        }
        if (lastOptions.encounterArchetype) {
          form.find("select[name='encounterArchetype']").val(String(lastOptions.encounterArchetype));
        }
        if (lastOptions.partyLevel) form.find("input[name='partyLevel']").val(Number(lastOptions.partyLevel));
        if (lastOptions.partySize) form.find("input[name='partySize']").val(Number(lastOptions.partySize));
        if (lastOptions.count) form.find("input[name='count']").val(Number(lastOptions.count));
        if (lastOptions.encounterDifficulty) {
          form.find("select[name='encounterDifficulty']").val(String(lastOptions.encounterDifficulty));
        }
        if (lastOptions.shopType) form.find("select[name='shopType']").val(String(lastOptions.shopType));
        if (lastOptions.shopCount) form.find("input[name='shopCount']").val(Number(lastOptions.shopCount));
        if (lastOptions.shopBudget) form.find("select[name='shopBudget']").val(String(lastOptions.shopBudget));
        if (lastOptions.shopName) form.find("input[name='shopName']").val(String(lastOptions.shopName));
        if (lastOptions.shopkeeperTier) form.find("select[name='shopkeeperTier']").val(String(lastOptions.shopkeeperTier));
        if (lastOptions.shopFolder) form.find("select[name='shopFolder']").val(String(lastOptions.shopFolder));
        if (typeof lastOptions.shopAllowMagic === "boolean") {
          form.find("input[name='shopAllowMagic']").prop("checked", lastOptions.shopAllowMagic);
        }
        if (lastOptions.lootType) form.find("select[name='lootType']").val(String(lastOptions.lootType));
        if (lastOptions.lootCount) form.find("input[name='lootCount']").val(Number(lastOptions.lootCount));
        if (lastOptions.lootBudget) form.find("select[name='lootBudget']").val(String(lastOptions.lootBudget));
        if (lastOptions.lootTier) form.find("select[name='lootTier']").val(String(lastOptions.lootTier));
        if (typeof lastOptions.lootAllowMagic === "boolean") {
          form.find("input[name='lootAllowMagic']").prop("checked", lastOptions.lootAllowMagic);
        }
        if (typeof lastOptions.lootIncludeCoins === "boolean") {
          form.find("input[name='lootIncludeCoins']").prop("checked", lastOptions.lootIncludeCoins);
        }
        if (typeof lastOptions.lootUniqOnly === "boolean") {
          form.find("input[name='lootUniqOnly']").prop("checked", lastOptions.lootUniqOnly);
        }
        if (typeof lastOptions.includeLoot === "boolean") {
          form.find("input[name='includeLoot']").prop("checked", lastOptions.includeLoot);
        }
        if (typeof lastOptions.includeSecret === "boolean") {
          form.find("input[name='includeSecret']").prop("checked", lastOptions.includeSecret);
        }
        if (typeof lastOptions.includeHook === "boolean") {
          form.find("input[name='includeHook']").prop("checked", lastOptions.includeHook);
        }
        if (typeof lastOptions.importantNpc === "boolean") {
          form.find("input[name='importantNpc']").prop("checked", lastOptions.importantNpc);
        }
        if (typeof lastOptions.useAi === "boolean") {
          form.find("input[name='useAi']").prop("checked", lastOptions.useAi);
        } else if (
          lastOptions.includeAiFull === true ||
          lastOptions.includeAiFlavor === true ||
          lastOptions.includeAiToken === true
        ) {
          form.find("input[name='useAi']").prop("checked", true);
        }
        if (typeof lastOptions.includeAiFlavor === "boolean") {
          form.find("input[name='includeAiFlavor']").prop("checked", lastOptions.includeAiFlavor && aiReady);
        }
        if (typeof lastOptions.includeAiToken === "boolean") {
          form.find("input[name='includeAiToken']").prop("checked", lastOptions.includeAiToken && aiReady);
        }
        if (lastOptions.encounterMode) {
          const mode = String(lastOptions.encounterMode);
          if (["main", "encounter", "shop", "loot"].includes(mode)) {
            tabButtons.removeClass("active");
            form.find(`[data-tab='${mode}']`).addClass("active");
            tabPanels.hide();
            form.find(`[data-tab-panel='${mode}']`).show();
            encounterModeInput.val(mode);
          }
        }
      }
      const speciesSearch = form.find("input[name='speciesSearch']");
      const speciesSelect = form.find("select[name='species']");
      const allOptions = speciesSelect.find("option").toArray();
      const encounterSpeciesSearch = form.find("input[name='encounterSpeciesSearch']");
      const encounterSpeciesSelect = form.find("select[name='encounterSpecies']");
      const encounterAllOptions = encounterSpeciesSelect.find("option").toArray();
      const archetypeSelect = form.find("select[name='archetype']");
      const useAiToggle = form.find("input[name='useAi']");
      const aiControls = form.find("[data-ai-controls]");
      const aiNpcActions = form.find("[data-ai-npc-actions]");
      const aiShopActions = form.find("[data-ai-shop-actions]");
      const aiLootActions = form.find("[data-ai-loot-actions]");
      const aiNpcOptions = form.find("[data-ai-npc-options]");
      const aiNpcNotes = form.find("[data-ai-npc-note]");
      const includeAiFlavorInput = form.find("input[name='includeAiFlavor']");
      const includeAiTokenInput = form.find("input[name='includeAiToken']");
      const shopImportPayloadInput = form.find("input[name='shopImportPayload']");
      const lootImportPayloadInput = form.find("input[name='lootImportPayload']");
      const readChecked = (name) => !!form.find(`input[name='${name}']`).prop("checked");
      const collectDialogOptions = () => ({
        tier: String(form.find("select[name='tier']").val() || "auto"),
        budget: String(form.find("select[name='budget']").val() || "normal"),
        culture: String(form.find("select[name='culture']").val() || "random"),
        gender: String(form.find("select[name='gender']").val() || "random"),
        archetype: String(form.find("select[name='archetype']").val() || "random"),
        encounterSpecies: String(form.find("select[name='encounterSpecies']").val() || "random"),
        encounterArchetype: String(form.find("select[name='encounterArchetype']").val() || "random"),
        count: Math.max(1, Math.min(50, Number(form.find("input[name='count']").val()) || 1)),
        partyLevel: Math.max(1, Math.min(20, Number(form.find("input[name='partyLevel']").val()) || 3)),
        partySize: Math.max(1, Math.min(8, Number(form.find("input[name='partySize']").val()) || 4)),
        encounterDifficulty: String(form.find("select[name='encounterDifficulty']").val() || "medium"),
        encounterMode: String(encounterModeInput.val() || "main"),
        shopType: String(form.find("select[name='shopType']").val() || "market"),
        shopCount: Math.max(1, Math.min(60, Number(form.find("input[name='shopCount']").val()) || 12)),
        shopBudget: String(form.find("select[name='shopBudget']").val() || "normal"),
        shopName: String(form.find("input[name='shopName']").val() || "").trim(),
        shopkeeperTier: Math.max(1, Math.min(4, Number(form.find("select[name='shopkeeperTier']").val()) || 1)),
        shopFolder: String(form.find("select[name='shopFolder']").val() || ""),
        shopAllowMagic: readChecked("shopAllowMagic"),
        lootType: String(form.find("select[name='lootType']").val() || "mixed"),
        lootCount: Math.max(1, Math.min(60, Number(form.find("input[name='lootCount']").val()) || 12)),
        lootBudget: String(form.find("select[name='lootBudget']").val() || "normal"),
        lootTier: String(form.find("select[name='lootTier']").val() || "auto"),
        lootAllowMagic: readChecked("lootAllowMagic"),
        lootIncludeCoins: readChecked("lootIncludeCoins"),
        lootUniqOnly: readChecked("lootUniqOnly"),
        useAi: !!useAiToggle.prop("checked"),
        includeLoot: readChecked("includeLoot"),
        includeSecret: readChecked("includeSecret"),
        includeHook: readChecked("includeHook"),
        includeAiFlavor: !!includeAiFlavorInput.prop("checked"),
        includeAiToken: !!includeAiTokenInput.prop("checked"),
        importantNpc: readChecked("importantNpc")
      });
      const persistDialogOptions = () => {
        setLastNpcOptions(collectDialogOptions());
        const activeMode = String(encounterModeInput.val() || "main");
        const selectedFolder = activeMode === "shop"
          ? String(form.find("select[name='shopFolder']").val() || "")
          : String(form.find("select[name='folder']").val() || "");
        setLastFolderId(selectedFolder);
        const selectedSpecies = String(speciesSelect.val() || "random");
        setLastSpeciesKey(selectedSpecies !== "random" ? selectedSpecies : "");
      };
      tabButtons.on("click", (ev) => {
        const tab = ev.currentTarget.getAttribute("data-tab");
        tabButtons.removeClass("active");
        $(ev.currentTarget).addClass("active");
        tabPanels.hide();
        form.find(`[data-tab-panel='${tab}']`).show();
        encounterModeInput.val(tab);
        if (tab === "encounter") refreshEncounterCount();
        updateCreateLabel();
        updateAiUi();
        persistDialogOptions();
      });
      form.find("[data-action='open-ai-key']").on("click", () => {
        openOpenAiApiKeyDialog();
      });
      form.find("[data-action='copy-ai-prompt']").on("click", async () => {
        const promptContext = collectManualPromptContext({
          form,
          encounterModeInput,
          archetypes,
          speciesEntries
        });
        const promptText =
          promptContext.encounterMode === "encounter"
            ? buildManualEncounterNpcPrompt(promptContext)
            : buildManualFullNpcPrompt(promptContext);
        const copied = await copyTextToClipboard(promptText);
        if (copied) {
          ui.notifications?.info(i18nText("ui.infoPromptCopied"));
          return;
        }
        new Dialog({
          title: i18nText("ui.dialog.chatGptPromptTitle"),
          content: `
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <p style="margin:0;font-size:0.85rem;opacity:0.85;">
                ${i18nHtml("ui.dialog.chatGptPromptNote")}
              </p>
              <textarea style="width:100%;min-height:18rem;" readonly>${escapeHtml(promptText)}</textarea>
            </div>
          `,
          buttons: {
            close: { label: i18nText("common.close") }
          },
          default: "close"
        }).render(true);
      });
      form.find("[data-action='import-ai-json']").on("click", () => {
        openImportAiNpcDialog({
          form,
          encounterModeInput,
          speciesEntries
        });
      });
      form.find("[data-action='shop-copy-prompt']").on("click", async () => {
        const promptText = buildManualShopPrompt(collectShopPromptContext(form));
        const copied = await copyTextToClipboard(promptText);
        if (copied) {
          ui.notifications?.info(i18nText("ui.shop.infoPromptCopied"));
          return;
        }
        new Dialog({
          title: i18nText("ui.dialog.shopPromptTitle"),
          content: `
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <p style="margin:0;font-size:0.85rem;opacity:0.85;">
                ${i18nHtml("ui.dialog.shopPromptNote")}
              </p>
              <textarea style="width:100%;min-height:18rem;" readonly>${escapeHtml(promptText)}</textarea>
            </div>
          `,
          buttons: {
            close: { label: i18nText("common.close") }
          },
          default: "close"
        }).render(true);
      });
      form.find("[data-action='shop-import-json']").on("click", () => {
        openImportShopJsonDialog({
          onImport: async (payload) => {
            applyImportedShopPayloadToForm(form, payload);
            shopImportPayloadInput.val(JSON.stringify(payload));
            encounterModeInput.val("shop");
            persistDialogOptions();
            await createShopFromForm(new FormData(form[0]));
            shopImportPayloadInput.val("");
            persistDialogOptions();
          }
        });
      });
      form.find("[data-action='loot-copy-prompt']").on("click", async () => {
        const promptText = buildManualLootPrompt(collectLootPromptContext(form));
        const copied = await copyTextToClipboard(promptText);
        if (copied) {
          ui.notifications?.info(i18nText("ui.loot.infoPromptCopied"));
          return;
        }
        new Dialog({
          title: i18nText("ui.dialog.lootPromptTitle"),
          content: `
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <p style="margin:0;font-size:0.85rem;opacity:0.85;">
                ${i18nHtml("ui.dialog.lootPromptNote")}
              </p>
              <textarea style="width:100%;min-height:18rem;" readonly>${escapeHtml(promptText)}</textarea>
            </div>
          `,
          buttons: {
            close: { label: i18nText("common.close") }
          },
          default: "close"
        }).render(true);
      });
      form.find("[data-action='loot-import-json']").on("click", () => {
        openImportLootJsonDialog({
          onImport: async (payload) => {
            applyImportedLootPayloadToForm(form, payload);
            lootImportPayloadInput.val(JSON.stringify(payload));
            encounterModeInput.val("loot");
            persistDialogOptions();
            await createLootFromForm(new FormData(form[0]));
            lootImportPayloadInput.val("");
            persistDialogOptions();
          }
        });
      });
      const updateAiUi = () => {
        const mode = String(encounterModeInput.val() || "main");
        const useAi = !!useAiToggle.prop("checked");
        const shopMode = mode === "shop";
        const lootMode = mode === "loot";
        const nonNpcMode = shopMode || lootMode;
        aiSection.css("display", "flex");
        aiControls.css("display", useAi ? "flex" : "none");
        aiNpcActions.css("display", nonNpcMode ? "none" : "grid");
        aiShopActions.css("display", shopMode ? "grid" : "none");
        aiLootActions.css("display", lootMode ? "grid" : "none");
        aiNpcOptions.css("display", nonNpcMode ? "none" : "grid");
        aiNpcNotes.css("display", nonNpcMode ? "none" : "block");
        createAiButton.toggle(useAi && !nonNpcMode);
        if (nonNpcMode) {
          createAiButton.hide();
          createAiButton.prop("disabled", true);
          createAiButton.attr("title", "");
          return;
        }
        if (!useAi) {
          createAiButton.prop("disabled", false);
          createAiButton.attr("title", "");
          return;
        }
        if (!aiReady) {
          createAiButton.prop("disabled", true);
          createAiButton.attr("title", i18nText("ui.dialog.setApiKeyFirstTitle"));
        } else {
          createAiButton.prop("disabled", false);
          createAiButton.attr("title", "");
        }
      };
      if (!aiReady) {
        includeAiFlavorInput.prop("disabled", true);
        includeAiTokenInput.prop("disabled", true);
      }
      useAiToggle.on("change", () => {
        updateAiUi();
        persistDialogOptions();
      });
      includeAiFlavorInput.on("change", persistDialogOptions);
      includeAiTokenInput.on("change", persistDialogOptions);
      form.find("[data-action='roll-archetype']").on("click", () => {
        const opts = archetypeSelect.find("option").toArray().filter((o) => o.value !== "random");
        if (!opts.length) return;
        const pick = pickRandom(opts);
        if (pick) archetypeSelect.val(pick.value);
        persistDialogOptions();
      });
      attachSpeciesSearch(speciesSearch, speciesSelect, allOptions);
      attachSpeciesSearch(encounterSpeciesSearch, encounterSpeciesSelect, encounterAllOptions);
      const input = form.find("input[name='count']");
      const clamp = (val) => Math.max(1, Math.min(50, Number(val) || 1));
      form.find("[data-npc-count='minus']").on("click", () => {
        input.val(clamp(Number(input.val()) - 1));
        persistDialogOptions();
      });
      form.find("[data-npc-count='plus']").on("click", () => {
        input.val(clamp(Number(input.val()) + 1));
        persistDialogOptions();
      });
      form.on(
        "change input",
        [
          "select[name='tier']",
          "select[name='budget']",
          "select[name='culture']",
          "select[name='gender']",
          "select[name='archetype']",
          "select[name='species']",
          "select[name='encounterSpecies']",
          "select[name='encounterArchetype']",
          "select[name='encounterDifficulty']",
          "select[name='shopType']",
          "select[name='shopBudget']",
          "select[name='shopkeeperTier']",
          "select[name='lootType']",
          "select[name='lootBudget']",
          "select[name='lootTier']",
          "select[name='folder']",
          "select[name='shopFolder']",
          "input[name='partyLevel']",
          "input[name='partySize']",
          "input[name='count']",
          "input[name='shopCount']",
          "input[name='lootCount']",
          "input[name='shopName']",
          "input[name='includeLoot']",
          "input[name='includeSecret']",
          "input[name='includeHook']",
          "input[name='importantNpc']",
          "input[name='shopAllowMagic']",
          "input[name='lootAllowMagic']",
          "input[name='lootIncludeCoins']",
          "input[name='lootUniqOnly']"
        ].join(", "),
        persistDialogOptions
      );

      const partyLevel = form.find("input[name='partyLevel']");
      const partySize = form.find("input[name='partySize']");
      const encounterDifficulty = form.find("select[name='encounterDifficulty']");
      const refreshEncounterCount = () => {
        if (encounterModeInput.val() !== "encounter") return;
        const desired = buildEncounterCount({
          partyLevel: Number(partyLevel.val() || 1),
          partySize: Number(partySize.val() || 4),
          difficulty: String(encounterDifficulty.val() || "medium")
        });
        input.val(clamp(desired));
      };
      partyLevel.on("input", refreshEncounterCount);
      partySize.on("input", refreshEncounterCount);
      encounterDifficulty.on("change", refreshEncounterCount);
      refreshEncounterCount();
      updateCreateLabel();
      updateAiUi();
      persistDialogOptions();
      }
    }).render(true);
  } catch (err) {
    console.error("NPC Button: Failed to open NPC dialog.", err);
    ui.notifications?.error(i18nText("ui.errorOpenDialogFailed"));
  }
}

/**
 * Create NPCs from form data
 * @param {FormData} formData - Form data
 * @param {Object} [options] - Extra generation options
 */
export async function createNpcFromForm(formData, options = {}) {
  try {
    await loadData();

    const useAiRequested = formData.get("useAi") === "on";
    const useAiFullRequested = options?.aiFull === true;
    const useAiFull = useAiRequested && useAiFullRequested;

    const encounterMode = String(formData.get("encounterMode") || "main");
    const tierInput = formData.get("tier");
    const tier = tierInput === "auto" ? getAutoTier() : Number(tierInput);
    const cultureInput = formData.get("culture");
    const genderInput = normalizeGenderOption(formData.get("gender"));
    const archetypeInput = formData.get("archetype");
    const folderInput = String(formData.get("folder") || "").trim() || null;
    let folderId = folderInput;
    const encounterSpeciesKey = String(formData.get("encounterSpecies") || "random");
    const encounterArchetypeKey = String(formData.get("encounterArchetype") || "random");
    const partyLevelInput = Number(formData.get("partyLevel") || 3);
    const partySizeInput = Number(formData.get("partySize") || 4);
    const encounterDifficulty = String(formData.get("encounterDifficulty") || "medium");
    const shopType = normalizeShopType(formData.get("shopType"));
    const shopBudget = normalizeBudgetOption(formData.get("shopBudget"));
    const shopCount = clampRangeValue(formData.get("shopCount"), 1, 60, 12);
    const shopName = String(formData.get("shopName") || "").trim();
    const shopkeeperTier = clampRangeValue(formData.get("shopkeeperTier"), 1, 4, 1);
    const shopFolderInput = String(formData.get("shopFolder") || "").trim();
    const shopAllowMagic = formData.get("shopAllowMagic") === "on";
    const lootType = normalizeLootType(formData.get("lootType"));
    const lootCount = clampRangeValue(formData.get("lootCount"), 1, 60, 12);
    const lootBudget = normalizeBudgetOption(formData.get("lootBudget") || formData.get("budget"));
    const lootTier = String(formData.get("lootTier") || "auto");
    const lootAllowMagic = formData.get("lootAllowMagic") === "on";
    const lootIncludeCoins = formData.get("lootIncludeCoins") === "on";
    const lootUniqOnly = formData.get("lootUniqOnly") === "on";
    setLastNpcOptions({
      tier: String(tierInput || "auto"),
      budget: String(formData.get("budget") || "normal"),
      culture: String(cultureInput || "random"),
      gender: genderInput,
      archetype: String(archetypeInput || "random"),
      count: Math.max(1, Math.min(50, Number(formData.get("count")) || 1)),
      encounterSpecies: encounterSpeciesKey,
      encounterArchetype: encounterArchetypeKey,
      partyLevel: partyLevelInput,
      partySize: partySizeInput,
      encounterDifficulty,
      encounterMode,
      shopType,
      shopBudget,
      shopCount,
      shopName,
      shopkeeperTier,
      shopFolder: shopFolderInput,
      shopAllowMagic,
      lootType,
      lootCount,
      lootBudget,
      lootTier,
      lootAllowMagic,
      lootIncludeCoins,
      lootUniqOnly,
      useAi: useAiRequested,
      includeLoot: formData.get("includeLoot") === "on",
      includeSecret: formData.get("includeSecret") === "on",
      includeHook: formData.get("includeHook") === "on",
      includeAiFlavor: formData.get("includeAiFlavor") === "on",
      includeAiToken: formData.get("includeAiToken") === "on",
      includeAiFull: useAiFullRequested,
      importantNpc: formData.get("importantNpc") === "on"
    });

    if (encounterMode === "shop") {
      await createShopFromForm(formData);
      return;
    }
    if (encounterMode === "loot") {
      await createLootFromForm(formData);
      return;
    }

    if (!DATA_CACHE.archetypes?.length) {
      ui.notifications?.error(i18nText("ui.errorNoArchetypes"));
      return;
    }
    let countInput = Math.max(1, Math.min(50, Number(formData.get("count")) || 1));
    const budgetInput = String(formData.get("budget") || "normal");
    const speciesKeyInput = String(formData.get("species") || "random");
    let speciesList = DATA_CACHE.speciesEntries || [];
    if (!speciesList.length) {
      speciesList = await getSpeciesEntries();
    }
    const fixedSpecies =
      speciesKeyInput !== "random"
        ? speciesList.find((entry) => entry.key === speciesKeyInput)
        : null;
    const fixedEncounterSpecies =
      encounterSpeciesKey !== "random"
        ? speciesList.find((entry) => entry.key === encounterSpeciesKey)
        : null;
    setLastSpeciesKey(fixedSpecies?.key || "");
    if (!fixedSpecies && !speciesList.length) {
      ui.notifications?.warn(i18nText("ui.warnNoRaceEntries"));
    }
    const includeLoot = formData.get("includeLoot") === "on";
    const includeSecret = formData.get("includeSecret") === "on";
    const includeHook = formData.get("includeHook") === "on";
    const includeAiFlavor = useAiRequested && formData.get("includeAiFlavor") === "on";
    const includeAiToken = useAiRequested && formData.get("includeAiToken") === "on";
    const manualImportant = formData.get("importantNpc") === "on";
    const aiReady = isOpenAiConfigured();

    if (useAiFullRequested && !useAiRequested) {
      ui.notifications?.warn(i18nText("ui.warnEnableUseAiFirst"));
      return;
    }

    if (useAiFull && !aiReady) {
      ui.notifications?.warn(
        i18nText("ui.warnAiFullRequiresApiKey")
      );
      return;
    }

    if (encounterMode === "encounter") {
      countInput = Math.max(
        1,
        Math.min(
          50,
          buildEncounterCount({
            partyLevel: partyLevelInput,
            partySize: partySizeInput,
            difficulty: encounterDifficulty
          })
        )
      );
      folderId = await ensureEncounterFolder();
    }
    setLastFolderId(folderId);

    const encounterPlan =
      encounterMode === "encounter"
        ? buildEncounterPlan(countInput, {
            partyLevel: partyLevelInput,
            partySize: partySizeInput,
            difficulty: encounterDifficulty
          })
        : null;

    const planned = [];
    const usedNames = new Set();
    const aiFullMaxBatch = useAiFull ? getOpenAiMaxBatch() : 0;
    let aiFullApplied = 0;
    let aiFullFailed = 0;
    let aiFullSkipped = 0;
    let archetypePool = shuffleArray(DATA_CACHE.archetypes);
    for (let i = 0; i < countInput; i++) {
      const encounterPool =
        encounterMode === "encounter" && encounterArchetypeKey !== "random"
          ? DATA_CACHE.archetypes.filter((a) => a.id === encounterArchetypeKey)
          : null;
      const useRandomArchetype = encounterMode === "encounter"
        ? encounterArchetypeKey === "random"
        : archetypeInput === "random";
      if (encounterMode === "encounter" && encounterPool && encounterPool.length) {
        if (!archetypePool.length || archetypePool.some((a) => !encounterPool.includes(a))) {
          archetypePool = shuffleArray(encounterPool);
        }
      }
      if (useRandomArchetype && !archetypePool.length) {
        archetypePool = shuffleArray(encounterPool && encounterPool.length ? encounterPool : DATA_CACHE.archetypes);
      }
      const archetype = useRandomArchetype
        ? archetypePool.shift()
        : encounterMode === "encounter"
          ? (encounterPool?.[0] || DATA_CACHE.archetypes.find((a) => a.id === encounterArchetypeKey))
          : DATA_CACHE.archetypes.find((a) => a.id === archetypeInput);
      const resolvedArchetype = archetype || DATA_CACHE.archetypes[0];

      const culture =
        cultureInput === "random"
          ? pickRandom(Object.keys(DATA_CACHE.names.cultures))
          : cultureInput;
      const gender = genderInput === "random" ? pickRandom(["male", "female"]) : genderInput;

      const speciesEntry =
        (encounterMode === "encounter" ? fixedEncounterSpecies : fixedSpecies) ||
        (speciesList.length ? pickRandom(speciesList) : null);
      const hasFixedSpecies = encounterMode === "encounter" ? !!fixedEncounterSpecies : !!fixedSpecies;
      const speciesName = speciesEntry?.name || "Unknown";

      const plannedTier = encounterPlan?.[i]?.tier ?? tier;
      const importantNpc = encounterPlan?.[i]?.importantNpc ?? manualImportant;
      const localGenerated = generateNpc({
        tier: plannedTier,
        archetype: resolvedArchetype,
        culture,
        gender,
        race: speciesName,
        budget: budgetInput,
        includeLoot,
        includeSecret,
        includeHook,
        importantNpc,
        usedNames
      });

      if (!useAiFull) {
        planned.push({ generated: localGenerated, speciesEntry, generationMode: "local" });
        continue;
      }

      if (i >= aiFullMaxBatch) {
        aiFullSkipped += 1;
        planned.push({ generated: localGenerated, speciesEntry, generationMode: "local" });
        continue;
      }

      try {
        const aiGenerated = await generateFullNpcWithOpenAi({
          tier: plannedTier,
          culture,
          gender,
          race: speciesName,
          budget: budgetInput,
          includeLoot,
          includeSecret,
          includeHook,
          importantNpc,
          encounterDifficulty,
          archetypeName: resolvedArchetype?.name || "",
          attackStyle: resolvedArchetype?.attackStyle || "",
          archetypeTags: Array.isArray(resolvedArchetype?.tags) ? resolvedArchetype.tags : [],
          allowedSkillIds: Object.keys(CONFIG?.DND5E?.skills || {})
        });

        if (!aiGenerated || typeof aiGenerated !== "object") {
          aiFullFailed += 1;
          planned.push({ generated: localGenerated, speciesEntry, generationMode: "local" });
          continue;
        }

        aiGenerated.includeLoot = includeLoot;
        aiGenerated.includeSecret = includeSecret;
        aiGenerated.includeHook = includeHook;
        aiGenerated.importantNpc = importantNpc;
        aiGenerated.budget = aiGenerated.budget || budgetInput;
        aiGenerated.tier = Number(aiGenerated.tier || plannedTier) || plannedTier;

        const aiSpeciesEntry = findSpeciesEntryByRace(speciesList, aiGenerated.race);
        const finalSpeciesEntry = aiSpeciesEntry || (hasFixedSpecies ? speciesEntry : null);
        if (!aiGenerated.race && finalSpeciesEntry?.name) {
          aiGenerated.race = finalSpeciesEntry.name;
        }

        aiFullApplied += 1;
        planned.push({ generated: aiGenerated, speciesEntry: finalSpeciesEntry, generationMode: "ai-full" });
      } catch (err) {
        aiFullFailed += 1;
        console.warn(`NPC Button: OpenAI full NPC generation failed for slot ${i + 1}.`, err);
        planned.push({ generated: localGenerated, speciesEntry, generationMode: "local" });
      }
    }

    if (useAiFull) {
      if (aiFullApplied) {
        ui.notifications?.info(i18nFormat("ui.infoAiFullGenerated", { count: aiFullApplied }));
      }
      if (aiFullFailed) {
        ui.notifications?.warn(
          i18nFormat("ui.warnAiFullFailedFallback", { count: aiFullFailed })
        );
      }
      if (aiFullSkipped) {
        ui.notifications?.info(
          i18nFormat("ui.infoAiFullSkippedByBatch", { count: aiFullSkipped })
        );
      }
    }

    if (!useAiFull && includeAiFlavor) {
      if (!aiReady) {
        ui.notifications?.warn(
          i18nText("ui.warnAiFlavorSkippedNotConfigured")
        );
      } else {
        const aiResult = await applyOpenAiFlavorToPlanned(planned);
        if (aiResult.applied) {
          ui.notifications?.info(i18nFormat("ui.infoAiFlavorApplied", { count: aiResult.applied }));
        }
        if (aiResult.failed) {
          ui.notifications?.warn(
            i18nFormat("ui.warnAiFlavorFailedFallback", { count: aiResult.failed })
          );
        }
        if (aiResult.skipped) {
          ui.notifications?.info(
            i18nFormat("ui.infoAiFlavorSkippedByBatch", { count: aiResult.skipped })
          );
        }
      }
    }

    if (includeAiToken) {
      if (!aiReady) {
        ui.notifications?.warn(
          i18nText("ui.warnAiTokenSkippedNotConfigured")
        );
      } else {
        const aiTokenResult = await applyOpenAiTokenToPlanned(planned);
        if (aiTokenResult.applied) {
          ui.notifications?.info(i18nFormat("ui.infoAiTokenGenerated", { count: aiTokenResult.applied }));
        }
        if (aiTokenResult.failed) {
          ui.notifications?.warn(
            i18nFormat("ui.warnAiTokenFailedFallback", { count: aiTokenResult.failed })
          );
        }
        if (aiTokenResult.skipped) {
          ui.notifications?.info(
            i18nFormat("ui.infoAiTokenSkippedByBatch", { count: aiTokenResult.skipped })
          );
        }
      }
    }

    const buildResults = await Promise.all(
      planned.map(async (entry) => {
        if (entry.generationMode === "ai-full") {
          const result = await buildActorDataFromAiBlueprint(entry.generated, folderId);
          return {
            actorData: result?.actorData,
            resolvedItems: Number(result?.resolvedItems || 0),
            missingItems: Number(result?.missingItems || 0)
          };
        }
        return {
          actorData: await buildActorData(entry.generated, folderId),
          resolvedItems: 0,
          missingItems: 0
        };
      })
    );
    const actorDataList = buildResults.map((entry) => entry.actorData);
    const resolvedAiItems = buildResults.reduce((sum, entry) => sum + Number(entry.resolvedItems || 0), 0);
    const missingAiItems = buildResults.reduce((sum, entry) => sum + Number(entry.missingItems || 0), 0);
    if (useAiFull && resolvedAiItems) {
      ui.notifications?.info(i18nFormat("ui.infoAiItemsMatched", { count: resolvedAiItems }));
    }
    if (useAiFull && missingAiItems) {
      ui.notifications?.warn(
        i18nFormat("ui.warnAiItemsMissing", { count: missingAiItems })
      );
    }

    const created =
      typeof Actor.createDocuments === "function"
        ? await Actor.createDocuments(actorDataList)
        : await Promise.all(actorDataList.map((data) => Actor.create(data)));

    // Zip planned data with created actors for safer iteration
    const zipped = planned.map((plan, idx) => ({
      actor: created[idx],
      speciesEntry: plan.speciesEntry
    }));
    let speciesApplyErrors = 0;

    for (const { actor, speciesEntry } of zipped) {
      if (!actor || !speciesEntry) continue;
      try {
        const speciesItem = await buildSpeciesItem(speciesEntry);
        if (!speciesItem) continue;
        const createdItems = await actor.createEmbeddedDocuments("Item", [speciesItem]);
        const createdItem = createdItems?.[0] || null;
        if (!createdItem) continue;
        await actor.update({ "system.details.race": createdItem.id });
        await applySpeciesTraitsToActor(actor, createdItem);
        await applySpeciesAdvancements(actor, createdItem);
      } catch (err) {
        speciesApplyErrors += 1;
        console.warn(`NPC Button: Failed to apply species data for actor "${actor?.name || "Unknown"}".`, err);
      }
    }
    if (speciesApplyErrors) {
      ui.notifications?.warn(
        i18nFormat("ui.warnSpeciesApplyPartial", { count: speciesApplyErrors })
      );
    }

    if (created.length === 1) {
      ui.notifications?.info(i18nFormat("ui.infoCreatedSingle", { name: created[0]?.name || i18nText("common.unnamed") }));
      return;
    }
    const names = created.map((a) => a?.name).filter(Boolean);
    const preview = names.slice(0, 5).join(", ");
    const extra = names.length > 5 ? i18nFormat("ui.moreSuffix", { count: names.length - 5 }) : "";
    ui.notifications?.info(i18nFormat("ui.infoCreatedMany", { count: created.length, preview, extra }));
  } catch (err) {
    console.error("NPC Button: Failed to create NPC(s).", err);
    ui.notifications?.error(i18nText("ui.errorCreateNpcFailed"));
  }
}

async function createShopFromForm(formData) {
  const shopType = normalizeShopType(formData.get("shopType"));
  const itemCount = clampRangeValue(formData.get("shopCount"), 1, 60, 12);
  const budget = normalizeBudgetOption(formData.get("shopBudget") || formData.get("budget"));
  const shopNameInput = String(formData.get("shopName") || "").trim();
  const allowMagic = formData.get("shopAllowMagic") === "on";
  const shopkeeperTier = clampRangeValue(formData.get("shopkeeperTier"), 1, 4, 1);
  const fallbackFolderId = String(formData.get("shopFolder") || formData.get("folder") || "").trim() || null;
  const typeLabel = getShopTypeLabel(shopType);
  const importPayload = parseShopImportPayload(formData.get("shopImportPayload"));
  const importedShopName = String(importPayload?.shopName || "").trim();
  const shopName = importedShopName || shopNameInput || i18nFormat("ui.shop.defaultNameByType", { type: typeLabel });
  const hasImportPayload = !!importPayload;

  let folderId = fallbackFolderId;
  folderId = (await ensureShopFolder(shopType)) || fallbackFolderId;
  setLastFolderId(folderId || "");

  let stockItems = [];
  let importStats = null;
  if (hasImportPayload) {
    importStats = await buildShopInventoryFromImport({
      importPayload,
      shopType,
      budget,
      allowMagic
    });
    stockItems = Array.isArray(importStats?.items) ? importStats.items : [];
  } else {
    stockItems = await buildShopInventory({
      shopType,
      itemCount,
      budget,
      allowMagic
    });
  }

  const actor = await createShopkeeperActor({
    shopName,
    budget,
    tier: shopkeeperTier,
    folderId,
    stockItems,
    replaceGeneratedItems: hasImportPayload
  });

  if (!actor) {
    ui.notifications?.warn(i18nText("ui.shop.warnCreationFailed"));
    return;
  }

  if (Number(importStats?.missing || 0) > 0) {
    ui.notifications?.warn(
      i18nFormat("ui.shop.warnImportItemsMissing", {
        missing: Number(importStats.missing),
        resolved: Number(importStats.resolved || 0)
      })
    );
  }

  ui.notifications?.info(
    i18nFormat("ui.shop.infoCreated", {
      shop: shopName,
      count: stockItems.length,
      preview: actor?.name || i18nText("common.unnamed")
    })
  );
}

async function createLootFromForm(formData) {
  const importPayload = parseLootImportPayload(formData.get("lootImportPayload"));
  const hasImportPayload = !!importPayload;

  const fallbackType = normalizeLootType(formData.get("lootType"));
  const lootType = normalizeLootType(importPayload?.lootType || fallbackType);
  const fallbackCount = clampRangeValue(formData.get("lootCount"), 1, 60, 12);
  const itemCount = clampRangeValue(importPayload?.itemCount, 1, 60, fallbackCount);
  const fallbackBudget = normalizeBudgetOption(formData.get("lootBudget") || formData.get("budget"));
  const budget = normalizeBudgetOption(importPayload?.lootBudget || fallbackBudget);
  const fallbackTierInput = String(formData.get("lootTier") || "auto");
  const resolvedTierInput = String(importPayload?.lootTier ?? fallbackTierInput ?? "auto");
  const tier =
    resolvedTierInput === "auto"
      ? getAutoTier()
      : clampRangeValue(resolvedTierInput, 1, 4, getAutoTier());
  const fallbackAllowMagic = formData.get("lootAllowMagic") === "on";
  const fallbackIncludeCoins = formData.get("lootIncludeCoins") === "on";
  const fallbackUniqOnly = formData.get("lootUniqOnly") === "on";
  const allowMagic = parseBooleanLoose(importPayload?.lootAllowMagic, fallbackAllowMagic);
  const includeCoins = parseBooleanLoose(importPayload?.lootIncludeCoins, fallbackIncludeCoins);
  const uniqOnly = parseBooleanLoose(importPayload?.lootUniqOnly, fallbackUniqOnly);
  let folderId = await ensureLootFolder(lootType);
  setLastFolderId(folderId || "");

  let stockItems = [];
  let importStats = null;
  if (hasImportPayload) {
    importStats = await buildLootInventoryFromImport({
      importPayload,
      lootType,
      itemCount,
      budget,
      allowMagic,
      uniqueOnly: uniqOnly
    });
    stockItems = Array.isArray(importStats?.items) ? importStats.items : [];
  } else {
    stockItems = await buildLootInventory({
      lootType,
      itemCount,
      budget,
      allowMagic,
      uniqueOnly: uniqOnly
    });
  }

  const coinsFromImport = normalizeImportedLootCurrency(importPayload?.coins);
  const coins = coinsFromImport || buildLootCoins({ tier, budget, includeCoins });
  const lootName = i18nFormat("ui.loot.defaultNameByType", { type: getLootTypeLabel(lootType) });
  const actor = await createLootContainerActor({
    lootName,
    lootType,
    budget,
    tier,
    folderId,
    stockItems,
    coins
  });

  if (!actor) {
    ui.notifications?.warn(i18nText("ui.loot.warnCreationFailed"));
    return;
  }

  if (Number(importStats?.missing || 0) > 0) {
    ui.notifications?.warn(
      i18nFormat("ui.loot.warnImportItemsMissing", {
        missing: Number(importStats.missing),
        resolved: Number(importStats.resolved || 0)
      })
    );
  }

  ui.notifications?.info(
    i18nFormat("ui.loot.infoCreated", {
      name: lootName,
      count: stockItems.length,
      preview: actor?.name || i18nText("common.unnamed")
    })
  );
}

async function buildLootInventory({ lootType, itemCount, budget, allowMagic, uniqueOnly = true }) {
  const desired = clampRangeValue(itemCount, 1, 60, 12);
  const type = normalizeLootType(lootType);
  if (type === "coins") return [];
  const packs = uniquePackNames([
    ...getPacks("weapons"),
    ...getPacks("loot"),
    ...getPacks("spells")
  ]);
  let docs = getCachedItemDocsFromPacks(packs);
  if (!docs.length) docs = await collectItemDocsFromPacks(packs);
  const pools = buildLootPoolsFromCache(docs, allowMagic);
  if (!pools.mixed.length) return [];

  const result = [];
  const seen = new Set();
  const plan = buildLootCategoryPlan(type, desired);
  const maxAttempts = Math.max(desired * 12, 30);
  let attempts = 0;

  while (result.length < desired && attempts < maxAttempts) {
    const plannedCategory = plan[result.length] || (type === "mixed" ? pickWeightedLootCategory() : type);
    const doc =
      pickLootDocFromPool(pools[plannedCategory], seen, budget, allowMagic, uniqueOnly) ||
      pickLootDocFromPool(pools.gear, seen, budget, allowMagic, uniqueOnly) ||
      pickLootDocFromPool(pools.mixed, seen, budget, allowMagic, uniqueOnly);
    attempts += 1;
    if (!doc) continue;
    const item = toLootItemData(doc, plannedCategory);
    if (!item?.name) continue;
    const key = normalizeShopSearchKey(item.name);
    if (uniqueOnly && (!key || seen.has(key))) continue;
    if (uniqueOnly && key) seen.add(key);
    result.push(item);
  }

  return result;
}

async function buildLootInventoryFromImport({
  importPayload,
  lootType,
  itemCount,
  budget,
  allowMagic,
  uniqueOnly = true
}) {
  const payload = importPayload && typeof importPayload === "object" ? importPayload : null;
  const refs = normalizeShopItemRefs(payload?.items);
  const type = normalizeLootType(payload?.lootType || lootType);
  const desiredFallback = clampRangeValue(payload?.itemCount, 1, 60, clampRangeValue(itemCount, 1, 60, 12));
  if (!refs.length) {
    const items = await buildLootInventory({
      lootType: type,
      itemCount: desiredFallback,
      budget,
      allowMagic,
      uniqueOnly
    });
    return { items, resolved: 0, missing: 0 };
  }

  const packs = uniquePackNames([
    ...getPacks("weapons"),
    ...getPacks("loot"),
    ...getPacks("spells")
  ]);
  let docs = getCachedItemDocsFromPacks(packs);
  if (!docs.length) docs = await collectItemDocsFromPacks(packs);
  const pools = buildLootPoolsFromCache(docs, allowMagic);
  if (!pools.mixed.length) return { items: [], resolved: 0, missing: refs.length };

  const result = [];
  const seen = new Set();
  let resolved = 0;
  let missing = 0;

  for (const ref of refs) {
    const doc = findShopDocByImportRef(pools.mixed, ref, allowMagic);
    if (!doc) {
      missing += 1;
      continue;
    }
    const category = inferLootCategoryFromDoc(doc, type);
    const item = toLootItemData(doc, category);
    if (!item?.name) {
      missing += 1;
      continue;
    }
    applyImportedLootItemOverrides(item, ref);
    const key = normalizeShopSearchKey(item.name);
    if (uniqueOnly && (!key || seen.has(key))) continue;
    if (uniqueOnly && key) seen.add(key);
    result.push(item);
    resolved += 1;
  }

  return { items: result, resolved, missing };
}

async function buildShopInventory({ shopType, itemCount, budget, allowMagic }) {
  const desired = clampRangeValue(itemCount, 1, 60, 12);
  const type = normalizeShopType(shopType);
  const packs = uniquePackNames([
    ...getPacks("weapons"),
    ...getPacks("loot"),
    ...getPacks("spells")
  ]);
  let docs = getCachedItemDocsFromPacks(packs);
  if (!docs.length) {
    docs = await collectItemDocsFromPacks(packs);
  }
  const pools = buildShopPoolsFromCache(docs, allowMagic);
  if (!pools.market.length) return [];
  const result = [];
  const seen = new Set();

  const plan = buildShopCategoryPlan(type, desired);
  const maxAttempts = Math.max(desired * 10, 24);
  let attempts = 0;
  while (result.length < desired && attempts < maxAttempts) {
    const plannedCategory = plan[result.length] || (type === "market" ? pickWeightedShopCategory() : type);
    const doc =
      pickShopDocFromPool(pools[plannedCategory], seen, budget, allowMagic) ||
      pickShopDocFromPool(pools.general, seen, budget, allowMagic) ||
      pickShopDocFromPool(pools.market, seen, budget, allowMagic);
    attempts += 1;
    if (!doc) continue;
    const item = toShopItemData(doc, plannedCategory, budget, allowMagic);
    if (!item?.name) continue;
    const key = String(item.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

async function buildShopInventoryFromImport({ importPayload, shopType, budget, allowMagic }) {
  const payload = importPayload && typeof importPayload === "object" ? importPayload : null;
  const refs = normalizeShopItemRefs(payload?.items);
  if (!refs.length) return { items: [], resolved: 0, missing: 0 };

  const desired = refs.length;
  const type = normalizeShopType(shopType);
  const packs = uniquePackNames([
    ...getPacks("weapons"),
    ...getPacks("loot"),
    ...getPacks("spells")
  ]);
  let docs = getCachedItemDocsFromPacks(packs);
  if (!docs.length) docs = await collectItemDocsFromPacks(packs);
  const pools = buildShopPoolsFromCache(docs, allowMagic);
  if (!pools.market.length) return { items: [], resolved: 0, missing: refs.length };

  const result = [];
  const seen = new Set();
  let resolved = 0;
  let missing = 0;

  for (const ref of refs) {
    if (result.length >= desired) break;
    const doc = findShopDocByImportRef(pools.market, ref, allowMagic);
    if (!doc) {
      missing += 1;
      continue;
    }
    const category = inferShopCategoryFromDoc(doc, type);
    const item = toShopItemData(doc, category, budget, allowMagic);
    if (!item?.name) {
      missing += 1;
      continue;
    }
    applyImportedShopItemOverrides(item, ref);
    const key = normalizeShopSearchKey(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    resolved += 1;
  }

  return { items: result, resolved, missing };
}

function findShopDocByImportRef(docs, ref, allowMagic) {
  const list = Array.isArray(docs) ? docs : [];
  if (!list.length || !ref) return null;

  const seeds = buildShopImportSeeds(ref);
  if (!seeds.length) return null;
  const exactMatches = [];
  let best = null;

  for (const doc of list) {
    if (!isAllowedItemDoc(doc, allowMagic)) continue;
    const score = scoreShopImportDoc(doc, seeds);
    if (score >= 100) exactMatches.push(doc);
    if (!best || score > best.score) best = { doc, score };
  }

  if (exactMatches.length) {
    return pickPreferredLocalizedDoc(exactMatches);
  }
  if (best?.score > 0) return best.doc;
  return null;
}

function buildShopImportSeeds(ref) {
  const values = [
    String(ref?.name || ""),
    String(ref?.lookup || ""),
    String(ref?.canonical || "")
  ]
    .flatMap((value) => value.split(/[|/;,]+/))
    .map((value) => value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return Array.from(new Set(values.map((value) => normalizeShopSearchKey(value)).filter(Boolean)));
}

function scoreShopImportDoc(doc, seeds) {
  const nameKey = normalizeShopSearchKey(doc?.name);
  const idKey = normalizeShopSearchKey(doc?.system?.identifier);
  const aliases = [];
  if (nameKey) aliases.push(nameKey);
  if (idKey && idKey !== nameKey) aliases.push(idKey);
  if (!aliases.length) return 0;

  let best = 0;
  for (const seed of seeds) {
    if (!seed) continue;
    for (const candidate of aliases) {
      if (!candidate) continue;
      if (candidate === seed) best = Math.max(best, 120);
      else if (candidate.startsWith(seed) || seed.startsWith(candidate)) best = Math.max(best, 95);
      else if (candidate.includes(seed) || seed.includes(candidate)) best = Math.max(best, 80);
      else {
        const overlap = tokenOverlapRatio(candidate, seed);
        if (overlap >= 0.8) best = Math.max(best, 72);
        else if (overlap >= 0.6) best = Math.max(best, 60);
        else if (overlap >= 0.4) best = Math.max(best, 42);
      }
    }
  }
  return best;
}

function tokenOverlapRatio(a, b) {
  const aTokens = new Set(String(a || "").split("-").filter(Boolean));
  const bTokens = new Set(String(b || "").split("-").filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let common = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) common += 1;
  }
  const denom = Math.max(aTokens.size, bTokens.size);
  return denom ? common / denom : 0;
}

function normalizeShopSearchKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’`"]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

function pickPreferredLocalizedDoc(candidates) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!list.length) return null;
  const preferred = preferDocsByInterfaceLanguage(list);
  return preferred?.[0] || list[0];
}

function inferShopCategoryFromDoc(doc, fallbackType = "market") {
  if (isArmorShopDoc(doc)) return "armor";
  if (isScrollShopDoc(doc)) return "scrolls";
  if (String(doc?.type || "").toLowerCase() === "weapon") return "weapons";
  if (isAlchemyShopDoc(doc)) return "alchemy";
  if (isFoodShopDoc(doc)) return "food";
  if (isGeneralShopDoc(doc)) return "general";
  const type = normalizeShopType(fallbackType);
  return type === "market" ? "general" : type;
}

function applyImportedShopItemOverrides(item, ref) {
  if (!item || !ref) return;
  const qty = clampRangeValue(ref.quantity, 1, 9999, null);
  if (Number.isFinite(qty) && qty > 0) {
    item.system = item.system && typeof item.system === "object" ? item.system : {};
    item.system.quantity = qty;
  }

  const priceGp = normalizeImportedItemPriceGp(ref);
  if (Number.isFinite(priceGp) && priceGp > 0) {
    item.system = item.system && typeof item.system === "object" ? item.system : {};
    item.system.price = {
      value: Math.max(1, Math.round(priceGp)),
      denomination: "gp"
    };
    item.flags = item.flags && typeof item.flags === "object" ? item.flags : {};
    item.flags[MODULE_ID] = item.flags[MODULE_ID] && typeof item.flags[MODULE_ID] === "object"
      ? item.flags[MODULE_ID]
      : {};
    item.flags[MODULE_ID].shopRolledPriceCp = Math.round(priceGp * 100);
  }
}

function normalizeImportedItemPriceGp(ref) {
  const direct = Number(ref?.priceGp);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const raw = ref?.price;
  if (Number.isFinite(Number(raw)) && Number(raw) > 0) return Number(raw);
  if (!raw || typeof raw !== "object") return null;

  const value = Number(raw.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const denomination = String(raw.denomination || raw.unit || "gp").trim().toLowerCase();
  const toGp = {
    pp: 10,
    gp: 1,
    ep: 0.5,
    sp: 0.1,
    cp: 0.01
  };
  return value * (toGp[denomination] || 1);
}

function buildShopPoolsFromCache(docs, allowMagic) {
  const list = Array.isArray(docs) ? docs.filter(Boolean) : [];
  const withType = list.filter((doc) => {
    const type = String(doc?.type || "").toLowerCase();
    if (!["weapon", "equipment", "loot", "consumable", "tool", "spell"].includes(type)) return false;
    if (!allowMagic && type === "spell") return false;
    return isAllowedItemDoc(doc, allowMagic);
  });
  const out = {
    market: withType,
    general: withType.filter((doc) => isGeneralShopDoc(doc)),
    alchemy: withType.filter((doc) => isAlchemyShopDoc(doc)),
    scrolls: withType.filter((doc) => isScrollShopDoc(doc)),
    weapons: withType.filter((doc) => String(doc?.type || "").toLowerCase() === "weapon"),
    armor: withType.filter((doc) => isArmorShopDoc(doc)),
    food: withType.filter((doc) => isFoodShopDoc(doc))
  };

  if (!out.general.length) {
    out.general = withType.filter((doc) => {
      const type = String(doc?.type || "").toLowerCase();
      return ["equipment", "loot", "tool", "consumable"].includes(type);
    });
  }
  if (!out.alchemy.length) {
    out.alchemy = withType.filter((doc) => String(doc?.type || "").toLowerCase() === "consumable");
  }
  if (!out.scrolls.length) {
    out.scrolls = withType.filter((doc) => {
      const docType = String(doc?.type || "").toLowerCase();
      return docType === "spell" || docType === "consumable";
    });
  }
  if (!out.food.length) {
    out.food = withType.filter((doc) => {
      const docType = String(doc?.type || "").toLowerCase();
      return docType === "consumable" && !isScrollShopDoc(doc);
    });
  }
  if (!out.market.length) out.market = withType;
  return out;
}

function buildLootPoolsFromCache(docs, allowMagic) {
  const list = Array.isArray(docs) ? docs.filter(Boolean) : [];
  const withType = list.filter((doc) => {
    const type = String(doc?.type || "").toLowerCase();
    if (!["weapon", "equipment", "loot", "consumable", "tool", "spell"].includes(type)) return false;
    if (!allowMagic && type === "spell") return false;
    return isAllowedItemDoc(doc, allowMagic);
  });

  const out = {
    mixed: withType,
    gear: withType.filter((doc) => {
      const type = String(doc?.type || "").toLowerCase();
      return ["equipment", "loot", "tool"].includes(type) && !isArmorShopDoc(doc);
    }),
    consumables: withType.filter((doc) => {
      const type = String(doc?.type || "").toLowerCase();
      return type === "consumable" && !isScrollShopDoc(doc);
    }),
    weapons: withType.filter((doc) => String(doc?.type || "").toLowerCase() === "weapon"),
    armor: withType.filter((doc) => isArmorShopDoc(doc)),
    scrolls: withType.filter((doc) => isScrollShopDoc(doc))
  };

  if (!out.gear.length) {
    out.gear = withType.filter((doc) => {
      const type = String(doc?.type || "").toLowerCase();
      return ["equipment", "loot", "tool", "consumable"].includes(type);
    });
  }
  if (!out.consumables.length) {
    out.consumables = withType.filter((doc) => String(doc?.type || "").toLowerCase() === "consumable");
  }
  if (!out.mixed.length) out.mixed = withType;
  return out;
}

function buildShopCategoryPlan(shopType, desired) {
  const type = normalizeShopType(shopType);
  if (type !== "market") return Array.from({ length: desired }, () => type);
  const categories = [];
  for (let i = 0; i < desired; i++) categories.push(pickWeightedShopCategory());
  return categories;
}

function buildLootCategoryPlan(lootType, desired) {
  const type = normalizeLootType(lootType);
  if (type === "coins") return [];
  if (type !== "mixed") return Array.from({ length: desired }, () => type);
  const categories = [];
  for (let i = 0; i < desired; i++) categories.push(pickWeightedLootCategory());
  return categories;
}

function pickWeightedShopCategory() {
  const total = SHOP_TYPE_WEIGHTS.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
  if (!total) return "general";
  let roll = Math.random() * total;
  for (const entry of SHOP_TYPE_WEIGHTS) {
    roll -= Number(entry.weight || 0);
    if (roll <= 0) return entry.type;
  }
  return SHOP_TYPE_WEIGHTS[SHOP_TYPE_WEIGHTS.length - 1]?.type || "general";
}

function pickWeightedLootCategory() {
  const total = LOOT_TYPE_WEIGHTS.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
  if (!total) return "gear";
  let roll = Math.random() * total;
  for (const entry of LOOT_TYPE_WEIGHTS) {
    roll -= Number(entry.weight || 0);
    if (roll <= 0) return entry.type;
  }
  return LOOT_TYPE_WEIGHTS[LOOT_TYPE_WEIGHTS.length - 1]?.type || "gear";
}

function pickShopDocFromPool(pool, seen, budget, allowMagic) {
  const source = Array.isArray(pool) ? pool : [];
  if (!source.length) return null;
  const unseen = source.filter((doc) => {
    const key = String(doc?.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    return isAllowedItemDoc(doc, allowMagic);
  });
  if (!unseen.length) return null;

  const preferred = preferDocsByInterfaceLanguage(unseen);
  const priced = preferred.filter((doc) => {
    const cp = getItemPriceValue(doc);
    return Number.isFinite(cp) && cp > 0;
  });
  const withinBudget = priced.filter((doc) => isWithinBudget(doc, budget, allowMagic));
  if (withinBudget.length) return pickRandom(withinBudget);

  if (priced.length) {
    const range = getBudgetRange(budget, allowMagic);
    const target = Math.round((Number(range?.min || 0) + Number(range?.max || 0)) / 2);
    let best = null;
    for (const doc of priced) {
      const cp = Number(getItemPriceValue(doc) || 0);
      const distance = Math.abs(cp - target);
      if (!best || distance < best.distance) {
        best = { doc, distance };
      }
    }
    if (best?.doc) return best.doc;
  }

  return pickRandom(preferred);
}

function pickLootDocFromPool(pool, seen, budget, allowMagic, uniqueOnly = true) {
  const source = Array.isArray(pool) ? pool : [];
  if (!source.length) return null;
  const candidates = source.filter((doc) => {
    const key = normalizeShopSearchKey(doc?.name);
    if (uniqueOnly && key && seen.has(key)) return false;
    return isAllowedItemDoc(doc, allowMagic);
  });
  if (!candidates.length) return null;

  const preferred = preferDocsByInterfaceLanguage(candidates);
  const priced = preferred.filter((doc) => {
    const cp = getItemPriceValue(doc);
    return Number.isFinite(cp) && cp > 0;
  });
  const withinBudget = priced.filter((doc) => isWithinBudget(doc, budget, allowMagic));
  if (withinBudget.length) return pickRandom(withinBudget);

  if (priced.length) {
    const range = getBudgetRange(budget, allowMagic);
    const target = Math.round((Number(range?.min || 0) + Number(range?.max || 0)) / 2);
    let best = null;
    for (const doc of priced) {
      const cp = Number(getItemPriceValue(doc) || 0);
      const distance = Math.abs(cp - target);
      if (!best || distance < best.distance) best = { doc, distance };
    }
    if (best?.doc) return best.doc;
  }

  return pickRandom(preferred);
}

function toShopItemData(doc, category, budget = "normal", allowMagic = false) {
  const item = cloneItemData(toItemData(doc));
  if (!item || typeof item !== "object") return null;
  item.system = item.system && typeof item.system === "object" ? item.system : {};
  item.flags = item.flags && typeof item.flags === "object" ? item.flags : {};
  item.flags[MODULE_ID] = item.flags[MODULE_ID] && typeof item.flags[MODULE_ID] === "object"
    ? item.flags[MODULE_ID]
    : {};

  const sourceUuid = getSourceUuidForShopDoc(doc);
  if (sourceUuid) {
    item.flags[MODULE_ID].shopSourceUuid = sourceUuid;
    item.flags.core = item.flags.core && typeof item.flags.core === "object" ? item.flags.core : {};
    if (!item.flags.core.sourceId) item.flags.core.sourceId = sourceUuid;
    item.flags.dnd5e = item.flags.dnd5e && typeof item.flags.dnd5e === "object" ? item.flags.dnd5e : {};
    if (!item.flags.dnd5e.sourceId) item.flags.dnd5e.sourceId = sourceUuid;
  }

  applyShopPriceVariance(item, doc, budget, allowMagic);
  if (item.system.equipped !== undefined) item.system.equipped = false;
  if (item.system.proficient !== undefined) item.system.proficient = false;
  const quantity = getShopItemQuantity(item, category);
  if (Number.isFinite(quantity) && quantity > 0) item.system.quantity = quantity;
  return item;
}

function toLootItemData(doc, category) {
  const item = cloneItemData(toItemData(doc));
  if (!item || typeof item !== "object") return null;
  item.system = item.system && typeof item.system === "object" ? item.system : {};
  item.flags = item.flags && typeof item.flags === "object" ? item.flags : {};
  item.flags[MODULE_ID] = item.flags[MODULE_ID] && typeof item.flags[MODULE_ID] === "object"
    ? item.flags[MODULE_ID]
    : {};

  const sourceUuid = getSourceUuidForShopDoc(doc);
  if (sourceUuid) {
    item.flags[MODULE_ID].lootSourceUuid = sourceUuid;
    item.flags.core = item.flags.core && typeof item.flags.core === "object" ? item.flags.core : {};
    if (!item.flags.core.sourceId) item.flags.core.sourceId = sourceUuid;
    item.flags.dnd5e = item.flags.dnd5e && typeof item.flags.dnd5e === "object" ? item.flags.dnd5e : {};
    if (!item.flags.dnd5e.sourceId) item.flags.dnd5e.sourceId = sourceUuid;
  }

  if (item.system.equipped !== undefined) item.system.equipped = false;
  if (item.system.proficient !== undefined) item.system.proficient = false;
  const normalizedCategory = category === "gear" ? "general" : category;
  const quantity = getShopItemQuantity(item, normalizedCategory);
  if (Number.isFinite(quantity) && quantity > 0) item.system.quantity = quantity;
  return item;
}

function inferLootCategoryFromDoc(doc, fallbackType = "mixed") {
  if (isArmorShopDoc(doc)) return "armor";
  if (isScrollShopDoc(doc)) return "scrolls";
  if (String(doc?.type || "").toLowerCase() === "weapon") return "weapons";
  if (isAlchemyShopDoc(doc) || String(doc?.type || "").toLowerCase() === "consumable") return "consumables";
  const type = normalizeLootType(fallbackType);
  return type === "mixed" ? "gear" : type;
}

function applyImportedLootItemOverrides(item, ref) {
  if (!item || !ref) return;
  const qty = clampRangeValue(ref.quantity, 1, 9999, null);
  if (Number.isFinite(qty) && qty > 0) {
    item.system = item.system && typeof item.system === "object" ? item.system : {};
    item.system.quantity = qty;
  }

  const priceGp = normalizeImportedItemPriceGp(ref);
  if (Number.isFinite(priceGp) && priceGp > 0) {
    item.system = item.system && typeof item.system === "object" ? item.system : {};
    item.system.price = {
      value: Math.max(1, Math.round(priceGp)),
      denomination: "gp"
    };
  }
}

function buildLootCoins({ tier, budget, includeCoins = true }) {
  const out = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  if (!includeCoins) return out;

  const resolvedTier = clampRangeValue(tier, 1, 4, 1);
  const resolvedBudget = normalizeBudgetOption(budget);
  const scale = {
    poor: 0.7,
    normal: 1,
    well: 1.55,
    elite: 2.35
  }[resolvedBudget] || 1;

  const lootData = DATA_CACHE.loot;
  const coinRange = lootData?.coins?.[String(resolvedTier)] || { gp: [0, 10], sp: [0, 25] };
  const gpMin = Number(coinRange?.gp?.[0] || 0);
  const gpMax = Number(coinRange?.gp?.[1] || 10);
  const spMin = Number(coinRange?.sp?.[0] || 0);
  const spMax = Number(coinRange?.sp?.[1] || 25);

  out.gp = Math.max(0, Math.round(randInt(gpMin, gpMax) * scale));
  out.sp = Math.max(0, Math.round(randInt(spMin, spMax) * scale));
  out.cp = Math.max(0, Math.round(randInt(0, 10 + resolvedTier * 5) * scale));
  out.ep = resolvedTier >= 2 ? Math.max(0, Math.round(randInt(0, resolvedTier * 4) * scale)) : 0;
  out.pp = resolvedTier >= 3
    ? Math.max(0, Math.round(randInt(0, resolvedTier * 2) * Math.max(1, scale - 0.2)))
    : 0;
  return out;
}

async function createLootContainerActor({ lootName, lootType, budget, tier, folderId, stockItems, coins }) {
  const normalizedCoins = normalizeImportedLootCurrency(coins) || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  const stock = (stockItems || []).map((item) => cloneItemData(item)).filter(Boolean);
  const coinSummary = ["pp", "gp", "ep", "sp", "cp"]
    .map((key) => `${Number(normalizedCoins[key] || 0)} ${key}`)
    .join(", ");
  const biography = [
    `<p><strong>${escapeHtml(i18nText("ui.loot.labelType"))}</strong> ${escapeHtml(getLootTypeLabel(lootType))}</p>`,
    `<p><strong>${escapeHtml(i18nText("ui.loot.labelBudget"))}</strong> ${escapeHtml(i18nText(`ui.dialog.budget${capitalizeBudgetKey(budget)}`))}</p>`,
    `<p><strong>${escapeHtml(i18nText("ui.loot.labelTier"))}</strong> T${clampRangeValue(tier, 1, 4, 1)}</p>`,
    `<p><strong>${escapeHtml(i18nText("ui.loot.labelCoins"))}</strong> ${escapeHtml(coinSummary)}</p>`
  ].join("");

  const actorData = {
    name: lootName,
    type: "npc",
    folder: folderId || null,
    img: LOOT_CONTAINER_ICON_PATH,
    prototypeToken: {
      img: LOOT_CONTAINER_ICON_PATH,
      texture: { src: LOOT_CONTAINER_ICON_PATH }
    },
    items: stock,
    flags: {
      [MODULE_ID]: {
        lootContainer: true,
        lootType: normalizeLootType(lootType),
        lootBudget: normalizeBudgetOption(budget),
        lootTier: clampRangeValue(tier, 1, 4, 1)
      }
    },
    system: {
      currency: normalizedCoins,
      details: {
        biography: { value: biography }
      }
    }
  };

  try {
    return await Actor.create(actorData);
  } catch (err) {
    console.warn("NPC Button: Failed to create loot container actor.", err);
    return null;
  }
}

function getShopItemQuantity(item, category) {
  const type = String(item?.type || "").toLowerCase();
  const subtype = getItemSubtype(item);
  if (type === "weapon" || category === "armor" || isArmorShopDoc(item)) return 1;
  if (isScrollShopDoc(item)) return randInt(1, 3);
  if (isFoodShopDoc(item)) return randInt(3, 10);
  if (isAlchemyShopDoc(item)) return randInt(1, 4);
  if (type === "consumable" && subtype === "ammo") return randInt(5, 20);
  if (type === "consumable") return randInt(1, 6);
  return randInt(1, 5);
}

function getSourceUuidForShopDoc(doc) {
  const direct = String(
    doc?.flags?.[MODULE_ID]?.shopSourceUuid ||
    doc?.__shopSourceUuid ||
    doc?.uuid ||
    doc?.flags?.core?.sourceId ||
    doc?.flags?.dnd5e?.sourceId ||
    ""
  ).trim();
  if (direct) return direct;
  const packName = String(doc?.pack || doc?.collection || "").trim();
  const docId = String(doc?._id || doc?.id || "").trim();
  if (!packName || !docId) return "";
  return `Compendium.${packName}.Item.${docId}`;
}

function applyShopPriceVariance(item, sourceDoc, budget = "normal", allowMagic = false) {
  const baseCp = resolveShopBasePriceCp(sourceDoc, item, budget, allowMagic);
  if (!Number.isFinite(baseCp) || baseCp <= 0) return;
  const multiplier = 0.7 + Math.random() * 0.6;
  const rolledCp = Math.max(1, Math.round(baseCp * multiplier));
  setItemPriceFromCp(item, rolledCp);

  item.flags = item.flags && typeof item.flags === "object" ? item.flags : {};
  item.flags[MODULE_ID] = item.flags[MODULE_ID] && typeof item.flags[MODULE_ID] === "object"
    ? item.flags[MODULE_ID]
    : {};
  item.flags[MODULE_ID].shopBasePriceCp = Math.round(baseCp);
  item.flags[MODULE_ID].shopRolledPriceCp = rolledCp;
}

function resolveShopBasePriceCp(sourceDoc, item, budget = "normal", allowMagic = false) {
  const direct = getItemPriceValue(sourceDoc) ?? getItemPriceValue(item);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);

  const range = getBudgetRange(budget, allowMagic);
  const min = Math.max(1, Number(range?.min || 1));
  const max = Math.max(min, Number(range?.max || min));
  const spread = Math.max(1, max - min);
  const low = min + Math.floor(spread * 0.15);
  const high = min + Math.floor(spread * 0.55);
  return randInt(Math.max(1, low), Math.max(low, high));
}

function setItemPriceFromCp(item, cpValue) {
  const cp = Math.max(0, Math.round(Number(cpValue) || 0));
  // Store all shop prices in gold pieces to keep pricing consistent.
  const valueGp = Math.max(1, Math.round(cp / 100));
  item.system = item.system && typeof item.system === "object" ? item.system : {};
  item.system.price = {
    value: valueGp,
    denomination: "gp"
  };
}

async function createShopkeeperActor({ shopName, budget, tier, folderId, stockItems, replaceGeneratedItems = false }) {
  if (!DATA_CACHE.archetypes?.length) return null;
  const merchant =
    DATA_CACHE.archetypes.find((entry) => String(entry?.id || "").toLowerCase() === "merchant") ||
    DATA_CACHE.archetypes.find((entry) => Array.isArray(entry?.tags) && entry.tags.includes("social")) ||
    DATA_CACHE.archetypes[0];
  if (!merchant) return null;

  const cultures = Object.keys(DATA_CACHE.names?.cultures || {});
  const culture = cultures.length ? pickRandom(cultures) : "common";
  const generated = generateNpc({
    tier: clampRangeValue(tier, 1, 4, 1),
    archetype: merchant,
    culture,
    gender: "random",
    race: "Humanoid",
    budget,
    includeLoot: false,
    includeSecret: false,
    includeHook: false,
    importantNpc: false,
    usedNames: new Set()
  });

  generated.name = i18nFormat("ui.shop.shopkeeperNameByShop", { shop: shopName });
  generated.loot = { coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, items: [] };
  generated.includeLoot = false;
  generated.secret = null;
  generated.hook = null;
  generated.motivation = i18nFormat("ui.shop.shopkeeperMotivation", { shop: shopName });
  generated.speech = i18nText("ui.shop.shopkeeperSpeech");

  const actorData = await buildActorData(generated, folderId || null);
  actorData.name = i18nFormat("ui.shop.shopkeeperActorName", { shop: shopName });
  actorData.img = SHOPKEEPER_ICON_PATH;
  actorData.prototypeToken = actorData.prototypeToken && typeof actorData.prototypeToken === "object"
    ? actorData.prototypeToken
    : {};
  actorData.prototypeToken.img = SHOPKEEPER_ICON_PATH;
  actorData.prototypeToken.texture = actorData.prototypeToken.texture && typeof actorData.prototypeToken.texture === "object"
    ? actorData.prototypeToken.texture
    : {};
  actorData.prototypeToken.texture.src = SHOPKEEPER_ICON_PATH;
  const stock = (stockItems || []).map((item) => cloneItemData(item)).filter(Boolean);
  actorData.items = replaceGeneratedItems
    ? stock
    : [...(Array.isArray(actorData.items) ? actorData.items : []), ...stock];
  actorData.system = actorData.system || {};
  actorData.system.details = actorData.system.details || {};
  actorData.system.details.biography = actorData.system.details.biography || {};
  const oldBio = String(actorData.system.details.biography.value || "");
  const stockCount = Array.isArray(stockItems) ? stockItems.length : 0;
  const shopNote = `<p><strong>${escapeHtml(i18nText("ui.shop.shopkeeperStockLabel"))}</strong> ${escapeHtml(i18nFormat("ui.shop.shopkeeperStockValue", { count: stockCount }))}</p>`;
  actorData.system.details.biography.value = `${oldBio}${shopNote}`;

  try {
    return await Actor.create(actorData);
  } catch (err) {
    console.warn("NPC Button: Failed to create shopkeeper actor.", err);
    return null;
  }
}

function preferDocsByInterfaceLanguage(docs) {
  const list = Array.isArray(docs) ? docs : [];
  const preferredScript = detectPreferredScriptByLanguage();
  if (!preferredScript) return list;
  const preferred = list.filter((doc) => detectTextScript(doc?.name) === preferredScript);
  if (preferred.length) return preferred;
  if (preferredScript !== "latin") {
    const latin = list.filter((doc) => detectTextScript(doc?.name) === "latin");
    if (latin.length) return latin;
  }
  return list;
}

function getCachedItemDocsFromPacks(packs) {
  const result = [];
  const seen = new Set();
  for (const packName of packs || []) {
    const packData = DATA_CACHE.compendiumCache?.packs?.[packName];
    const docs = Object.entries(packData?.documents || {});
    for (const [docId, doc] of docs) {
      if (!doc || typeof doc !== "object") continue;
      const sourceUuid = `Compendium.${packName}.Item.${docId}`;
      const key = `${packName}.${docId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        ...doc,
        __shopSourceUuid: sourceUuid
      });
    }
  }
  return result;
}

async function collectItemDocsFromPacks(packs) {
  const result = [];
  const seen = new Set();
  for (const packName of packs || []) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    try {
      const docs = await pack.getDocuments();
      for (const doc of docs || []) {
        const data = doc?.toObject ? doc.toObject() : doc;
        const docId = String(doc?.id || data?._id || data?.id || "");
        const sourceUuid = String(
          doc?.uuid ||
          data?.uuid ||
          data?.flags?.core?.sourceId ||
          data?.flags?.dnd5e?.sourceId ||
          `Compendium.${pack.collection}.Item.${docId}`
        );
        const key = String(sourceUuid || `${pack.collection}.${docId}`);
        if (!data || !key || seen.has(key)) continue;
        seen.add(key);
        result.push({
          ...data,
          __shopSourceUuid: sourceUuid
        });
      }
    } catch (err) {
      console.warn(`NPC Button: Failed to load item docs from pack "${packName}".`, err);
    }
  }
  return result;
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
  if (lang.startsWith("ru") || lang.startsWith("uk") || lang.startsWith("be")) return "cyrillic";
  if (lang.startsWith("en")) return "latin";
  return null;
}

function getItemSubtype(entry) {
  return String(
    entry?.system?.type?.value ||
    entry?.system?.consumableType?.value ||
    entry?.system?.consumableType ||
    ""
  )
    .trim()
    .toLowerCase();
}

function isGeneralShopDoc(doc) {
  const type = String(doc?.type || "").toLowerCase();
  if (type === "weapon" || type === "spell") return false;
  if (!["equipment", "loot", "tool", "consumable"].includes(type)) return false;
  if (isFoodShopDoc(doc) || isArmorShopDoc(doc) || isScrollShopDoc(doc) || isAlchemyShopDoc(doc)) return false;
  return true;
}

function isArmorShopDoc(doc) {
  const type = String(doc?.type || "").toLowerCase();
  if (type !== "equipment") return false;
  const armorType = String(doc?.system?.armor?.type || "").toLowerCase();
  if (armorType && armorType !== "none" && armorType !== "clothing" && armorType !== "trinket") return true;
  const subtype = getItemSubtype(doc);
  return ["light", "medium", "heavy", "shield", "natural"].includes(subtype);
}

function isAlchemyShopDoc(doc) {
  const type = String(doc?.type || "").toLowerCase();
  if (type !== "consumable") return false;
  const subtype = getItemSubtype(doc);
  return subtype === "potion" || subtype === "poison";
}

function isFoodShopDoc(doc) {
  const type = String(doc?.type || "").toLowerCase();
  if (type !== "consumable") return false;
  const subtype = getItemSubtype(doc);
  return subtype === "food";
}

function isScrollShopDoc(doc) {
  const type = String(doc?.type || "").toLowerCase();
  if (type === "spell") return true;
  if (type !== "consumable") return false;
  const subtype = getItemSubtype(doc);
  return subtype === "scroll";
}

function getShopTypeLabel(shopType) {
  const type = normalizeShopType(shopType);
  const keyMap = {
    market: "ui.dialog.shopTypeMarket",
    general: "ui.dialog.shopTypeGeneral",
    alchemy: "ui.dialog.shopTypeAlchemy",
    scrolls: "ui.dialog.shopTypeScrolls",
    weapons: "ui.dialog.shopTypeWeapons",
    armor: "ui.dialog.shopTypeArmor",
    food: "ui.dialog.shopTypeFood"
  };
  return i18nText(keyMap[type] || keyMap.market);
}

function getLootTypeLabel(lootType) {
  const type = normalizeLootType(lootType);
  const keyMap = {
    mixed: "ui.dialog.lootTypeMixed",
    coins: "ui.dialog.lootTypeCoins",
    gear: "ui.dialog.lootTypeGear",
    consumables: "ui.dialog.lootTypeConsumables",
    weapons: "ui.dialog.lootTypeWeapons",
    armor: "ui.dialog.lootTypeArmor",
    scrolls: "ui.dialog.lootTypeScrolls"
  };
  return i18nText(keyMap[type] || keyMap.mixed);
}

function normalizeShopType(value) {
  const type = String(value || "").trim().toLowerCase();
  return SHOP_TYPES.has(type) ? type : "market";
}

function normalizeLootType(value) {
  const type = String(value || "").trim().toLowerCase();
  return LOOT_TYPES.has(type) ? type : "mixed";
}

function normalizeBudgetOption(value) {
  const budget = String(value || "").trim().toLowerCase();
  return BUDGET_OPTIONS.has(budget) ? budget : "normal";
}

function capitalizeBudgetKey(budget) {
  const value = normalizeBudgetOption(budget);
  if (value === "well") return "WellOff";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clampRangeValue(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function uniquePackNames(packs) {
  return Array.from(new Set((packs || []).filter(Boolean)));
}

function collectShopPromptContext(form) {
  const shopType = normalizeShopType(form.find("select[name='shopType']").val());
  const shopBudget = normalizeBudgetOption(form.find("select[name='shopBudget']").val());
  const itemCount = clampRangeValue(form.find("input[name='shopCount']").val(), 1, 60, 12);
  const shopName = String(form.find("input[name='shopName']").val() || "").trim();
  const shopkeeperTier = clampRangeValue(form.find("select[name='shopkeeperTier']").val(), 1, 4, 1);
  const allowMagic = !!form.find("input[name='shopAllowMagic']").prop("checked");
  const langCode = String(game?.i18n?.lang || "en").trim() || "en";
  const langName = langCode.startsWith("ru") ? "Russian" : langCode.startsWith("en") ? "English" : langCode;
  return {
    shopType,
    shopTypeLabel: getShopTypeLabel(shopType),
    shopBudget,
    itemCount,
    shopName,
    shopkeeperTier,
    allowMagic,
    language: { code: langCode, name: langName }
  };
}

function buildManualShopPrompt(context = {}) {
  const itemCount = clampRangeValue(context.itemCount, 1, 60, 12);
  const tier = clampRangeValue(context.shopkeeperTier, 1, 4, 1);
  const type = normalizeShopType(context.shopType);
  const budget = normalizeBudgetOption(context.shopBudget);
  const allowMagic = !!context.allowMagic;
  const language = context.language?.name || "English";
  const languageCode = context.language?.code || "en";
  const typeLabel = String(context.shopTypeLabel || getShopTypeLabel(type)).trim();
  const shopName = String(context.shopName || "").trim();

  return [
    "Output exactly one ```json code block``` and nothing else.",
    "Inside the block, output one valid JSON object parseable by JSON.parse.",
    "Use this exact schema:",
    "{",
    "  \"shopName\": \"...\",",
    `  \"shopType\": \"${type}\",`,
    `  \"shopBudget\": \"${budget}\",`,
    "  \"shopkeeperTier\": 1,",
    "  \"shopAllowMagic\": true,",
    "  \"itemCount\": 12,",
    "  \"items\": [",
    "    {",
    "      \"name\": \"localized item name\",",
    "      \"lookup\": \"English canonical item name\",",
    "      \"quantity\": 1",
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- \"shopType\" must be one of: market, general, alchemy, scrolls, weapons, armor, food.",
    "- \"shopBudget\" must be one of: poor, normal, well, elite.",
    "- \"items\" must be an array of objects.",
    "- \"lookup\" is mandatory and should be English canonical D&D item name.",
    "- Write \"name\" in interface language when possible.",
    "- No null values, no comments, no trailing commas.",
    "",
    "Shop context:",
    `- Type: ${type} (${typeLabel})`,
    `- Budget: ${budget}`,
    `- Target item count: ${itemCount}`,
    `- Shopkeeper tier: ${tier}`,
    `- Allow magic: ${allowMagic ? "yes" : "no"}`,
    `- Preferred shop name: ${shopName || "Any"}`,
    `- Interface language: ${language} (${languageCode})`
  ].join("\n");
}

function collectLootPromptContext(form) {
  const lootType = normalizeLootType(form.find("select[name='lootType']").val());
  const lootBudget = normalizeBudgetOption(form.find("select[name='lootBudget']").val());
  const itemCount = clampRangeValue(form.find("input[name='lootCount']").val(), 1, 60, 12);
  const tierInput = String(form.find("select[name='lootTier']").val() || "auto");
  const tier = tierInput === "auto" ? getAutoTier() : clampRangeValue(tierInput, 1, 4, 1);
  const allowMagic = !!form.find("input[name='lootAllowMagic']").prop("checked");
  const includeCoins = !!form.find("input[name='lootIncludeCoins']").prop("checked");
  const uniqOnly = !!form.find("input[name='lootUniqOnly']").prop("checked");
  const langCode = String(game?.i18n?.lang || "en").trim() || "en";
  const langName = langCode.startsWith("ru") ? "Russian" : langCode.startsWith("en") ? "English" : langCode;
  return {
    lootType,
    lootTypeLabel: getLootTypeLabel(lootType),
    lootBudget,
    itemCount,
    tier,
    allowMagic,
    includeCoins,
    uniqOnly,
    language: { code: langCode, name: langName }
  };
}

function buildManualLootPrompt(context = {}) {
  const itemCount = clampRangeValue(context.itemCount, 1, 60, 12);
  const type = normalizeLootType(context.lootType);
  const budget = normalizeBudgetOption(context.lootBudget);
  const tier = clampRangeValue(context.tier, 1, 4, 1);
  const allowMagic = !!context.allowMagic;
  const includeCoins = !!context.includeCoins;
  const uniqOnly = !!context.uniqOnly;
  const language = context.language?.name || "English";
  const languageCode = context.language?.code || "en";
  const typeLabel = String(context.lootTypeLabel || getLootTypeLabel(type)).trim();

  return [
    "Output exactly one ```json code block``` and nothing else.",
    "Inside the block, output one valid JSON object parseable by JSON.parse.",
    "Use this exact schema:",
    "{",
    `  \"lootType\": \"${type}\",`,
    `  \"lootBudget\": \"${budget}\",`,
    `  \"lootTier\": ${tier},`,
    `  \"lootAllowMagic\": ${allowMagic ? "true" : "false"},`,
    `  \"lootIncludeCoins\": ${includeCoins ? "true" : "false"},`,
    `  \"lootUniqOnly\": ${uniqOnly ? "true" : "false"},`,
    "  \"itemCount\": 12,",
    "  \"coins\": { \"pp\": 0, \"gp\": 0, \"ep\": 0, \"sp\": 0, \"cp\": 0 },",
    "  \"items\": [",
    "    {",
    "      \"name\": \"localized item name\",",
    "      \"lookup\": \"English canonical item name\",",
    "      \"quantity\": 1",
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- \"lootType\" must be one of: mixed, coins, gear, consumables, weapons, armor, scrolls.",
    "- \"lootBudget\" must be one of: poor, normal, well, elite.",
    "- \"lootTier\" must be an integer from 1 to 4.",
    "- \"items\" must be an array of objects.",
    "- \"lookup\" should be English canonical D&D item name when possible.",
    "- Write \"name\" in interface language when possible.",
    "- No null values, no comments, no trailing commas.",
    "",
    "Loot context:",
    `- Type: ${type} (${typeLabel})`,
    `- Budget: ${budget}`,
    `- Tier: T${tier}`,
    `- Target item count: ${itemCount}`,
    `- Allow magic: ${allowMagic ? "yes" : "no"}`,
    `- Include coins: ${includeCoins ? "yes" : "no"}`,
    `- Unique items only: ${uniqOnly ? "yes" : "no"}`,
    `- Interface language: ${language} (${languageCode})`
  ].join("\n");
}

function openImportShopJsonDialog({ onImport }) {
  new Dialog({
    title: i18nText("ui.dialog.shopImportTitle"),
    content: `
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        <p style="margin:0;font-size:0.85rem;opacity:0.85;">
          ${i18nHtml("ui.dialog.shopImportDescription")}
        </p>
        <textarea name="shopJson" style="width:100%;min-height:18rem;" placeholder='${i18nHtml("ui.dialog.shopImportPlaceholder")}'></textarea>
      </div>
    `,
    buttons: {
      import: {
        label: i18nText("ui.dialog.shopImportJson"),
        callback: async (html) => {
          const rawJson = String(html.find("textarea[name='shopJson']").val() || "").trim();
          if (!rawJson) {
            ui.notifications?.warn(i18nText("ui.shop.warnPasteJsonFirst"));
            return;
          }
          try {
            const parsed = parseLooseJsonObject(rawJson);
            const payload = normalizeImportedShopPayload(parsed);
            if (!payload) {
              throw new Error(i18nText("ui.shop.errorImportInvalidShape"));
            }
            if (typeof onImport === "function") await onImport(payload);
            ui.notifications?.info(
              i18nFormat("ui.shop.infoImportApplied", { count: Number(payload.items?.length || 0) })
            );
          } catch (err) {
            console.error("NPC Button: Failed to import shop JSON.", err);
            const reason = String(err?.message || "").trim();
            ui.notifications?.error(
              reason
                ? i18nFormat("ui.shop.errorImportFailedWithReason", { reason })
                : i18nText("ui.shop.errorImportFailed")
            );
          }
        }
      },
      cancel: { label: i18nText("common.cancel") }
    },
    default: "import"
  }).render(true);
}

function openImportLootJsonDialog({ onImport }) {
  new Dialog({
    title: i18nText("ui.dialog.lootImportTitle"),
    content: `
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        <p style="margin:0;font-size:0.85rem;opacity:0.85;">
          ${i18nHtml("ui.dialog.lootImportDescription")}
        </p>
        <textarea name="lootJson" style="width:100%;min-height:18rem;" placeholder='${i18nHtml("ui.dialog.lootImportPlaceholder")}'></textarea>
      </div>
    `,
    buttons: {
      import: {
        label: i18nText("ui.dialog.lootImportJson"),
        callback: async (html) => {
          const rawJson = String(html.find("textarea[name='lootJson']").val() || "").trim();
          if (!rawJson) {
            ui.notifications?.warn(i18nText("ui.loot.warnPasteJsonFirst"));
            return;
          }
          try {
            const parsed = parseLooseJsonObject(rawJson);
            const payload = normalizeImportedLootPayload(parsed);
            if (!payload) throw new Error(i18nText("ui.loot.errorImportInvalidShape"));
            if (typeof onImport === "function") await onImport(payload);
            ui.notifications?.info(
              i18nFormat("ui.loot.infoImportApplied", { count: Number(payload.items?.length || 0) })
            );
          } catch (err) {
            console.error("NPC Button: Failed to import loot JSON.", err);
            const reason = String(err?.message || "").trim();
            ui.notifications?.error(
              reason
                ? i18nFormat("ui.loot.errorImportFailedWithReason", { reason })
                : i18nText("ui.loot.errorImportFailed")
            );
          }
        }
      },
      cancel: { label: i18nText("common.cancel") }
    },
    default: "import"
  }).render(true);
}

function applyImportedShopPayloadToForm(form, payload) {
  if (!form?.length || !payload || typeof payload !== "object") return;
  const type = normalizeShopType(payload.shopType);
  const budget = normalizeBudgetOption(payload.shopBudget);
  const count = clampRangeValue(payload.itemCount, 1, 60, 12);
  const tier = clampRangeValue(payload.shopkeeperTier, 1, 4, 1);

  form.find("select[name='shopType']").val(type);
  form.find("select[name='shopBudget']").val(budget);
  form.find("input[name='shopCount']").val(count);
  form.find("select[name='shopkeeperTier']").val(String(tier));
  form.find("input[name='shopAllowMagic']").prop("checked", !!payload.shopAllowMagic);

  const folderId = String(payload.shopFolder || "").trim();
  if (folderId) {
    const options = form.find("select[name='shopFolder'] option").toArray();
    const hasFolder = options.some((entry) => String(entry.value || "").trim() === folderId);
    if (hasFolder) form.find("select[name='shopFolder']").val(folderId);
  }
}

function applyImportedLootPayloadToForm(form, payload) {
  if (!form?.length || !payload || typeof payload !== "object") return;
  const type = normalizeLootType(payload.lootType);
  const budget = normalizeBudgetOption(payload.lootBudget);
  const count = clampRangeValue(payload.itemCount, 1, 60, 12);
  const tierInput = String(payload.lootTier ?? "auto");
  const tier = tierInput === "auto" ? "auto" : String(clampRangeValue(tierInput, 1, 4, 1));

  form.find("select[name='lootType']").val(type);
  form.find("select[name='lootBudget']").val(budget);
  form.find("input[name='lootCount']").val(count);
  form.find("select[name='lootTier']").val(tier);
  form.find("input[name='lootAllowMagic']").prop("checked", !!payload.lootAllowMagic);
  form.find("input[name='lootIncludeCoins']").prop("checked", !!payload.lootIncludeCoins);
  form.find("input[name='lootUniqOnly']").prop("checked", !!payload.lootUniqOnly);
}

function parseShopImportPayload(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return normalizeImportedShopPayload(parsed);
  } catch {
    return null;
  }
}

function parseLootImportPayload(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return normalizeImportedLootPayload(parsed);
  } catch {
    return null;
  }
}

function normalizeImportedShopPayload(parsed) {
  if (parsed === null || parsed === undefined) return null;
  if (Array.isArray(parsed)) {
    return {
      shopName: "",
      shopType: "market",
      shopBudget: "normal",
      shopkeeperTier: 1,
      shopAllowMagic: true,
      itemCount: Math.max(1, Math.min(60, parsed.length || 1)),
      shopFolder: "",
      items: normalizeShopItemRefs(parsed)
    };
  }
  if (typeof parsed !== "object") return null;

  const shopBlock = parsed.shop && typeof parsed.shop === "object" ? parsed.shop : {};
  const source = { ...parsed, ...shopBlock };
  const itemSource =
    source.items ??
    source.inventory ??
    source.stock ??
    source.goods ??
    source.products ??
    [];
  const items = normalizeShopItemRefs(itemSource);

  const shopType = normalizeShopType(source.shopType || source.type || source.category);
  const shopBudget = normalizeBudgetOption(source.shopBudget || source.budget);
  const shopkeeperTier = clampRangeValue(
    source.shopkeeperTier ?? source.tier ?? source.ownerTier,
    1,
    4,
    1
  );
  const itemCount = clampRangeValue(source.itemCount ?? source.count ?? items.length, 1, 60, Math.max(1, items.length || 12));
  const shopAllowMagic = parseBooleanLoose(source.shopAllowMagic ?? source.allowMagic, true);
  const shopName = String(source.shopName || source.name || "").trim();
  const shopFolder = String(source.shopFolder || source.folderId || "").trim();

  const hasHints =
    items.length > 0 ||
    !!shopName ||
    source.shopType !== undefined ||
    source.type !== undefined ||
    source.category !== undefined ||
    source.shopBudget !== undefined ||
    source.budget !== undefined ||
    source.shopkeeperTier !== undefined ||
    source.tier !== undefined ||
    source.ownerTier !== undefined ||
    source.itemCount !== undefined ||
    source.count !== undefined ||
    source.shopAllowMagic !== undefined ||
    source.allowMagic !== undefined;
  if (!hasHints) return null;

  return {
    shopName,
    shopType,
    shopBudget,
    shopkeeperTier,
    shopAllowMagic,
    itemCount,
    shopFolder,
    items
  };
}

function normalizeImportedLootPayload(parsed) {
  if (parsed === null || parsed === undefined) return null;
  if (Array.isArray(parsed)) {
    return {
      lootType: "mixed",
      lootBudget: "normal",
      lootTier: "auto",
      lootAllowMagic: false,
      lootIncludeCoins: true,
      lootUniqOnly: true,
      itemCount: Math.max(1, Math.min(60, parsed.length || 1)),
      coins: null,
      items: normalizeShopItemRefs(parsed)
    };
  }
  if (typeof parsed !== "object") return null;

  const lootBlock = parsed.loot && typeof parsed.loot === "object" ? parsed.loot : {};
  const source = { ...parsed, ...lootBlock };
  const itemSource =
    source.items ??
    source.inventory ??
    source.lootItems ??
    source.stock ??
    source.goods ??
    source.treasure ??
    [];
  const items = normalizeShopItemRefs(itemSource);

  const lootType = normalizeLootType(source.lootType || source.type || source.category);
  const lootBudget = normalizeBudgetOption(source.lootBudget || source.budget);
  const rawTier = source.lootTier ?? source.tier ?? source.level ?? "auto";
  const lootTier =
    String(rawTier).trim().toLowerCase() === "auto"
      ? "auto"
      : clampRangeValue(rawTier, 1, 4, "auto");
  const itemCount = clampRangeValue(source.itemCount ?? source.count ?? items.length, 1, 60, Math.max(1, items.length || 12));
  const lootAllowMagic = parseBooleanLoose(source.lootAllowMagic ?? source.allowMagic, false);
  const lootIncludeCoins = parseBooleanLoose(source.lootIncludeCoins ?? source.includeCoins, true);
  const lootUniqOnly = parseBooleanLoose(
    source.lootUniqOnly ?? source.uniqueOnly ?? source.uniqOnly,
    true
  );
  const coins = normalizeImportedLootCurrency(source.coins || source.currency);

  const hasHints =
    items.length > 0 ||
    source.lootType !== undefined ||
    source.type !== undefined ||
    source.category !== undefined ||
    source.lootBudget !== undefined ||
    source.budget !== undefined ||
    source.lootTier !== undefined ||
    source.tier !== undefined ||
    source.level !== undefined ||
    source.itemCount !== undefined ||
    source.count !== undefined ||
    source.lootAllowMagic !== undefined ||
    source.allowMagic !== undefined ||
    source.lootIncludeCoins !== undefined ||
    source.includeCoins !== undefined ||
    source.lootUniqOnly !== undefined ||
    source.uniqueOnly !== undefined ||
    source.uniqOnly !== undefined ||
    source.coins !== undefined ||
    source.currency !== undefined;
  if (!hasHints) return null;

  return {
    lootType,
    lootBudget,
    lootTier,
    lootAllowMagic,
    lootIncludeCoins,
    lootUniqOnly,
    itemCount,
    coins,
    items
  };
}

function normalizeImportedLootCurrency(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  let hasAny = false;
  for (const key of Object.keys(out)) {
    const numeric = Number(value[key]);
    if (!Number.isFinite(numeric)) continue;
    out[key] = Math.max(0, Math.round(numeric));
    hasAny = true;
  }
  return hasAny ? out : null;
}

function normalizeShopItemRefs(value, maxItems = 60, maxLength = 140) {
  const input = value;
  const list = [];
  if (Array.isArray(input)) {
    list.push(...input);
  } else if (input && typeof input === "object") {
    for (const groupValue of Object.values(input)) {
      if (Array.isArray(groupValue)) list.push(...groupValue);
    }
  } else if (typeof input === "string") {
    const split = String(input)
      .split(/[\r\n,;]+/)
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    list.push(...split);
  }

  const out = [];
  for (let i = 0; i < list.length && out.length < maxItems; i++) {
    const entry = list[i];
    if (entry === null || entry === undefined) continue;
    if (typeof entry === "string") {
      const clean = String(entry).replace(/\s+/g, " ").trim().slice(0, maxLength);
      if (!clean) continue;
      out.push({ name: clean, lookup: "", quantity: 1, priceGp: null });
      continue;
    }
    if (typeof entry !== "object" || Array.isArray(entry)) continue;
    const name = String(entry.name || entry.label || entry.item || entry.value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
    const lookup = String(entry.lookup || entry.canonical || entry.english || entry.en || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
    const quantity = clampRangeValue(entry.quantity ?? entry.qty ?? entry.count, 1, 9999, 1);
    const priceGp = normalizeImportedItemPriceGp({
      priceGp: entry.priceGp ?? entry.gp,
      price: entry.price
    });
    const resolvedName = name || lookup;
    if (!resolvedName) continue;
    out.push({
      name: resolvedName,
      lookup: lookup || "",
      quantity,
      priceGp: Number.isFinite(priceGp) && priceGp > 0 ? priceGp : null
    });
  }

  return out;
}

function parseBooleanLoose(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

/**
 * Apply OpenAI flavor generation to planned NPCs
 * @param {Array<{generated: Object}>} planned - Planned NPC list
 * @returns {Promise<{applied:number, failed:number, skipped:number}>}
 */
async function applyOpenAiFlavorToPlanned(planned) {
  const items = Array.isArray(planned) ? planned : [];
  if (!items.length) return { applied: 0, failed: 0, skipped: 0 };

  const maxBatch = getOpenAiMaxBatch();
  const limit = Math.min(items.length, maxBatch);
  let applied = 0;
  let failed = 0;

  for (let i = 0; i < limit; i++) {
    const entry = items[i];
    if (!entry?.generated) continue;
    try {
      const aiFlavor = await generateNpcFlavorWithOpenAi(entry.generated);
      if (aiFlavor && typeof aiFlavor === "object") {
        entry.generated = { ...entry.generated, ...aiFlavor };
        applied += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn(
        `NPC Button: OpenAI flavor failed for "${entry.generated?.name || "Unknown NPC"}".`,
        err
      );
    }
  }
  ensureUniqueGeneratedNames(items);

  return {
    applied,
    failed,
    skipped: Math.max(0, items.length - limit)
  };
}

/**
 * Apply OpenAI token generation to planned NPCs
 * @param {Array<{generated: Object}>} planned - Planned NPC list
 * @returns {Promise<{applied:number, failed:number, skipped:number}>}
 */
async function applyOpenAiTokenToPlanned(planned) {
  const items = Array.isArray(planned) ? planned : [];
  if (!items.length) return { applied: 0, failed: 0, skipped: 0 };

  const maxBatch = getOpenAiMaxBatch();
  const limit = Math.min(items.length, maxBatch);
  let applied = 0;
  let failed = 0;

  for (let i = 0; i < limit; i++) {
    const entry = items[i];
    if (!entry?.generated) continue;
    try {
      const tokenImg = await generateNpcTokenImageWithOpenAi(entry.generated);
      if (tokenImg) {
        entry.generated.tokenImg = tokenImg;
        applied += 1;
      } else {
        failed += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn(
        `NPC Button: OpenAI token generation failed for "${entry.generated?.name || "Unknown NPC"}".`,
        err
      );
    }
  }

  return {
    applied,
    failed,
    skipped: Math.max(0, items.length - limit)
  };
}

function ensureUniqueGeneratedNames(items) {
  const used = new Set();
  for (const entry of items || []) {
    if (!entry?.generated) continue;
    const base = String(entry.generated.name || "").trim() || "Nameless";
    let candidate = base;
    let i = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base} (${i})`;
      i += 1;
    }
    entry.generated.name = candidate;
    used.add(candidate.toLowerCase());
  }
}

function findSpeciesEntryByRace(speciesEntries, raceName) {
  const list = Array.isArray(speciesEntries) ? speciesEntries : [];
  if (!list.length) return null;

  const target = normalizeRaceNameForMatch(raceName);
  if (!target) return null;

  const exact = list.find((entry) => normalizeRaceNameForMatch(entry?.name) === target);
  if (exact) return exact;

  const contains = list.find((entry) => {
    const name = normalizeRaceNameForMatch(entry?.name);
    return name && (name.includes(target) || target.includes(name));
  });
  return contains || null;
}

function normalizeRaceNameForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]/gi, "")
    .trim();
}

function collectManualPromptContext({ form, encounterModeInput, archetypes, speciesEntries }) {
  const mode = String(encounterModeInput?.val() || "main");
  const partyLevel = Math.max(1, Math.min(20, Number(form.find("input[name='partyLevel']").val()) || 3));
  const partySize = Math.max(1, Math.min(8, Number(form.find("input[name='partySize']").val()) || 4));
  const encounterDifficulty = String(form.find("select[name='encounterDifficulty']").val() || "medium");
  const count =
    mode === "encounter"
      ? buildEncounterCount({ partyLevel, partySize, difficulty: encounterDifficulty })
      : Math.max(1, Math.min(50, Number(form.find("input[name='count']").val()) || 1));
  const tierInput = String(form.find("select[name='tier']").val() || "auto");
  const tier = tierInput === "auto" ? getAutoTier() : Math.max(1, Math.min(4, Number(tierInput) || 1));
  const budget = String(form.find("select[name='budget']").val() || "normal");
  const cultureRaw = String(form.find("select[name='culture']").val() || "random");
  const culture = cultureRaw === "random" ? "" : cultureRaw;
  const gender = normalizeGenderOption(form.find("select[name='gender']").val());
  const includeSecret = !!form.find("input[name='includeSecret']").prop("checked");
  const includeHook = !!form.find("input[name='includeHook']").prop("checked");
  const includeLoot = !!form.find("input[name='includeLoot']").prop("checked");
  const importantNpc = !!form.find("input[name='importantNpc']").prop("checked");

  const archetypeKey =
    mode === "encounter"
      ? String(form.find("select[name='encounterArchetype']").val() || "random")
      : String(form.find("select[name='archetype']").val() || "random");
  const resolvedArchetype =
    archetypeKey !== "random" ? (archetypes || []).find((entry) => entry.id === archetypeKey) || null : null;

  const speciesKey =
    mode === "encounter"
      ? String(form.find("select[name='encounterSpecies']").val() || "random")
      : String(form.find("select[name='species']").val() || "random");
  const resolvedSpecies =
    speciesKey !== "random"
      ? (speciesEntries || []).find((entry) => entry.key === speciesKey) || null
      : null;

  return {
    tier,
    count,
    encounterMode: mode,
    partyLevel,
    partySize,
    culture,
    gender,
    race: resolvedSpecies?.name || "",
    budget,
    includeSecret,
    includeHook,
    includeLoot,
    importantNpc,
    encounterDifficulty,
    archetypeName: resolvedArchetype?.name || "",
    attackStyle: resolvedArchetype?.attackStyle || "",
    archetypeTags: Array.isArray(resolvedArchetype?.tags) ? resolvedArchetype.tags : [],
    className: resolvedArchetype ? getClassForArchetype(resolvedArchetype) : ""
  };
}

function normalizeGenderOption(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["male", "m", "man"].includes(normalized)) return "male";
  if (["female", "f", "woman"].includes(normalized)) return "female";
  return "random";
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return !!copied;
  } catch {
    return false;
  }
}

function openImportAiNpcDialog({ form, encounterModeInput, speciesEntries }) {
  new Dialog({
    title: i18nText("ui.dialog.importJsonTitle"),
    content: `
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        <p style="margin:0;font-size:0.85rem;opacity:0.85;">
          ${i18nHtml("ui.dialog.importJsonDescription")}
        </p>
        <textarea name="aiNpcJson" style="width:100%;min-height:18rem;" placeholder='${i18nHtml("ui.dialog.importJsonPlaceholder")}'></textarea>
      </div>
    `,
    buttons: {
      import: {
        label: i18nText("ui.dialog.buttonImportNpc"),
        callback: async (html) => {
          const rawJson = String(html.find("textarea[name='aiNpcJson']").val() || "").trim();
          const app = html.closest(".app.window-app.dialog");
          const showImportPreview = app.find("input[name='showImportPreview']").prop("checked") === true;
          if (!rawJson) {
            ui.notifications?.warn(i18nText("ui.warnPasteJsonFirst"));
            return;
          }
          try {
            await importNpcFromChatGptJson(rawJson, { form, encounterModeInput, speciesEntries, showImportPreview });
          } catch (err) {
            console.error("NPC Button: Failed to import ChatGPT NPC JSON.", err);
            const reason = String(err?.message || "").trim();
            ui.notifications?.error(
              reason
                ? i18nFormat("ui.errorImportFailedWithReason", { reason })
                : i18nText("ui.errorImportFailedGeneric")
            );
          }
        }
      },
      cancel: { label: i18nText("common.cancel") }
    },
    default: "import",
    render: (html) => {
      const app = html.closest(".app.window-app.dialog");
      const dialogButtons = app.find(".dialog-buttons");
      if (!dialogButtons.length || dialogButtons.find(".npc-btn-import-preview-toggle").length) return;

      const checkboxId = `${MODULE_ID}-show-import-preview-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const toggle = $(`
        <label class="npc-btn-import-preview-toggle" for="${checkboxId}" style="display:inline-flex;align-items:center;gap:0.35rem;margin-right:0.5rem;font-size:0.82rem;opacity:0.9;white-space:nowrap;">
          <input id="${checkboxId}" type="checkbox" name="showImportPreview" style="margin:0;" />
          <span>${i18nHtml("ui.dialog.importShowPreview", "Show preview")}</span>
        </label>
      `);

      const importButton = dialogButtons.find("button[data-button='import']").first();
      if (importButton.length) {
        toggle.insertBefore(importButton);
      } else {
        dialogButtons.prepend(toggle);
      }
    }
  }).render(true);
}

async function importNpcFromChatGptJson(rawJson, { form, encounterModeInput, speciesEntries, showImportPreview = false }) {
  await loadData();
  const parsed = parseLooseJsonObject(rawJson);
  const blueprints = normalizeImportedBlueprints(parsed);
  if (!blueprints.length) {
    throw new Error(i18nText("ui.importErrorEmptyJson"));
  }
  if (!blueprints.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
    throw new Error(i18nText("ui.importErrorMustBeObjectOrArray"));
  }

  const formEl = form?.[0];
  if (!formEl) {
    throw new Error(i18nText("ui.importErrorFormUnavailable"));
  }
  const formData = new FormData(formEl);
  const encounterMode = String(formData.get("encounterMode") || String(encounterModeInput?.val() || "main"));

  const tierInput = String(formData.get("tier") || "auto");
  const tier = tierInput === "auto" ? getAutoTier() : Math.max(1, Math.min(4, Number(tierInput) || 1));
  const budgetInput = String(formData.get("budget") || "normal");
  const includeLoot = formData.get("includeLoot") === "on";
  const includeSecret = formData.get("includeSecret") === "on";
  const includeHook = formData.get("includeHook") === "on";
  const importantNpc = formData.get("importantNpc") === "on";

  let folderId = String(formData.get("folder") || "").trim() || null;
  if (encounterMode === "encounter") {
    folderId = await ensureEncounterFolder();
  }
  setLastFolderId(folderId);

  const speciesList = Array.isArray(speciesEntries) && speciesEntries.length
    ? speciesEntries
    : Array.isArray(DATA_CACHE.speciesEntries)
      ? DATA_CACHE.speciesEntries
      : await getSpeciesEntries();
  const speciesKey =
    encounterMode === "encounter"
      ? String(formData.get("encounterSpecies") || "random")
      : String(formData.get("species") || "random");
  const selectedSpecies = speciesKey !== "random"
    ? speciesList.find((entry) => entry.key === speciesKey) || null
    : null;

  const buildResults = [];
  for (let index = 0; index < blueprints.length; index++) {
    const source = blueprints[index];
    const parsedBlueprint = validateAndNormalizeImportedBlueprint(source, index);
    parsedBlueprint.tier = Number(parsedBlueprint.tier || 0) > 0 ? parsedBlueprint.tier : tier;
    parsedBlueprint.budget = String(parsedBlueprint.budget || "").trim() || budgetInput;
    parsedBlueprint.includeLoot = includeLoot;
    parsedBlueprint.includeSecret = includeSecret;
    parsedBlueprint.includeHook = includeHook;
    parsedBlueprint.importantNpc = importantNpc;
    if (!parsedBlueprint.className && parsedBlueprint.class) {
      parsedBlueprint.className = String(parsedBlueprint.class || "").trim();
    }
    if (!parsedBlueprint.race && selectedSpecies?.name) {
      parsedBlueprint.race = selectedSpecies.name;
    }

    const result = await buildActorDataFromAiBlueprint(parsedBlueprint, folderId, { collectMatchDetails: true });
    if (!result?.actorData) {
      throw new Error(i18nText("ui.importErrorBuildActorData"));
    }
    buildResults.push({
      sourceName: String(parsedBlueprint?.name || result?.actorData?.name || "").trim(),
      actorData: result.actorData,
      speciesEntry: findSpeciesEntryByRace(speciesList, parsedBlueprint.race) || selectedSpecies || null,
      resolvedItems: Number(result.resolvedItems || 0),
      missingItems: Number(result.missingItems || 0),
      matchDetails: Array.isArray(result.matchDetails) ? result.matchDetails : []
    });
  }

  if (!buildResults.length) {
    throw new Error(i18nText("ui.importErrorNoEntriesParsed"));
  }

  if (showImportPreview) {
    const confirmed = await openNpcImportPreviewDialog(buildResults);
    if (!confirmed) return;
  }

  const created = typeof Actor.createDocuments === "function"
    ? await Actor.createDocuments(buildResults.map((entry) => entry.actorData))
    : await Promise.all(buildResults.map((entry) => Actor.create(entry.actorData)));

  const pairs = buildResults.map((entry, index) => ({
    actor: created?.[index],
    speciesEntry: entry.speciesEntry
  }));
  for (const pair of pairs) {
    const actor = pair.actor;
    const speciesEntry = pair.speciesEntry;
    if (!actor || !speciesEntry) continue;
    try {
      const speciesItem = await buildSpeciesItem(speciesEntry);
      if (!speciesItem) continue;
      const createdItems = await actor.createEmbeddedDocuments("Item", [speciesItem]);
      const createdItem = createdItems?.[0] || null;
      if (!createdItem) continue;
      await actor.update({ "system.details.race": createdItem.id });
      await applySpeciesTraitsToActor(actor, createdItem);
      await applySpeciesAdvancements(actor, createdItem);
    } catch (err) {
      console.warn(`NPC Button: Failed to apply imported species for "${actor?.name || "Unknown"}".`, err);
    }
  }

  const resolved = buildResults.reduce((sum, entry) => sum + entry.resolvedItems, 0);
  const missing = buildResults.reduce((sum, entry) => sum + entry.missingItems, 0);
  if ((created || []).length === 1) {
    const actor = created?.[0];
    if (resolved || missing) {
      ui.notifications?.info(
        i18nFormat("ui.infoImportedSingleWithCompendium", {
          name: actor?.name || i18nText("common.unnamed"),
          resolved,
          missing
        })
      );
      return;
    }
    ui.notifications?.info(i18nFormat("ui.infoImportedSingle", { name: actor?.name || i18nText("common.unnamed") }));
    return;
  }

  const count = (created || []).length;
  if (resolved || missing) {
    ui.notifications?.info(
      i18nFormat("ui.infoImportedManyWithCompendium", { count, resolved, missing })
    );
    return;
  }
  ui.notifications?.info(i18nFormat("ui.infoImportedMany", { count }));
}

async function openNpcImportPreviewDialog(buildResults) {
  const rows = buildNpcImportPreviewRows(buildResults);
  const viewportWidth = Number(globalThis?.innerWidth || 1400);
  const viewportHeight = Number(globalThis?.innerHeight || 900);
  const dialogWidth = Math.max(420, Math.min(1500, viewportWidth - 48));
  const dialogHeight = Math.max(320, Math.min(920, viewportHeight - 56));
  const resolved = rows.filter((entry) => entry.status === "resolved").length;
  const missing = rows.filter((entry) => entry.status === "missing").length;
  const duplicate = rows.filter((entry) => entry.status === "duplicate").length;
  const summaryText = rows.length
    ? i18nFormat(
      "ui.importPreview.summary",
      { npcs: buildResults.length, rows: rows.length, resolved, missing, duplicate },
      `NPCs: ${buildResults.length} | Rows: ${rows.length} | Resolved: ${resolved} | Missing: ${missing} | Duplicate: ${duplicate}`
    )
    : i18nFormat(
      "ui.importPreview.summaryNoRows",
      { npcs: buildResults.length },
      `NPCs: ${buildResults.length} | No compendium lookup entries detected in payload.`
    );

  const rowStyleByStatus = {
    resolved: "background:rgba(60,160,90,0.16);",
    missing: "background:rgba(195,55,55,0.16);",
    duplicate: "background:rgba(220,140,35,0.16);"
  };
  const statusBadgeStyleByStatus = {
    resolved: "background:#2e7d32;color:#ffffff;",
    missing: "background:#b71c1c;color:#ffffff;",
    duplicate: "background:#ef6c00;color:#1f1300;"
  };

  const tableRows = rows.length
    ? rows.map((entry) => {
      const matchedCell = entry.matchedName
        ? [
          `<strong>${escapeHtml(entry.matchedName)}</strong>`,
          entry.matchedType ? `<div style="opacity:0.8;font-size:0.82em;">${escapeHtml(entry.matchedType)}</div>` : "",
          entry.matchedPack ? `<div style="opacity:0.75;font-size:0.78em;">${escapeHtml(entry.matchedPack)}</div>` : "",
          entry.strategy ? `<div style="opacity:0.65;font-size:0.74em;">${escapeHtml(entry.strategy)}</div>` : ""
        ].filter(Boolean).join("")
        : `<span style="opacity:0.65;">${i18nHtml("ui.importPreview.none", "none")}</span>`;
      return `
        <tr style="${rowStyleByStatus[entry.status] || ""}">
          <td>${escapeHtml(entry.npcName)}</td>
          <td>${escapeHtml(getNpcImportGroupLabel(entry.group))}</td>
          <td>${escapeHtml(entry.requested || "-")}</td>
          <td>${escapeHtml(entry.lookup || "-")}</td>
          <td>${matchedCell}</td>
          <td>
            <span style="display:inline-block;padding:0.15rem 0.45rem;border-radius:999px;font-size:0.78em;font-weight:700;${statusBadgeStyleByStatus[entry.status] || ""}">
              ${escapeHtml(getNpcImportStatusLabel(entry.status))}
            </span>
          </td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="6" style="text-align:center;opacity:0.75;">${i18nHtml("ui.importPreview.noRows", "No lookup rows to preview.")}</td></tr>`;

  const content = `
    <style>
      .npc-btn-import-preview { display:flex; flex-direction:column; gap:0.5rem; height:100%; min-height:0; overflow:hidden; }
      .npc-btn-import-preview__note { margin:0; opacity:0.88; font-size:0.84rem; }
      .npc-btn-import-preview__summary { margin:0; font-size:0.83rem; font-weight:600; }
      .npc-btn-import-preview__table-wrap { flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain; border:1px solid rgba(255,255,255,0.12); border-radius:8px; }
      .npc-btn-import-preview table { width:100%; min-width:52rem; border-collapse:collapse; font-size:clamp(0.74rem, 0.68rem + 0.2vw, 0.82rem); table-layout:fixed; }
      .npc-btn-import-preview th, .npc-btn-import-preview td { padding:0.35rem 0.45rem; border-bottom:1px solid rgba(255,255,255,0.1); vertical-align:top; text-align:left; overflow-wrap:anywhere; word-break:break-word; }
      .npc-btn-import-preview thead th { position:sticky; top:0; background:#1d2233; z-index:1; }
    </style>
    <div class="npc-btn-import-preview">
      <p class="npc-btn-import-preview__note">${i18nHtml("ui.importPreview.description", "Debug preview before import: incoming entries and compendium match results.")}</p>
      <p class="npc-btn-import-preview__summary">${escapeHtml(summaryText)}</p>
      <div class="npc-btn-import-preview__table-wrap">
        <table>
          <thead>
            <tr>
              <th>${i18nHtml("ui.importPreview.colNpc", "NPC")}</th>
              <th>${i18nHtml("ui.importPreview.colGroup", "Group")}</th>
              <th>${i18nHtml("ui.importPreview.colRequested", "Requested")}</th>
              <th>${i18nHtml("ui.importPreview.colLookup", "Lookup")}</th>
              <th>${i18nHtml("ui.importPreview.colMatched", "Matched")}</th>
              <th>${i18nHtml("ui.importPreview.colStatus", "Status")}</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(!!value);
    };

    new Dialog({
      title: i18nText("ui.importPreview.title", "NPC Import Preview"),
      content,
      width: dialogWidth,
      height: dialogHeight,
      resizable: true,
      render: (html) => {
        const app = html.closest(".app.window-app.dialog");
        const form = app.find("form");
        const windowContent = app.find(".window-content");
        const dialogContent = app.find(".dialog-content");
        app.css({
          minWidth: "420px",
          minHeight: "320px",
          maxWidth: "min(96vw, 1500px)",
          maxHeight: "min(94vh, 920px)"
        });
        form.css({ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" });
        windowContent.css({ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" });
        dialogContent.css({ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflow: "hidden" });
      },
      buttons: {
        confirm: {
          label: i18nText("ui.dialog.buttonImportNpc"),
          callback: () => finish(true)
        },
        cancel: {
          label: i18nText("common.cancel"),
          callback: () => finish(false)
        }
      },
      default: "confirm",
      close: () => finish(false)
    }).render(true);
  });
}

function buildNpcImportPreviewRows(buildResults) {
  const rows = [];
  for (let index = 0; index < (buildResults || []).length; index++) {
    const entry = buildResults[index] || {};
    const fallbackName = `${i18nText("common.unnamed", "Unnamed")} #${index + 1}`;
    const npcName = String(entry?.actorData?.name || entry?.sourceName || fallbackName).trim() || fallbackName;
    const details = Array.isArray(entry?.matchDetails) ? entry.matchDetails : [];
    for (const detail of details) {
      rows.push({
        npcName,
        group: String(detail?.group || "items").trim().toLowerCase(),
        status: String(detail?.status || "missing").trim().toLowerCase(),
        requested: String(detail?.requested || "").trim(),
        lookup: String(detail?.lookup || "").trim(),
        matchedName: String(detail?.matchedName || "").trim(),
        matchedType: String(detail?.matchedType || "").trim(),
        matchedPack: String(detail?.matchedPack || "").trim(),
        strategy: String(detail?.strategy || "").trim()
      });
    }
  }
  return rows;
}

function getNpcImportGroupLabel(groupKey) {
  const map = {
    weapons: "ui.importPreview.groupWeapons",
    armor: "ui.importPreview.groupArmor",
    equipment: "ui.importPreview.groupEquipment",
    consumables: "ui.importPreview.groupConsumables",
    loot: "ui.importPreview.groupLoot",
    spells: "ui.importPreview.groupSpells",
    features: "ui.importPreview.groupFeatures"
  };
  const normalized = String(groupKey || "").trim().toLowerCase();
  const key = map[normalized];
  if (!key) return capitalize(normalized || "items");
  return i18nText(key, capitalize(normalized || "items"));
}

function getNpcImportStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "resolved") return i18nText("ui.importPreview.statusResolved", "resolved");
  if (normalized === "duplicate") return i18nText("ui.importPreview.statusDuplicate", "duplicate");
  return i18nText("ui.importPreview.statusMissing", "missing");
}

function normalizeImportedBlueprints(parsed) {
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

function parseLooseJsonObject(rawText) {
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

function validateAndNormalizeImportedBlueprint(input, entryIndex = 0) {
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

