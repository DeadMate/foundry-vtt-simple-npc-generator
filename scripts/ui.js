/**
 * UI components and dialog handling
 * @module ui
 */

import { MODULE_ID } from "./constants.js";
import { DATA_CACHE, loadData } from "./data-loader.js";
import { buildCompendiumCache } from "./cache.js";
import { capitalize, pickRandom, shuffleArray, escapeHtml } from "./utils.js";
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
  ensureEncounterFolder
} from "./encounter.js";
import { generateNpc, buildActorData } from "./npc-generator.js";

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
      <div style="font-weight: 600;">What's new in v${escapeHtml(version)}</div>
      <ul style="margin: 0; padding-left: 1.25rem;">
        ${notes.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
      </ul>
    </div>
  `;

  new Dialog({
    title: "NPC Button updated",
    content,
    buttons: {
      dismiss: {
        label: "Don't show until next update",
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
  const $html = html instanceof HTMLElement ? $(html) : html;
  const selectors = [
    ".directory-header .header-actions",
    ".directory-header .action-buttons",
    ".directory-header .controls",
    ".directory-header .action-buttons.flexrow",
    ".directory-header .action-buttons .actions"
  ];

  let headerActions = null;
  for (const selector of selectors) {
    const found = $html.find(selector).first();
    if (found.length) {
      headerActions = found;
      break;
    }
  }

  const existing = $html.find(`[data-${MODULE_ID}='create']`);
  if (existing.length) return;

  const button = $(
    `<button type="button" class="create-entity" data-${MODULE_ID}="create">
      <i class="fas fa-user-plus"></i> NPC Button
    </button>`
  );

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
}

/**
 * Open the NPC creation dialog
 */
export async function openNpcDialog() {
  if (game.system?.id !== "dnd5e") {
    ui.notifications?.error("NPC Button requires the D&D 5e system.");
    return;
  }

  try {
    await loadData();

    const archetypes = DATA_CACHE.archetypes;
    if (!DATA_CACHE.speciesEntries?.length) {
      ui.notifications?.warn("NPC Button: No species compendium entries found.");
    }
    const options = archetypes
      .map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`)
      .join("");
    const folderOptions = getActorFolderOptions();
    const lastFolder = getLastFolderId();
    const speciesOptions = await getSpeciesOptions();
    const lastSpeciesKey = getLastSpeciesKey();
    const lastOptions = getLastNpcOptions();

  const content = `
    <style>
      .npc-btn-form { display: flex; flex-direction: column; gap: 0.75rem; }
      .npc-btn-tabs { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
      .npc-btn-tabs button { flex: 1; }
      .npc-btn-panel { display: flex; flex-direction: column; gap: 0.75rem; }
      .npc-btn-panel .form-group { margin: 0; }
      .npc-btn-panel .form-fields { gap: 0.5rem; }
      .npc-btn-panel .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
      .npc-btn-panel select, .npc-btn-panel input[type="text"], .npc-btn-panel input[type="number"] { width: 100%; }
    </style>
    <form class="npc-btn-form">
      <input type="hidden" name="encounterMode" value="main">
      <div class="npc-btn-tabs">
        <button type="button" data-tab="main" class="active">Main</button>
        <button type="button" data-tab="encounter">Encounter</button>
      </div>
      <div data-tab-panel="main" class="npc-btn-panel">
      <div class="form-group">
        <label>Archetype</label>
        <div class="form-fields">
          <select name="archetype">
            <option value="random">Random</option>
            ${options}
          </select>
          <button type="button" data-action="roll-archetype" title="Pick a random archetype">🎲</button>
        </div>
      </div>
      <div class="form-group">
        <label>Difficulty (Tier)</label>
        <div class="form-fields">
          <select name="tier">
            <option value="auto">Auto (party level)</option>
            <option value="1">T1 (CR 1/8 - 1/2)</option>
            <option value="2">T2 (CR 1 - 3)</option>
            <option value="3">T3 (CR 4 - 6)</option>
            <option value="4">T4 (CR 7 - 10)</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Budget</label>
        <div class="form-fields">
          <select name="budget">
            <option value="poor">Poor</option>
            <option value="normal" selected>Normal</option>
            <option value="well">Well-Off</option>
            <option value="elite">Elite</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Culture</label>
        <div class="form-fields">
          <select name="culture">
            <option value="random">Random</option>
            ${Object.keys(DATA_CACHE.names?.cultures || {})
              .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(capitalize(k))}</option>`)
              .join("")}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Race</label>
        <div class="form-fields" style="flex-direction: column; align-items: stretch;">
          <input type="text" name="speciesSearch" placeholder="Search race..." />
          <select name="species">
            <option value="random">Random</option>
            ${speciesOptions}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Count</label>
        <div class="form-fields" style="gap: 0.5rem; align-items: center;">
          <button type="button" data-npc-count="minus">-</button>
          <input type="number" name="count" value="1" min="1" max="50" style="width: 5rem; text-align: center;">
          <button type="button" data-npc-count="plus">+</button>
        </div>
      </div>
      <div class="form-group">
        <label>Folder</label>
        <div class="form-fields">
          <select name="folder">
            <option value="">None</option>
            ${folderOptions}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Options</label>
        <div class="form-fields" style="flex-direction: column; align-items: flex-start;">
          <label class="checkbox"><input type="checkbox" name="includeLoot" checked> Loot</label>
          <label class="checkbox"><input type="checkbox" name="includeSecret" checked> Secret</label>
          <label class="checkbox"><input type="checkbox" name="includeHook" checked> Quest hook</label>
          <label class="checkbox"><input type="checkbox" name="importantNpc"> Boss</label>
        </div>
      </div>
      </div>
      <div data-tab-panel="encounter" class="npc-btn-panel" style="display: none;">
      <div class="form-group">
        <label>Encounter</label>
        <div class="form-fields" style="flex-direction: column; align-items: stretch;">
          <label style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem;">
            <span style="font-size: 0.85rem;">Encounter race</span>
            <input type="text" name="encounterSpeciesSearch" placeholder="Search race..." />
            <select name="encounterSpecies">
              <option value="random">Random</option>
              ${speciesOptions}
            </select>
          </label>
          <label style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem;">
            <span style="font-size: 0.85rem;">Encounter archetype</span>
            <select name="encounterArchetype">
              <option value="random">Random</option>
              ${options}
            </select>
          </label>
          <div class="row-2">
            <label style="display: flex; flex-direction: column; gap: 0.25rem;">
              <span style="font-size: 0.85rem;">Party level</span>
              <input type="number" name="partyLevel" value="3" min="1" max="20">
            </label>
            <label style="display: flex; flex-direction: column; gap: 0.25rem;">
              <span style="font-size: 0.85rem;">Party size</span>
              <input type="number" name="partySize" value="4" min="1" max="8">
            </label>
          </div>
          <label style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem;">
            <span style="font-size: 0.85rem;">Difficulty</span>
            <select name="encounterDifficulty">
              <option value="easy">Easy</option>
              <option value="medium" selected>Medium</option>
              <option value="hard">Hard</option>
              <option value="deadly">Deadly</option>
            </select>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <div class="form-fields">
          <p style="margin: 0; font-size: 0.85rem; opacity: 0.8;">
            Auto-balance adjusts NPC tiers and count, and will place them in the next "Encounter-N" folder.
          </p>
        </div>
      </div>
      </div>
    </form>
  `;

    new Dialog({
    title: "NPC Button (D&D 5e)",
    content,
    buttons: {
      cache: {
        label: "Build Cache",
        callback: async () => {
          await buildCompendiumCache();
        }
      },
      create: {
        label: "Create NPC",
        callback: async (html) => {
          const form = html.find("form")[0];
          const formData = new FormData(form);
          await createNpcFromForm(formData);
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "create",
    render: (html) => {
      const form = html.find("form");
      const tabButtons = form.find("[data-tab]");
      const tabPanels = form.find("[data-tab-panel]");
      const encounterModeInput = form.find("input[name='encounterMode']");
      const createButton = html.find("button[data-button='create']");
      const updateCreateLabel = () => {
        if (encounterModeInput.val() === "encounter") {
          createButton.text("Create Encounter");
        } else {
          createButton.text("Create NPC");
        }
      };
      tabButtons.on("click", (ev) => {
        const tab = ev.currentTarget.getAttribute("data-tab");
        tabButtons.removeClass("active");
        $(ev.currentTarget).addClass("active");
        tabPanels.hide();
        form.find(`[data-tab-panel='${tab}']`).show();
        encounterModeInput.val(tab);
        updateCreateLabel();
      });
      if (lastFolder) {
        form.find("select[name='folder']").val(lastFolder);
      }
      if (lastSpeciesKey) {
        form.find("select[name='species']").val(lastSpeciesKey);
      }
      if (lastOptions) {
        if (lastOptions.tier) form.find("select[name='tier']").val(String(lastOptions.tier));
        if (lastOptions.budget) form.find("select[name='budget']").val(String(lastOptions.budget));
        if (lastOptions.culture) form.find("select[name='culture']").val(String(lastOptions.culture));
        if (lastOptions.archetype) form.find("select[name='archetype']").val(String(lastOptions.archetype));
        if (lastOptions.encounterSpecies) {
          form.find("select[name='encounterSpecies']").val(String(lastOptions.encounterSpecies));
        }
        if (lastOptions.encounterArchetype) {
          form.find("select[name='encounterArchetype']").val(String(lastOptions.encounterArchetype));
        }
        if (lastOptions.partyLevel) form.find("input[name='partyLevel']").val(Number(lastOptions.partyLevel));
        if (lastOptions.partySize) form.find("input[name='partySize']").val(Number(lastOptions.partySize));
        if (lastOptions.encounterDifficulty) {
          form.find("select[name='encounterDifficulty']").val(String(lastOptions.encounterDifficulty));
        }
        if (lastOptions.encounterMode) {
          const tab = String(lastOptions.encounterMode);
          if (tab === "encounter") {
            tabButtons.removeClass("active");
            tabButtons.filter("[data-tab='encounter']").addClass("active");
            tabPanels.hide();
            form.find("[data-tab-panel='encounter']").show();
            encounterModeInput.val("encounter");
            updateCreateLabel();
          }
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
      }
      const speciesSearch = form.find("input[name='speciesSearch']");
      const speciesSelect = form.find("select[name='species']");
      const allOptions = speciesSelect.find("option").toArray();
      const encounterSpeciesSearch = form.find("input[name='encounterSpeciesSearch']");
      const encounterSpeciesSelect = form.find("select[name='encounterSpecies']");
      const encounterAllOptions = encounterSpeciesSelect.find("option").toArray();
      const archetypeSelect = form.find("select[name='archetype']");
      form.find("[data-action='roll-archetype']").on("click", () => {
        const opts = archetypeSelect.find("option").toArray().filter((o) => o.value !== "random");
        if (!opts.length) return;
        const pick = pickRandom(opts);
        if (pick) archetypeSelect.val(pick.value);
      });
      attachSpeciesSearch(speciesSearch, speciesSelect, allOptions);
      attachSpeciesSearch(encounterSpeciesSearch, encounterSpeciesSelect, encounterAllOptions);
      const input = form.find("input[name='count']");
      const clamp = (val) => Math.max(1, Math.min(50, Number(val) || 1));
      form.find("[data-npc-count='minus']").on("click", () => {
        input.val(clamp(Number(input.val()) - 1));
      });
      form.find("[data-npc-count='plus']").on("click", () => {
        input.val(clamp(Number(input.val()) + 1));
      });

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
    }
    }).render(true);
  } catch (err) {
    console.error("NPC Button: Failed to open NPC dialog.", err);
    ui.notifications?.error("NPC Button: Failed to open generator dialog. Check console.");
  }
}

/**
 * Create NPCs from form data
 * @param {FormData} formData - Form data
 */
export async function createNpcFromForm(formData) {
  try {
    await loadData();

    if (!DATA_CACHE.archetypes?.length) {
      ui.notifications?.error("NPC Button: No archetypes found. Check data/archetypes.json.");
      return;
    }

    const tierInput = formData.get("tier");
    const tier = tierInput === "auto" ? getAutoTier() : Number(tierInput);
    const cultureInput = formData.get("culture");
    const archetypeInput = formData.get("archetype");
    const folderInput = String(formData.get("folder") || "").trim() || null;
    let folderId = folderInput;
    const encounterMode = String(formData.get("encounterMode") || "main");
    const encounterSpeciesKey = String(formData.get("encounterSpecies") || "random");
    const encounterArchetypeKey = String(formData.get("encounterArchetype") || "random");
    const partyLevelInput = Number(formData.get("partyLevel") || 3);
    const partySizeInput = Number(formData.get("partySize") || 4);
    const encounterDifficulty = String(formData.get("encounterDifficulty") || "medium");
    setLastNpcOptions({
      tier: String(tierInput || "auto"),
      budget: String(formData.get("budget") || "normal"),
      culture: String(cultureInput || "random"),
      archetype: String(archetypeInput || "random"),
      encounterSpecies: encounterSpeciesKey,
      encounterArchetype: encounterArchetypeKey,
      partyLevel: partyLevelInput,
      partySize: partySizeInput,
      encounterDifficulty,
      encounterMode,
      includeLoot: formData.get("includeLoot") === "on",
      includeSecret: formData.get("includeSecret") === "on",
      includeHook: formData.get("includeHook") === "on",
      importantNpc: formData.get("importantNpc") === "on"
    });
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
      ui.notifications?.warn("NPC Button: No race entries found. Check your compendium packs.");
    }
    const includeLoot = formData.get("includeLoot") === "on";
    const includeSecret = formData.get("includeSecret") === "on";
    const includeHook = formData.get("includeHook") === "on";
    const manualImportant = formData.get("importantNpc") === "on";

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

      const speciesEntry =
        (encounterMode === "encounter" ? fixedEncounterSpecies : fixedSpecies) ||
        (speciesList.length ? pickRandom(speciesList) : null);
      const speciesName = speciesEntry?.name || "Unknown";

      const plannedTier = encounterPlan?.[i]?.tier ?? tier;
      const importantNpc = encounterPlan?.[i]?.importantNpc ?? manualImportant;

      const generated = generateNpc({
        tier: plannedTier,
        archetype: resolvedArchetype,
        culture,
        race: speciesName,
        budget: budgetInput,
        includeLoot,
        includeSecret,
        includeHook,
        importantNpc,
        usedNames
      });

      planned.push({ generated, speciesEntry });
    }

    const actorDataList = await Promise.all(
      planned.map((entry) => buildActorData(entry.generated, folderId))
    );

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
        `NPC Button: ${speciesApplyErrors} NPC(s) were created without full species data. Check console.`
      );
    }

    if (created.length === 1) {
      ui.notifications?.info(`Created NPC: ${created[0]?.name || "Unnamed"}`);
      return;
    }
    const names = created.map((a) => a?.name).filter(Boolean);
    const preview = names.slice(0, 5).join(", ");
    const extra = names.length > 5 ? ` +${names.length - 5} more` : "";
    ui.notifications?.info(`Created ${created.length} NPCs: ${preview}${extra}`);
  } catch (err) {
    console.error("NPC Button: Failed to create NPC(s).", err);
    ui.notifications?.error("NPC Button: NPC generation failed. Check console.");
  }
}
