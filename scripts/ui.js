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
import { generateNpc, buildActorData, buildActorDataFromAiBlueprint, getClassForArchetype } from "./npc-generator.js";
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
    const aiReady = isOpenAiConfigured();
    const speciesEntries = Array.isArray(DATA_CACHE.speciesEntries) ? DATA_CACHE.speciesEntries : [];

  const content = `
    <style>
      .npc-btn-form { display: flex; flex-direction: column; gap: 0.75rem; }
      .npc-btn-shell {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.8rem;
        border-radius: 14px;
        color: #edf2ff;
        background: linear-gradient(165deg, rgba(25, 31, 45, 0.98), rgba(14, 18, 29, 0.98));
        border: 1px solid rgba(129, 156, 219, 0.45);
      }
      .npc-btn-shell,
      .npc-btn-shell label,
      .npc-btn-shell span,
      .npc-btn-shell p,
      .npc-btn-shell h3,
      .npc-btn-shell strong,
      .npc-btn-shell small { color: #edf2ff; }
      .npc-btn-hero {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem 0.75rem;
        border-radius: 10px;
        background: rgba(73, 104, 171, 0.18);
        border: 1px solid rgba(125, 162, 236, 0.55);
      }
      .npc-btn-hero strong { font-size: 1rem; letter-spacing: 0.02em; color: #ffffff; }
      .npc-btn-hero small { display: block; opacity: 0.95; margin-top: 0.1rem; color: #dbe7ff; }
      .npc-btn-badge {
        font-size: 0.73rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 700;
        padding: 0.28rem 0.55rem;
        border-radius: 999px;
        color: #f7fbff;
        background: rgba(78, 155, 255, 0.46);
        border: 1px solid rgba(162, 208, 255, 0.95);
      }
      .npc-btn-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.4rem;
      }
      .npc-btn-tabs button {
        border-radius: 10px;
        margin: 0;
        padding: 0.45rem 0.7rem;
        font-weight: 600;
        color: #e3ebff;
        border: 1px solid #5f6e97;
        background: linear-gradient(180deg, #2c3854, #212b42);
      }
      .npc-btn-tabs button.active {
        color: #ffffff;
        background: linear-gradient(180deg, #488ff0, #316cc2);
        border-color: #a8cbff;
      }
      .npc-btn-shell button {
        color: #f2f7ff;
        border: 1px solid #60719d;
        background: linear-gradient(180deg, #31405f, #27324d);
        text-shadow: none;
      }
      .npc-btn-shell button:hover {
        border-color: #92b8ff;
        background: linear-gradient(180deg, #3a4d74, #2f4063);
      }
      .npc-btn-shell button:disabled {
        opacity: 0.6;
        color: #b5bfd8;
      }
      .npc-btn-panel { display: flex; flex-direction: column; gap: 0.75rem; }
      .npc-btn-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.6rem;
      }
      .npc-btn-card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.65rem;
        border-radius: 10px;
        border: 1px solid rgba(123, 149, 206, 0.5);
        background: rgba(49, 64, 95, 0.32);
      }
      .npc-btn-card h3 {
        margin: 0;
        font-size: 0.82rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #d8e5ff;
      }
      .npc-btn-span-2 { grid-column: 1 / -1; }
      .npc-btn-field { display: flex; flex-direction: column; gap: 0.25rem; }
      .npc-btn-field > span { font-size: 0.78rem; opacity: 0.88; }
      .npc-btn-row { display: flex; gap: 0.45rem; align-items: center; }
      .npc-btn-row > * { flex: 1; }
      .npc-btn-row .npc-btn-roll { flex: 0 0 auto; width: 2.2rem; padding: 0; }
      .npc-btn-row .npc-btn-stepper { flex: 0 0 auto; width: 2rem; padding: 0; }
      .npc-btn-field select,
      .npc-btn-field input[type="text"],
      .npc-btn-field input[type="number"] {
        width: 100%;
        color: #f3f7ff;
        border-radius: 8px;
        border: 1px solid #6073a5;
        background: #11192b;
      }
      .npc-btn-field select option,
      .npc-btn-field select optgroup {
        color: #172033;
        background: #f5f8ff;
      }
      .npc-btn-field select:focus,
      .npc-btn-field input[type="text"]:focus,
      .npc-btn-field input[type="number"]:focus {
        outline: none;
        border-color: #9fc1ff;
        box-shadow: 0 0 0 1px rgba(160, 193, 255, 0.35);
      }
      .npc-btn-checks {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.35rem 0.6rem;
      }
      .npc-btn-note {
        margin: 0;
        font-size: 0.78rem;
        line-height: 1.3;
        color: #c9d8f6;
      }
      .npc-btn-shell .checkbox { color: #edf2ff; }
      .npc-btn-ai-group { gap: 0.6rem; }
      .npc-btn-ai-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
      }
      .npc-btn-ai-top h3 { margin: 0; font-size: 0.86rem; text-transform: uppercase; letter-spacing: 0.04em; }
      .npc-btn-ai-controls { display: none; flex-direction: column; align-items: stretch; gap: 0.5rem; }
      .npc-btn-ai-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }
      .npc-btn-ai-options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem 0.6rem; }
      .npc-btn-dialog-buttons { display: flex !important; gap: 0.4rem; }
      .npc-btn-dialog-buttons .dialog-button {
        margin: 0;
        width: 100%;
        flex: 1 1 0;
        white-space: nowrap;
        color: #ffffff;
        border: 1px solid #7ca7f5;
        background: linear-gradient(180deg, #3f76d6, #2f5fb5);
      }
      .npc-btn-dialog-buttons .dialog-button:hover {
        border-color: #b4d0ff;
        background: linear-gradient(180deg, #4a87ef, #386ecf);
      }
      @media (max-width: 700px) {
        .npc-btn-grid,
        .npc-btn-checks,
        .npc-btn-ai-actions,
        .npc-btn-ai-options { grid-template-columns: 1fr; }
      }
    </style>
    <form class="npc-btn-form">
      <input type="hidden" name="encounterMode" value="main">
      <div class="npc-btn-shell">
        <div class="npc-btn-hero">
          <div>
            <strong>NPC Generator</strong>
            <small>Fast setup for single NPCs and full encounters.</small>
          </div>
          <span class="npc-btn-badge">D&D 5e</span>
        </div>

        <div class="npc-btn-tabs">
          <button type="button" data-tab="main" class="active">Main NPC</button>
          <button type="button" data-tab="encounter">Encounter</button>
        </div>

        <div data-tab-panel="main" class="npc-btn-panel">
          <div class="npc-btn-grid">
            <section class="npc-btn-card">
              <h3>Core Setup</h3>
              <label class="npc-btn-field">
                <span>Archetype</span>
                <div class="npc-btn-row">
                  <select name="archetype">
                    <option value="random">Random</option>
                    ${options}
                  </select>
                  <button type="button" class="npc-btn-roll" data-action="roll-archetype" title="Pick a random archetype">🎲</button>
                </div>
              </label>
              <label class="npc-btn-field">
                <span>Difficulty (Tier)</span>
                <select name="tier">
                  <option value="auto">Auto (party level)</option>
                  <option value="1">T1 (CR 1/8 - 1/2)</option>
                  <option value="2">T2 (CR 1 - 3)</option>
                  <option value="3">T3 (CR 4 - 6)</option>
                  <option value="4">T4 (CR 7 - 10)</option>
                </select>
              </label>
              <label class="npc-btn-field">
                <span>Budget</span>
                <select name="budget">
                  <option value="poor">Poor</option>
                  <option value="normal" selected>Normal</option>
                  <option value="well">Well-Off</option>
                  <option value="elite">Elite</option>
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>Identity</h3>
              <label class="npc-btn-field">
                <span>Culture</span>
                <select name="culture">
                  <option value="random">Random</option>
                  ${Object.keys(DATA_CACHE.names?.cultures || {})
                    .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(capitalize(k))}</option>`)
                    .join("")}
                </select>
              </label>
              <label class="npc-btn-field">
                <span>Gender</span>
                <select name="gender">
                  <option value="random">Random</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label class="npc-btn-field">
                <span>Race</span>
                <input type="text" name="speciesSearch" placeholder="Search race..." />
                <select name="species">
                  <option value="random">Random</option>
                  ${speciesOptions}
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>Output</h3>
              <label class="npc-btn-field">
                <span>Count</span>
                <div class="npc-btn-row">
                  <button type="button" class="npc-btn-stepper" data-npc-count="minus">-</button>
                  <input type="number" name="count" value="1" min="1" max="50" style="text-align: center;">
                  <button type="button" class="npc-btn-stepper" data-npc-count="plus">+</button>
                </div>
              </label>
              <label class="npc-btn-field">
                <span>Folder</span>
                <select name="folder">
                  <option value="">None</option>
                  ${folderOptions}
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>Add-ons</h3>
              <div class="npc-btn-checks">
                <label class="checkbox"><input type="checkbox" name="includeLoot" checked> Loot</label>
                <label class="checkbox"><input type="checkbox" name="includeSecret" checked> Secret</label>
                <label class="checkbox"><input type="checkbox" name="includeHook" checked> Quest hook</label>
                <label class="checkbox"><input type="checkbox" name="importantNpc"> Boss</label>
              </div>
              <p class="npc-btn-note">Use Boss for stronger stat budget and encounter presence.</p>
            </section>
          </div>
        </div>

        <div data-tab-panel="encounter" class="npc-btn-panel" style="display: none;">
          <div class="npc-btn-grid">
            <section class="npc-btn-card">
              <h3>Encounter Template</h3>
              <label class="npc-btn-field">
                <span>Encounter race</span>
                <input type="text" name="encounterSpeciesSearch" placeholder="Search race..." />
                <select name="encounterSpecies">
                  <option value="random">Random</option>
                  ${speciesOptions}
                </select>
              </label>
              <label class="npc-btn-field">
                <span>Encounter archetype</span>
                <select name="encounterArchetype">
                  <option value="random">Random</option>
                  ${options}
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>Party Balance</h3>
              <div class="npc-btn-row">
                <label class="npc-btn-field">
                  <span>Party level</span>
                  <input type="number" name="partyLevel" value="3" min="1" max="20">
                </label>
                <label class="npc-btn-field">
                  <span>Party size</span>
                  <input type="number" name="partySize" value="4" min="1" max="8">
                </label>
              </div>
              <label class="npc-btn-field">
                <span>Difficulty</span>
                <select name="encounterDifficulty">
                  <option value="easy">Easy</option>
                  <option value="medium" selected>Medium</option>
                  <option value="hard">Hard</option>
                  <option value="deadly">Deadly</option>
                </select>
              </label>
              <p class="npc-btn-note">Count auto-adjusts from party setup and difficulty.</p>
            </section>

            <section class="npc-btn-card npc-btn-span-2">
              <h3>Encounter Notes</h3>
              <p class="npc-btn-note">
                Encounter generation places actors in the next <strong>Encounter-N</strong> folder and balances tiers automatically.
              </p>
            </section>
          </div>
        </div>

        <section class="npc-btn-card npc-btn-ai-group">
          <div class="npc-btn-ai-top">
            <h3>AI Tools</h3>
            <label class="checkbox"><input type="checkbox" name="useAi"> Use AI (OpenAI)</label>
          </div>
          <div class="npc-btn-ai-controls" data-ai-controls>
            <div class="npc-btn-ai-actions">
              <button type="button" data-action="open-ai-key">Set API Key</button>
              <button type="button" data-action="copy-ai-prompt">Copy Prompt</button>
              <button type="button" data-action="import-ai-json">Import JSON</button>
            </div>
            <div class="npc-btn-ai-options">
              <label class="checkbox">
                <input type="checkbox" name="includeAiFlavor" ${aiReady ? "" : "disabled"}>
                AI flavor text
              </label>
              <label class="checkbox">
                <input type="checkbox" name="includeAiToken" ${aiReady ? "" : "disabled"}>
                AI token image
              </label>
            </div>
            <p class="npc-btn-note">
              ${aiReady
                ? "OpenAI key is configured for this GM client."
                : "Set your OpenAI API key in Module Settings (Set API Key menu)."}
            </p>
            <p class="npc-btn-note">
              <strong>Create AI NPC</strong> builds full NPCs (stats + gear + spells/features via compendium lookup).
            </p>
          </div>
        </section>
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
      createAi: {
        label: "Create AI NPC",
        callback: async (html) => {
          const form = html.find("form")[0];
          const formData = new FormData(form);
          await createNpcFromForm(formData, { aiFull: true });
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
      const createAiButton = html.find("button[data-button='createAi']");
      const dialogButtons = html.closest(".dialog").find(".dialog-buttons");
      dialogButtons.addClass("npc-btn-dialog-buttons");
      createAiButton.hide();
      const updateCreateLabel = () => {
        if (encounterModeInput.val() === "encounter") {
          createButton.text("Create Encounter");
          createAiButton.text("Create AI Encounter");
        } else {
          createButton.text("Create NPC");
          createAiButton.text("Create AI NPC");
        }
      };
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
      const includeAiFlavorInput = form.find("input[name='includeAiFlavor']");
      const includeAiTokenInput = form.find("input[name='includeAiToken']");
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
        setLastFolderId(String(form.find("select[name='folder']").val() || ""));
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
          ui.notifications?.info("NPC Button: ChatGPT prompt copied to clipboard.");
          return;
        }
        new Dialog({
          title: "ChatGPT NPC Prompt",
          content: `
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <p style="margin:0;font-size:0.85rem;opacity:0.85;">
                Copy this prompt and use it in ChatGPT. Ask for JSON-only reply.
              </p>
              <textarea style="width:100%;min-height:18rem;" readonly>${escapeHtml(promptText)}</textarea>
            </div>
          `,
          buttons: {
            close: { label: "Close" }
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
      const updateAiUi = () => {
        const useAi = !!useAiToggle.prop("checked");
        aiControls.css("display", useAi ? "flex" : "none");
        createAiButton.toggle(useAi);
        if (!useAi) {
          createAiButton.prop("disabled", false);
          createAiButton.attr("title", "");
          return;
        }
        if (!aiReady) {
          createAiButton.prop("disabled", true);
          createAiButton.attr("title", "Set OpenAI API key first.");
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
          "select[name='folder']",
          "input[name='partyLevel']",
          "input[name='partySize']",
          "input[name='count']",
          "input[name='includeLoot']",
          "input[name='includeSecret']",
          "input[name='includeHook']",
          "input[name='importantNpc']"
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
    ui.notifications?.error("NPC Button: Failed to open generator dialog. Check console.");
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

    if (!DATA_CACHE.archetypes?.length) {
      ui.notifications?.error("NPC Button: No archetypes found. Check data/archetypes.json.");
      return;
    }
    const useAiRequested = formData.get("useAi") === "on";
    const useAiFullRequested = options?.aiFull === true;
    const useAiFull = useAiRequested && useAiFullRequested;

    const tierInput = formData.get("tier");
    const tier = tierInput === "auto" ? getAutoTier() : Number(tierInput);
    const cultureInput = formData.get("culture");
    const genderInput = normalizeGenderOption(formData.get("gender"));
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
      gender: genderInput,
      archetype: String(archetypeInput || "random"),
      count: Math.max(1, Math.min(50, Number(formData.get("count")) || 1)),
      encounterSpecies: encounterSpeciesKey,
      encounterArchetype: encounterArchetypeKey,
      partyLevel: partyLevelInput,
      partySize: partySizeInput,
      encounterDifficulty,
      encounterMode,
      useAi: useAiRequested,
      includeLoot: formData.get("includeLoot") === "on",
      includeSecret: formData.get("includeSecret") === "on",
      includeHook: formData.get("includeHook") === "on",
      includeAiFlavor: formData.get("includeAiFlavor") === "on",
      includeAiToken: formData.get("includeAiToken") === "on",
      includeAiFull: useAiFullRequested,
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
    const includeAiFlavor = useAiRequested && formData.get("includeAiFlavor") === "on";
    const includeAiToken = useAiRequested && formData.get("includeAiToken") === "on";
    const manualImportant = formData.get("importantNpc") === "on";
    const aiReady = isOpenAiConfigured();

    if (useAiFullRequested && !useAiRequested) {
      ui.notifications?.warn("NPC Button: Enable 'Use AI' to use Create AI NPC.");
      return;
    }

    if (useAiFull && !aiReady) {
      ui.notifications?.warn(
        "NPC Button: Full AI generation requires OpenAI API key in Module Settings on this GM browser."
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
        ui.notifications?.info(`NPC Button: OpenAI full-generated ${aiFullApplied} NPC(s).`);
      }
      if (aiFullFailed) {
        ui.notifications?.warn(
          `NPC Button: OpenAI full generation failed for ${aiFullFailed} NPC(s). Used local fallback generation.`
        );
      }
      if (aiFullSkipped) {
        ui.notifications?.info(
          `NPC Button: Skipped full AI generation for ${aiFullSkipped} NPC(s) due to max batch setting.`
        );
      }
    }

    if (!useAiFull && includeAiFlavor) {
      if (!aiReady) {
        ui.notifications?.warn(
          "NPC Button: OpenAI flavor skipped (enable OpenAI + set API key in Module Settings on this GM browser)."
        );
      } else {
        const aiResult = await applyOpenAiFlavorToPlanned(planned);
        if (aiResult.applied) {
          ui.notifications?.info(`NPC Button: OpenAI flavored ${aiResult.applied} NPC(s).`);
        }
        if (aiResult.failed) {
          ui.notifications?.warn(
            `NPC Button: OpenAI flavor failed for ${aiResult.failed} NPC(s). Used local flavor fallback.`
          );
        }
        if (aiResult.skipped) {
          ui.notifications?.info(
            `NPC Button: Skipped OpenAI flavor for ${aiResult.skipped} NPC(s) due to max batch setting.`
          );
        }
      }
    }

    if (includeAiToken) {
      if (!aiReady) {
        ui.notifications?.warn(
          "NPC Button: OpenAI token skipped (enable OpenAI + set API key in Module Settings on this GM browser)."
        );
      } else {
        const aiTokenResult = await applyOpenAiTokenToPlanned(planned);
        if (aiTokenResult.applied) {
          ui.notifications?.info(`NPC Button: OpenAI generated ${aiTokenResult.applied} token(s).`);
        }
        if (aiTokenResult.failed) {
          ui.notifications?.warn(
            `NPC Button: OpenAI token failed for ${aiTokenResult.failed} NPC(s). Used local token fallback.`
          );
        }
        if (aiTokenResult.skipped) {
          ui.notifications?.info(
            `NPC Button: Skipped OpenAI token for ${aiTokenResult.skipped} NPC(s) due to max batch setting.`
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
      ui.notifications?.info(`NPC Button: Matched ${resolvedAiItems} AI-requested item(s) from compendiums.`);
    }
    if (useAiFull && missingAiItems) {
      ui.notifications?.warn(
        `NPC Button: Could not match ${missingAiItems} AI-requested item(s) in compendiums.`
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
    title: "Import ChatGPT NPC JSON",
    content: `
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        <p style="margin:0;font-size:0.85rem;opacity:0.85;">
          Paste JSON from ChatGPT (single NPC object or array of NPC objects). Import uses current dialog options for folder/encounter and toggles.
        </p>
        <textarea name="aiNpcJson" style="width:100%;min-height:18rem;" placeholder='{"name":"..."} or [{"name":"..."}, {...}]'></textarea>
      </div>
    `,
    buttons: {
      import: {
        label: "Import NPC",
        callback: async (html) => {
          const rawJson = String(html.find("textarea[name='aiNpcJson']").val() || "").trim();
          if (!rawJson) {
            ui.notifications?.warn("NPC Button: Paste NPC JSON first.");
            return;
          }
          try {
            await importNpcFromChatGptJson(rawJson, { form, encounterModeInput, speciesEntries });
          } catch (err) {
            console.error("NPC Button: Failed to import ChatGPT NPC JSON.", err);
            const reason = String(err?.message || "").trim();
            ui.notifications?.error(
              reason
                ? `NPC Button: Import failed — ${reason}`
                : "NPC Button: Import failed. JSON invalid or incompatible."
            );
          }
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "import"
  }).render(true);
}

async function importNpcFromChatGptJson(rawJson, { form, encounterModeInput, speciesEntries }) {
  await loadData();
  const parsed = parseLooseJsonObject(rawJson);
  const blueprints = normalizeImportedBlueprints(parsed);
  if (!blueprints.length) {
    throw new Error("Imported JSON is empty.");
  }
  if (!blueprints.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
    throw new Error("Imported JSON must be an object or an array of objects.");
  }

  const formEl = form?.[0];
  if (!formEl) {
    throw new Error("Form context is unavailable.");
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
  for (const source of blueprints) {
    const parsedBlueprint = { ...source };
    parsedBlueprint.tier = Number(parsedBlueprint.tier || 0) > 0 ? parsedBlueprint.tier : tier;
    parsedBlueprint.budget = String(parsedBlueprint.budget || "").trim() || budgetInput;
    parsedBlueprint.includeLoot = includeLoot;
    parsedBlueprint.includeSecret = includeSecret;
    parsedBlueprint.includeHook = includeHook;
    parsedBlueprint.importantNpc = importantNpc;
    applyImportedBlueprintDefaults(parsedBlueprint);
    if (!parsedBlueprint.className && parsedBlueprint.class) {
      parsedBlueprint.className = String(parsedBlueprint.class || "").trim();
    }
    if (!parsedBlueprint.race && selectedSpecies?.name) {
      parsedBlueprint.race = selectedSpecies.name;
    }

    const result = await buildActorDataFromAiBlueprint(parsedBlueprint, folderId);
    if (!result?.actorData) {
      throw new Error("Failed to build actor data from imported JSON.");
    }
    buildResults.push({
      actorData: result.actorData,
      speciesEntry: findSpeciesEntryByRace(speciesList, parsedBlueprint.race) || selectedSpecies || null,
      resolvedItems: Number(result.resolvedItems || 0),
      missingItems: Number(result.missingItems || 0)
    });
  }

  if (!buildResults.length) {
    throw new Error("No NPC entries were parsed from imported JSON.");
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
        `Imported NPC: ${actor?.name || "Unnamed"} (compendium matches: ${resolved}, missing: ${missing}).`
      );
      return;
    }
    ui.notifications?.info(`Imported NPC: ${actor?.name || "Unnamed"}`);
    return;
  }

  const count = (created || []).length;
  if (resolved || missing) {
    ui.notifications?.info(
      `Imported ${count} NPCs (compendium matches: ${resolved}, missing: ${missing}).`
    );
    return;
  }
  ui.notifications?.info(`Imported ${count} NPCs.`);
}

function normalizeImportedBlueprints(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
  }
  if (!parsed || typeof parsed !== "object") return [];

  const containerKeys = ["npcs", "encounter", "actors", "items", "data", "results"];
  for (const key of containerKeys) {
    if (!Array.isArray(parsed[key])) continue;
    const list = parsed[key].filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
    if (list.length) return list;
  }

  return [parsed];
}

function parseLooseJsonObject(rawText) {
  const text = normalizeImportJsonText(rawText);
  if (!text) throw new Error("Empty JSON input.");
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
        const reason = String(parseErr?.message || "invalid JSON");
        throw new Error(`invalid JSON (${reason})`);
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

function applyImportedBlueprintDefaults(parsed) {
  if (!parsed || typeof parsed !== "object") return;

  const listFields = ["features", "items", "spells", "actions"];
  for (const field of listFields) {
    const value = parsed[field];
    if (Array.isArray(value)) {
      parsed[field] = value
        .map((entry) => String(entry || "").trim())
        .filter(Boolean);
      continue;
    }
    if (typeof value === "string") {
      const text = value.trim();
      if (!text || /^(none|null|n\/a|[-–—,;]+)$/i.test(text)) {
        parsed[field] = [];
        continue;
      }
      const list = text
        .split(/[\r\n,;]+/)
        .map((entry) => String(entry || "").replace(/^"+|"+$/g, "").trim())
        .filter((entry) => entry && !/^[-–—]+$/.test(entry));
      parsed[field] = list.length ? list : [];
      continue;
    }
    parsed[field] = [];
  }

  if (typeof parsed.name !== "string" || !parsed.name.trim()) parsed.name = "Imported NPC";
  if (typeof parsed.race !== "string") parsed.race = "";
  if (!parsed.className && parsed.class) parsed.className = String(parsed.class || "").trim();

  if (!parsed.stats && parsed.abilities) {
    parsed.stats = parsed.abilities;
  }
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
