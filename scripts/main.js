const MODULE_ID = "npc-button-5e";
const DATA_CACHE = { loaded: false };
let LOAD_PROMISE = null;
const COMPENDIUM_CACHE_FILE = "compendium-cache";
const USE_COMPENDIUM_CACHE = true;
const CACHE_DOC_TYPES = new Set(["weapon", "equipment", "loot", "consumable", "feat", "spell"]);
const COMPENDIUMS = {
  weapons: ["dnd5e.items", "dnd5e.equipment24"],
  loot: ["dnd5e.tradegoods", "dnd5e.items", "dnd5e.equipment24"],
  spells: ["dnd5e.spells", "dnd5e.spells24"],
  features: ["dnd5e.monsterfeatures", "dnd5e.monsterfeatures24", "dnd5e.classfeatures", "dnd5e.classfeatures24"],
  classFeatures: ["dnd5e.classfeatures", "dnd5e.classfeatures24"],
  species: [
    "dnd5e.species",
    "dnd5e.species24",
    "dnd5e.races",
    "laaru-dnd5-hw.races",
    "laaru-dnd5-hw.racesMPMM"
  ]
};
const TOKEN_ASSETS = [
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
const TOKEN_ROLE_MAP = {
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

function getPacks(kind) {
  return DATA_CACHE.compendiumLists?.[kind]?.length
    ? DATA_CACHE.compendiumLists[kind]
    : COMPENDIUMS[kind];
}

function getSpeciesPacks() {
  const preferred = getPacks("species") || [];
  const available = [];
  for (const name of preferred) {
    if (game.packs?.get(name)) available.push(name);
  }
  if (available.length) return available;

  const scanned = new Set();
  for (const pack of game.packs || []) {
    if (pack.documentName !== "Item") continue;
    const systemId = pack.metadata?.system;
    if (systemId && systemId !== "dnd5e") continue;
    const label = String(pack.metadata?.label || "").toLowerCase();
    const collection = String(pack.collection || "").toLowerCase();
    if (label.includes("species") || label.includes("race") || collection.includes("species") || collection.includes("race")) {
      scanned.add(pack.collection);
    }
  }
  return Array.from(scanned);
}

async function getSpeciesEntries() {
  if (DATA_CACHE.speciesEntries?.length) return DATA_CACHE.speciesEntries;
  const entries = [];
  let packNames = getSpeciesPacks();
  if (!packNames.length) {
    // Fallback: scan all Item packs and keep those containing race/species entries.
    for (const pack of game.packs || []) {
      if (pack.documentName !== "Item") continue;
      const systemId = pack.metadata?.system;
      if (systemId && systemId !== "dnd5e") continue;
      try {
        const index = await pack.getIndex({ fields: ["type", "name"] });
        if (index.some((e) => ["race", "species"].includes(String(e.type || "").toLowerCase()))) {
          packNames.push(pack.collection);
        }
      } catch {
        // ignore
      }
    }
    packNames = Array.from(new Set(packNames));
  }

  for (const packName of packNames) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    const index = await pack.getIndex({ fields: ["type", "name"] });
    const label = String(pack.metadata?.label || "").toLowerCase();
    const collection = String(pack.collection || "").toLowerCase();
    const isRacePack =
      label.includes("race") ||
      label.includes("species") ||
      collection.includes("race") ||
      collection.includes("species");
    for (const entry of index) {
      if (!entry?.name) continue;
      const type = String(entry.type || "").toLowerCase();
      if (!isRacePack && type && type !== "race" && type !== "species") continue;
      entries.push({
        key: `${pack.collection}|${entry._id}`,
        pack: pack.collection,
        _id: entry._id,
        name: entry.name
      });
    }
  }
  DATA_CACHE.speciesEntries = entries.sort((a, b) => a.name.localeCompare(b.name));
  return DATA_CACHE.speciesEntries;
}

async function getSpeciesOptions() {
  const entries = await getSpeciesEntries();
  return entries.map((e) => `<option value="${e.key}">${e.name}</option>`).join("");
}

async function buildSpeciesItem(speciesEntry) {
  if (!speciesEntry) return null;
  const pack = game.packs?.get(speciesEntry.pack);
  if (!pack) return null;
  const doc = await pack.getDocument(speciesEntry._id);
  if (!doc) return null;
  const data = cloneItemData(toItemData(doc));
  const uuid = doc.uuid || `${pack.collection}.${doc.id}`;
  data.flags = data.flags || {};
  data.flags.core = data.flags.core || {};
  if (!data.flags.core.sourceId) data.flags.core.sourceId = uuid;
  data.flags.dnd5e = data.flags.dnd5e || {};
  if (!data.flags.dnd5e.sourceId) data.flags.dnd5e.sourceId = uuid;
  return data;
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "lastFolderId", {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });
  game.settings.register(MODULE_ID, "lastSpeciesKey", {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });
  game.settings.register(MODULE_ID, "lastNpcOptions", {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });
  game.settings.register(MODULE_ID, "lastSeenVersion", {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });
});

Hooks.once("ready", () => {
  if (game.system?.id !== "dnd5e") {
    ui.notifications?.warn("NPC Button (D&D 5e) is designed for the dnd5e system.");
  }
  showChangelogIfUpdated();
});

Hooks.on("renderActorDirectory", (app, html) => {
  addNpcButton(html);
});

Hooks.on("renderSidebarTab", (app, html) => {
  const isActorsTab =
    app?.options?.id === "actors" ||
    app?.tabName === "actors" ||
    app?.tab?.id === "actors";
  if (!isActorsTab) return;
  addNpcButton(html);
});

function getActorFolderOptions() {
  const folders = (game.folders || []).filter((folder) => folder.type === "Actor");
  if (!folders.length) return "";
  const sorted = folders.slice().sort((a, b) => {
    const aName = String(a.name || "").toLowerCase();
    const bName = String(b.name || "").toLowerCase();
    return aName.localeCompare(bName);
  });
  return sorted.map((folder) => `<option value="${folder.id}">${folder.name}</option>`).join("");
}

function getLastFolderId() {
  const stored = game.settings?.get(MODULE_ID, "lastFolderId");
  if (!stored) return "";
  const folder = game.folders?.get(stored);
  return folder ? stored : "";
}

function setLastFolderId(folderId) {
  if (!game.settings) return;
  game.settings.set(MODULE_ID, "lastFolderId", folderId || "");
}

function getLastSpeciesKey() {
  return game.settings?.get(MODULE_ID, "lastSpeciesKey") || "";
}

function setLastSpeciesKey(value) {
  if (!game.settings) return;
  game.settings.set(MODULE_ID, "lastSpeciesKey", value || "");
}

function getLastNpcOptions() {
  const raw = game.settings?.get(MODULE_ID, "lastNpcOptions");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function setLastNpcOptions(options) {
  if (!game.settings) return;
  try {
    const payload = options ? JSON.stringify(options) : "";
    game.settings.set(MODULE_ID, "lastNpcOptions", payload);
  } catch {
    game.settings.set(MODULE_ID, "lastNpcOptions", "");
  }
}

function attachSpeciesSearch(searchInput, selectEl, allOptions) {
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

async function showChangelogIfUpdated() {
  if (!game.user?.isGM) return;
  const version = game.modules?.get(MODULE_ID)?.version;
  if (!version) return;
  const lastSeen = game.settings?.get(MODULE_ID, "lastSeenVersion") || "";
  if (lastSeen === version) return;

  const notes = await loadChangelogNotes(version);
  if (!notes?.length) return;

  const content = `
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      <div style="font-weight: 600;">What's new in v${version}</div>
      <ul style="margin: 0; padding-left: 1.25rem;">
        ${notes.map((line) => `<li>${line}</li>`).join("")}
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

async function loadChangelogNotes(version) {
  try {
    const response = await fetch(`modules/${MODULE_ID}/CHANGELOG.md`);
    if (!response.ok) return null;
    const text = await response.text();
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sectionMatch = text.match(
      new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, "m")
    );
    if (!sectionMatch) return null;
    const sectionText = sectionMatch[1] || "";
    const bullets = sectionText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.replace(/^-\\s+/, "").trim())
      .filter(Boolean);
    return bullets.length ? bullets : null;
  } catch {
    return null;
  }
}

function addNpcButton(html) {
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

async function openNpcDialog() {
  if (game.system?.id !== "dnd5e") {
    ui.notifications?.error("NPC Button requires the D&D 5e system.");
    return;
  }

  await loadData();

  const archetypes = DATA_CACHE.archetypes;
  if (!DATA_CACHE.speciesEntries?.length) {
    ui.notifications?.warn("NPC Button: No species compendium entries found.");
  }
  const options = archetypes
    .map((a) => `<option value="${a.id}">${a.name}</option>`)
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
            ${Object.keys(DATA_CACHE.names.cultures)
              .map((k) => `<option value="${k}">${capitalize(k)}</option>`)
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
}

async function createNpcFromForm(formData) {
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

  for (let i = 0; i < created.length; i++) {
    const actor = created[i];
    const speciesEntry = planned[i]?.speciesEntry || null;
    if (!actor || !speciesEntry) continue;

    const speciesItem = await buildSpeciesItem(speciesEntry);
    if (!speciesItem) continue;
    const createdItems = await actor.createEmbeddedDocuments("Item", [speciesItem]);
    const createdItem = createdItems?.[0] || null;
    if (!createdItem) continue;
    await actor.updateSource({ "system.details.race": createdItem.id });
    await applySpeciesTraitsToActor(actor, createdItem);
    await applySpeciesAdvancements(actor, createdItem);
  }

  if (created.length === 1) {
    ui.notifications?.info(`Created NPC: ${created[0]?.name || "Unnamed"}`);
    return;
  }
  const names = created.map((a) => a?.name).filter(Boolean);
  const preview = names.slice(0, 5).join(", ");
  const extra = names.length > 5 ? ` +${names.length - 5} more` : "";
  ui.notifications?.info(`Created ${created.length} NPCs: ${preview}${extra}`);
}

function generateNpc(options) {
  const {
    tier,
    archetype,
    culture,
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

  const name = buildUniqueName(names, culture, importantNpc, usedNames);

  const appearance = pickRandomN(traits?.appearance || [], 2 + randInt(0, 2));
  const speech = pickRandomOr(traits?.speech, "Plainspoken");
  const motivation = pickRandomOr(traits?.motivations, "Survival");
  const secret = includeSecret ? pickRandomOr(traits?.secrets, null) : null;
  const hook = includeHook ? pickRandomOr(traits?.hooks, null) : null;
  const quirk = pickRandomOr(traits?.quirks, "Unremarkable");

  const abilities = applyTierToAbilities(varyBaseAbilities(archetype.baseAbilities), tier, importantNpc);
  const prime = getPrimeAbilities(abilities);

  const ac = Math.min(20, 11 + tier + (importantNpc ? 1 : 0));
  const hp = Math.max(6, 8 + tier * 8 + randInt(0, tier * 6) + (importantNpc ? 6 : 0));
  const speed = 30;

  const prof = getProfBonus(tier);
  const cr = rollCrByTier(tier);

  const loot = includeLoot ? buildLoot(archetype, tier) : null;

  return {
    name,
    archetype,
    tier,
    cr,
    prof,
    ac,
    hp,
    speed,
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

async function buildActorData(npc, folderId = null) {
  const tokenImg = getTokenImageForNpc(npc);

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

function buildBiography(npc) {
  const lines = [];
  lines.push(`<p><strong>Role:</strong> ${npc.archetype.name} (Tier ${npc.tier}, CR ${npc.cr})</p>`);
  lines.push(`<p><strong>Race:</strong> ${npc.race}</p>`);
  lines.push(`<p><strong>Appearance:</strong> ${npc.appearance.join(", ")}</p>`);
  lines.push(`<p><strong>Speech:</strong> ${npc.speech}</p>`);
  lines.push(`<p><strong>Motivation:</strong> ${npc.motivation}</p>`);
  if (npc.secret) lines.push(`<p><strong>Secret:</strong> ${npc.secret}</p>`);
  if (npc.hook) lines.push(`<p><strong>Hook:</strong> ${npc.hook}</p>`);
  lines.push(`<p><strong>Quirk:</strong> ${npc.quirk}</p>`);
  return lines.join("\n");
}

function buildSkillsData(skillIds) {
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

async function buildWeaponItem(npc) {
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

async function buildRoleAbilityItems(npc) {
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

async function buildLootItem(name, npc) {
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

async function buildAmmoItemForWeapon(weaponItem, npc) {
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
      const qty = name.includes("crossbow") ? 20 : 20;
      data.system.quantity = qty;
    }
    return data;
  }

  return {
    name: ammoName,
    type: "consumable",
    system: { quantity: 20, description: { value: "" }, consumableType: "" }
  };
}

async function buildRandomLootExtras(npc, existingItems = []) {
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
        const name = String(entry.name || "").trim().toLowerCase();
        if (name && used.has(name)) return false;
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

function getRandomTokenImage() {
  if (!TOKEN_ASSETS.length) return "icons/svg/mystery-man.svg";
  const file = pickRandom(TOKEN_ASSETS);
  return `modules/${MODULE_ID}/assets/tokens/${file}`;
}

function getTokenImageForNpc(npc) {
  const tags = npc?.archetype?.tags || [];
  const style = npc?.archetype?.attackStyle || "";
  const candidates = [];
  for (const [role, roleTags] of Object.entries(TOKEN_ROLE_MAP)) {
    if (roleTags.some((tag) => tags.includes(tag) || tag === style)) {
      const file = TOKEN_ASSETS.find((t) => t.includes(`-${role}.`));
      if (file) candidates.push(file);
    }
  }
  if (candidates.length) {
    return `modules/${MODULE_ID}/assets/tokens/${pickRandom(candidates)}`;
  }
  return getRandomTokenImage();
}

async function applySpeciesTraitsToActor(actor, speciesItem) {
  if (!actor || !speciesItem) return;
  const update = {};

  const traits = speciesItem.system?.traits || {};
  const sensesFromItem = extractSensesFromSpeciesItem(speciesItem);
  const languagesFromItem = extractLanguagesFromSpeciesItem(speciesItem);
  const sizeFromItem =
    traits.size ||
    traits?.size?.value ||
    speciesItem.system?.size ||
    speciesItem.system?.details?.size ||
    null;
  const movementFromItem = extractMovementFromSpeciesItem(speciesItem);

  if (Object.keys(sensesFromItem).length) {
    const current = actor.system?.attributes?.senses || {};
    update["system.attributes.senses"] = { ...current, ...sensesFromItem };
  }

  if (Object.keys(movementFromItem).length) {
    const current = actor.system?.attributes?.movement || {};
    const units = current.units && String(current.units).trim() ? current.units : "ft";
    update["system.attributes.movement"] = { ...current, ...movementFromItem, units };
  }

  if (languagesFromItem.length) {
    const current = actor.system?.traits?.languages?.value || [];
    const merged = Array.from(new Set([...current, ...languagesFromItem]));
    update["system.traits.languages.value"] = merged;
  }

  if (sizeFromItem) {
    update["system.traits.size"] = sizeFromItem;
  }

  if (Object.keys(update).length) {
    await actor.updateSource(update);
  }
}

function extractSensesFromSpeciesItem(speciesItem) {
  const out = {};
  const traits = speciesItem.system?.traits || {};
  const sensesValue = traits.senses?.value || speciesItem.system?.senses || null;

  if (Array.isArray(sensesValue)) {
    for (const entry of sensesValue) {
      const parsed = parseSenseEntry(entry);
      if (parsed) out[parsed.type] = parsed.range;
    }
  } else if (typeof sensesValue === "string") {
    const parts = sensesValue.split(/[,;]+/).map((p) => p.trim());
    for (const part of parts) {
      const parsed = parseSenseEntry(part);
      if (parsed) out[parsed.type] = parsed.range;
    }
  } else if (sensesValue && typeof sensesValue === "object") {
    for (const [key, value] of Object.entries(sensesValue)) {
      if (typeof value === "number") out[key] = value;
    }
  }

  return out;
}

function extractMovementFromSpeciesItem(speciesItem) {
  const out = {};
  const move = speciesItem.system?.movement || null;
  if (move && typeof move === "object") {
    for (const [key, value] of Object.entries(move)) {
      if (key === "units" || key === "hover" || key === "ignoredDifficultTerrain") continue;
      const num = Number(value);
      if (Number.isFinite(num) && num >= 0) out[key] = num;
    }
  }
  return out;
}

function parseSenseEntry(entry) {
  if (!entry) return null;
  const str = String(entry).toLowerCase();
  const match = str.match(/(darkvision|blindsight|tremorsense|truesight)\\s*(\\d+)?/);
  if (!match) return null;
  const type = match[1];
  const range = match[2] ? Number(match[2]) : 60;
  return { type, range };
}

function extractLanguagesFromSpeciesItem(speciesItem) {
  const traits = speciesItem.system?.traits || {};
  const value = traits.languages?.value || traits.languages || [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,;]+/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

async function applySpeciesAdvancements(actor, speciesItem) {
  const advancements = speciesItem.system?.advancement;
  if (!Array.isArray(advancements) || !advancements.length) return;

  const update = {};

  for (const adv of advancements) {
    const advData = typeof adv?.toObject === "function" ? adv.toObject() : adv;
    const type = String(advData?.type || adv?.type || "").toLowerCase();

    if (type.includes("itemgrant")) {
      const uuids = collectAdvancementItemUuids(advData || adv);
      await grantItemsByUuid(actor, uuids);
      continue;
    }

    if (type.includes("itemchoice")) {
      const uuids = collectAdvancementItemUuids(advData || adv);
      if (uuids.length) {
        await grantItemsByUuid(actor, [pickRandom(uuids)]);
      }
      continue;
    }

    if (type.includes("size")) {
      const size = advData?.configuration?.size || advData?.size || advData?.value;
      if (size) update["system.traits.size"] = size;
      continue;
    }

    if (type.includes("trait")) {
      const languages = extractTraitAdvancementValues(advData || adv, "languages");
      if (languages.length) {
        const current = actor.system?.traits?.languages?.value || [];
        const merged = Array.from(new Set([...current, ...languages]));
        update["system.traits.languages.value"] = merged;
      }
      continue;
    }
  }

  if (Object.keys(update).length) {
    await actor.updateSource(update);
  }
}

function collectAdvancementItemUuids(adv) {
  const uuids = new Set();
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      if (typeof node.uuid === "string" && node.uuid.includes(".")) {
        uuids.add(node.uuid);
      }
      for (const value of Object.values(node)) {
        walk(value);
      }
      return;
    }
    if (typeof node === "string" && node.includes(".")) {
      uuids.add(node);
    }
  };

  walk(adv);
  return Array.from(uuids);
}

function extractTraitAdvancementValues(adv, key) {
  const out = [];
  const values = adv?.configuration?.traits || adv?.traits || adv?.configuration?.value || adv?.value;
  if (Array.isArray(values)) {
    for (const val of values) {
      const str = String(val);
      if (str) out.push(str);
    }
  } else if (values && typeof values === "object") {
    const list = values[key]?.value || values[key] || [];
    if (Array.isArray(list)) {
      list.forEach((v) => out.push(String(v)));
    }
  }
  return out.filter(Boolean);
}

async function grantItemsByUuid(actor, uuids) {
  if (!actor || !uuids?.length) return;
  const items = [];
  for (const uuid of uuids) {
    try {
      const normalized = normalizeUuid(uuid);
      const doc = await fromUuid(normalized);
      if (doc) items.push(doc.toObject());
    } catch {
      // ignore
    }
  }
  if (items.length) {
    await actor.createEmbeddedDocuments("Item", items);
  }
}

function normalizeUuid(uuid) {
  if (!uuid) return uuid;
  const str = String(uuid);
  if (str.startsWith("Compendium.") && !str.includes(".Item.")) {
    const parts = str.split(".");
    if (parts.length === 3) {
      return `${parts[0]}.${parts[1]}.Item.${parts[2]}`;
    }
  }
  return str;
}

function buildLoot(archetype, tier) {
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

async function getRandomItemFromPacks(packs, predicate) {
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;

    const index = await getPackIndex(pack, getItemIndexFields());
    const candidates = index.filter(predicate);
    if (!candidates.length) continue;

    const entry = pickRandom(candidates);
    const cached = getCachedDoc(pack.collection, entry._id);
    if (cached) return cached;
    return pack.getDocument(entry._id);
  }
  return null;
}

async function getRandomItemFromPacksWithBudget(packs, predicate, budget, allowMagic = false) {
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;

    const index = await getPackIndex(pack, getItemIndexFields());
    const candidates = index.filter(predicate);
    if (!candidates.length) continue;

    const entry = await pickByBudgetAsync(pack, candidates, budget, allowMagic);
    const cached = getCachedDoc(pack.collection, entry._id);
    if (cached) return cached;
    return pack.getDocument(entry._id);
  }
  return null;
}

async function getRandomItemFromAllPacksWithBudget(packs, predicate, budget, allowMagic = false) {
  const candidates = [];
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    const index = await getPackIndex(pack, getItemIndexFields());
    for (const entry of index) {
      if (predicate && !predicate(entry)) continue;
      candidates.push({ packName: pack.collection, entry });
    }
  }
  if (!candidates.length) return null;

  const priced = candidates
    .map((c) => ({ c, price: getPriceFromEntry(c.packName, c.entry) }))
    .filter((p) => Number.isFinite(p.price));

  const picked = priced.length
    ? pickByBudget(priced, budget, allowMagic, (p) => p.price)?.c
    : pickRandom(candidates);
  if (!picked) return null;
  return resolveItemFromEntry(picked.packName, picked.entry);
}

async function getRandomItemByKeywordsFromAllPacksWithBudget(
  packs,
  keywords,
  predicate,
  budget,
  allowMagic = false
) {
  const normalized = (keywords || []).map((k) => k.toLowerCase());
  const candidates = [];
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    const index = await getPackIndex(pack, getItemIndexFields());
    for (const entry of index) {
      if (predicate && !predicate(entry)) continue;
      if (normalized.length) {
        const haystack = getEntrySearchStrings(entry);
        if (!normalized.some((k) => haystack.some((h) => h.includes(k)))) continue;
      }
      candidates.push({ packName: pack.collection, entry });
    }
  }
  if (!candidates.length) return null;

  const priced = candidates
    .map((c) => ({ c, price: getPriceFromEntry(c.packName, c.entry) }))
    .filter((p) => Number.isFinite(p.price));

  const picked = priced.length
    ? pickByBudget(priced, budget, allowMagic, (p) => p.price)?.c
    : pickRandom(candidates);
  if (!picked) return null;
  return resolveItemFromEntry(picked.packName, picked.entry);
}

async function resolveItemFromEntry(packName, entry) {
  if (!entry || !packName) return null;
  const cached = getCachedDoc(packName, entry._id);
  if (cached) return cached;
  const pack = game.packs?.get(packName);
  if (!pack) return null;
  return pack.getDocument(entry._id);
}

async function getRandomItemByKeywords(packs, keywords, predicate) {
  const normalized = (keywords || []).map((k) => k.toLowerCase());
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;

    const index = await getPackIndex(pack, getItemIndexFields());
    const candidates = index.filter((entry) => {
      if (predicate && !predicate(entry)) return false;
      if (!normalized.length) return true;
      const haystack = getEntrySearchStrings(entry);
      return normalized.some((k) => haystack.some((h) => h.includes(k)));
    });
    if (!candidates.length) continue;

    const entry = pickRandom(candidates);
    const cached = getCachedDoc(pack.collection, entry._id);
    if (cached) return cached;
    return pack.getDocument(entry._id);
  }
  return null;
}

async function getRandomItemByKeywordsWithBudget(packs, keywords, predicate, budget, allowMagic = false) {
  const normalized = (keywords || []).map((k) => k.toLowerCase());
  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;

    const index = await getPackIndex(pack, getItemIndexFields());
    const candidates = index.filter((entry) => {
      if (predicate && !predicate(entry)) return false;
      if (!normalized.length) return true;
      const haystack = getEntrySearchStrings(entry);
      return normalized.some((k) => haystack.some((h) => h.includes(k)));
    });
    if (!candidates.length) continue;

    const entry = await pickByBudgetAsync(pack, candidates, budget, allowMagic);
    const cached = getCachedDoc(pack.collection, entry._id);
    if (cached) return cached;
    return pack.getDocument(entry._id);
  }
  return null;
}

async function getItemByNameFromPacks(packs, name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;

  for (const packName of packs) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;

    const index = await getPackIndex(pack, getItemIndexFields());
    const match = index.find((entry) => {
      const haystack = getEntrySearchStrings(entry);
      return haystack.includes(target);
    });
    if (!match) continue;

    const cached = getCachedDoc(pack.collection, match._id);
    if (cached) return cached;
    return pack.getDocument(match._id);
  }

  return null;
}

async function getPackIndex(pack, fields = ["type", "name"]) {
  if (!DATA_CACHE.packIndex) DATA_CACHE.packIndex = new Map();
  const key = `${pack.collection}|${fields.join(",")}`;
  if (DATA_CACHE.packIndex.has(key)) {
    return DATA_CACHE.packIndex.get(key);
  }

  const cached = getCachedPackIndex(pack);
  if (cached) {
    const wantsPrice = fields.some((f) => String(f).includes("system.price"));
    if (!wantsPrice || cachedIndexHasPrice(cached)) {
      DATA_CACHE.packIndex.set(key, cached);
      return cached;
    }
  }

  const wantsPrice = fields.some((f) => String(f).includes("system.price"));
  if (USE_COMPENDIUM_CACHE && DATA_CACHE.compendiumCache && !wantsPrice) {
    DATA_CACHE.packIndex.set(key, []);
    warnMissingCacheOnce(pack.collection);
    return [];
  }

  const index = await pack.getIndex({ fields });
  DATA_CACHE.packIndex.set(key, index);
  return index;
}

function getItemIndexFields() {
  return ["type", "name", "system.rarity", "system.price"];
}

function getBudgetRange(budget, allowMagic = false) {
  switch (budget) {
    case "poor":
      return { min: 0, max: 100 }; // up to 1 gp
    case "well":
      return { min: 50, max: 5000 }; // 0.5 gp to 50 gp
    case "elite":
      return { min: 200, max: allowMagic ? 200000 : 20000 }; // 2 gp to 200/2000 gp
    case "normal":
    default:
      return { min: 10, max: 2000 }; // 0.1 gp to 20 gp
  }
}

function isWithinBudget(entryOrDoc, budget, allowMagic = false) {
  const range = getBudgetRange(budget, allowMagic);
  const price = getItemPriceValue(entryOrDoc);
  if (price == null) return true;
  return price >= range.min && price <= range.max;
}

function pickByBudget(candidates, budget, allowMagic, priceFn) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const priced = candidates
    .map((c) => ({ c, price: priceFn(c) }))
    .filter((p) => Number.isFinite(p.price));
  if (!priced.length) return pickRandom(candidates);

  const sorted = priced.sort((a, b) => a.price - b.price);
  const n = sorted.length;
  const pickRange = (fromPct, toPct) => {
    const start = Math.max(0, Math.floor(n * fromPct));
    const end = Math.min(n - 1, Math.floor(n * toPct));
    const slice = sorted.slice(start, end + 1);
    return slice.length ? pickRandom(slice).c : sorted[Math.floor(n / 2)].c;
  };

  switch (budget) {
    case "poor":
      return pickRange(0, 0.3);
    case "well":
      return pickRange(0.6, 0.9);
    case "elite":
      return pickRange(0.8, 1.0);
    case "normal":
    default:
      return pickRange(0.3, 0.7);
  }
}

async function pickByBudgetAsync(pack, candidates, budget, allowMagic) {
  if (!Array.isArray(candidates) || !candidates.length) return null;

  const priced = [];
  for (const entry of candidates) {
    const price = getPriceFromEntry(pack.collection, entry);
    if (Number.isFinite(price)) priced.push({ c: entry, price });
  }

  if (!priced.length) {
    const sampled = await samplePricesFromDocuments(pack, candidates, 12);
    if (sampled.length) {
      const sorted = sampled.sort((a, b) => a.price - b.price);
      return pickByBudget(sorted.map((s) => s.c), budget, allowMagic, (e) => sampled.find((s) => s.c === e)?.price);
    }
    return pickRandom(candidates);
  }

  const sorted = priced.sort((a, b) => a.price - b.price);
  const justEntries = sorted.map((p) => p.c);
  return pickByBudget(justEntries, budget, allowMagic, (e) => priced.find((p) => p.c === e)?.price);
}

function getPriceFromEntry(packName, entry) {
  const direct = getItemPriceValue(entry);
  if (Number.isFinite(direct)) return direct;
  const cached = getCachedDoc(packName, entry._id);
  if (cached) return getItemPriceValue(cached);
  return null;
}

async function samplePricesFromDocuments(pack, candidates, limit = 10) {
  const sampled = [];
  const pool = candidates.slice();
  while (pool.length && sampled.length < limit) {
    const idx = Math.floor(Math.random() * pool.length);
    const entry = pool.splice(idx, 1)[0];
    try {
      const doc = await pack.getDocument(entry._id);
      const price = getItemPriceValue(doc);
      if (Number.isFinite(price)) sampled.push({ c: entry, price });
    } catch {
      // ignore
    }
  }
  return sampled;
}

function getItemPriceValue(entryOrDoc) {
  const price = entryOrDoc?.system?.price;
  if (price == null) return null;
  if (typeof price === "number") return price;
  const value = price.value ?? price;
  const denom = String(price.denomination || price.unit || "").toLowerCase();
  if (typeof value === "number") return convertToCp(value, denom);
  if (typeof value === "string") {
    const parsed = parsePriceString(value);
    if (parsed) return convertToCp(parsed.value, parsed.denom);
  }
  return null;
}

function parsePriceString(text) {
  const match = String(text).trim().toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)\s*(pp|gp|ep|sp|cp)?/);
  if (!match) return null;
  return { value: Number(match[1]), denom: match[2] || "gp" };
}

function convertToCp(value, denom) {
  const mult = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
  return Math.round((value || 0) * (mult[denom] || 100));
}

function normalizeArmorItems(items) {
  if (!Array.isArray(items) || !items.length) return;
  const armor = [];
  const shields = [];
  const rest = [];
  for (const item of items) {
    if (isArmorItem(item)) {
      if (isShieldItem(item)) shields.push(item);
      else armor.push(item);
    } else {
      rest.push(item);
    }
  }

  const pickBest = (arr) => {
    if (!arr.length) return [];
    const sorted = arr.slice().sort((a, b) => {
      const pa = getItemPriceValue(a) ?? 0;
      const pb = getItemPriceValue(b) ?? 0;
      return pb - pa;
    });
    return [sorted[0]];
  };

  const kept = [...rest, ...pickBest(armor), ...pickBest(shields)];
  items.length = 0;
  items.push(...kept);
}

function isArmorItem(item) {
  if (!item) return false;
  const type = String(item.type || "").toLowerCase();
  if (type !== "equipment") return false;
  const armorType = item.system?.armor?.type;
  if (armorType) return true;
  const typeValue = String(item.system?.type?.value || "").toLowerCase();
  if (["light", "medium", "heavy", "shield", "armor"].includes(typeValue)) return true;
  const name = String(item.name || "").toLowerCase();
  return /armor|mail|plate|chain|leather|scale|breastplate|shield|доспех|кольчуг|латы|панцир|щит/i.test(name);
}

function isShieldItem(item) {
  const armorType = item.system?.armor?.type;
  if (armorType === "shield") return true;
  const typeValue = String(item.system?.type?.value || "").toLowerCase();
  if (typeValue === "shield") return true;
  const name = String(item.name || "").toLowerCase();
  return /shield|щит/i.test(name);
}

async function buildSpellItems(npc) {
  const tags = npc.archetype.tags || [];
  const maxLevel = getMaxSpellLevelByTier(npc.tier);
  const count = getSpellCountByTier(npc.tier, npc.importantNpc);
  const keywords = getSpellKeywords(tags);

  const candidates = await getSpellCandidates(maxLevel, keywords);
  const chosen = pickRandomN(candidates, count);
  const out = [];
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
  return buildCachedSpellItemsFallback(maxLevel, keywords, count);
}

async function getSpellCandidates(maxLevel, keywords) {
  const normalized = (keywords || []).map((k) => k.toLowerCase());
  const matches = [];
  const fallback = [];

  for (const packName of getPacks("spells")) {
    const pack = game.packs?.get(packName);
    if (!pack) continue;
    const index = await getPackIndex(pack, ["type", "name", "system.level"]);
    for (const entry of index) {
      if (entry.type !== "spell") continue;
      const level = Number(entry.system?.level ?? 0);
      if (!Number.isFinite(level) || level > maxLevel) continue;
      const haystack = getEntrySearchStrings(entry);
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

async function buildFeatureItems(npc) {
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

async function buildRoleItems(npc) {
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

  // Extra class-flavored pick as a fallback for variety.
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

function getRoleItemCount(tier, importantNpc) {
  let count = 1;
  if (tier >= 2) count += 1;
  if (tier >= 3) count += 1;
  if (importantNpc) count += 1;
  return Math.min(4, Math.max(1, count));
}

function buildEquipmentKeywordPools(style, tags, className) {
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

async function pickItemFromKeywords(packs, keywords, entryPredicate, docPredicate, budget) {
  const picked = await getRandomItemByKeywordsWithBudget(packs, keywords, entryPredicate, budget);
  if (picked) return cloneItemData(toItemData(picked));
  const cached = getRandomCachedDocByKeywordsWithBudget(packs, keywords, docPredicate, budget);
  if (cached) return cloneItemData(cached);
  return null;
}

function addUniqueItem(out, added, item) {
  if (!item) return;
  const name = String(item.name || "").trim().toLowerCase();
  if (!name || added.has(name)) return;
  added.add(name);
  out.push(item);
}

function getWeaponKeywords(style, tags) {
  if (tags.includes("criminal")) {
    return ["dagger", "shortsword", "rapier", "hand crossbow", "shortbow"];
  }
  if (style === "ranged") return ["shortbow", "longbow", "crossbow", "sling"];
  if (style === "caster") return ["staff", "dagger", "wand"];
  if (style === "mixed") return ["dagger", "shortsword", "handaxe", "rapier"];
  return ["sword", "axe", "mace", "spear"];
}

function getSpellCountByTier(tier, importantNpc) {
  const base = tier <= 1 ? 2 : tier === 2 ? 3 : tier === 3 ? 4 : 5;
  return importantNpc ? base + 1 : base;
}

function getMaxSpellLevelByTier(tier) {
  if (tier <= 1) return 1;
  if (tier === 2) return 2;
  if (tier === 3) return 3;
  return 4;
}

function getSpellKeywords(tags) {
  const keywords = [];
  if (tags.includes("holy")) keywords.push("cure", "healing", "bless", "sanctuary", "guiding", "restoration", "ward");
  if (tags.includes("dark")) keywords.push("necrotic", "hex", "curse", "blight", "shadow", "fear");
  if (tags.includes("knowledge")) keywords.push("detect", "identify", "divination", "locate", "comprehend", "illusion");
  if (tags.includes("wilderness")) keywords.push("entangle", "thorn", "beast", "hunter", "wind", "ice");
  if (tags.includes("social")) keywords.push("charm", "friends", "command", "suggestion", "calm", "heroism");
  return keywords;
}

function getFeatureKeywords(tags, attackStyle) {
  const keywords = ["attack", "strike", "parry", "brute", "multiattack", "aggressive"];
  if (attackStyle === "ranged") keywords.push("archery", "aim", "sharpshooter", "sniper");
  if (attackStyle === "melee") keywords.push("cleave", "riposte", "grapple", "shield");
  if (tags.includes("criminal")) keywords.push("sneak", "backstab", "poison", "ambush", "evasion");
  if (tags.includes("wilderness")) keywords.push("hunter", "tracker", "skirmisher", "camouflage", "beast");
  if (tags.includes("law")) keywords.push("guard", "sentinel", "defense");
  return keywords;
}

function getClassForArchetype(archetype) {
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

function getClassWeaponKeywords(className) {
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

function getClassEquipmentKeywords(className) {
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

async function getArmorItemByStyle(style, tags) {
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

async function buildClassFeatureItems(npc) {
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

async function getClassFeatureCandidates(className) {
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

function toItemData(docOrData) {
  if (!docOrData) return null;
  return typeof docOrData.toObject === "function" ? docOrData.toObject() : docOrData;
}

function cloneItemData(data) {
  if (!data) return data;
  return foundry?.utils?.duplicate ? foundry.utils.duplicate(data) : JSON.parse(JSON.stringify(data));
}

function ensureActivities(item) {
  if (!item?.system) return item;
  if (item.system.activities && Object.keys(item.system.activities).length) return item;
  item.system.activities = buildBasicAbilityActivities(item.name);
  if (!item.system.activation) {
    item.system.activation = { type: "action", value: 1, condition: "" };
  }
  return item;
}

function buildBasicAbilityActivities(name, activationType = "action") {
  const id =
    foundry?.utils?.randomID?.() ||
    Math.random().toString(36).slice(2, 10);
  return {
    [id]: {
      type: "utility",
      activation: {
        type: activationType,
        value: 1,
        condition: "",
        override: false
      },
      consumption: {
        targets: [],
        scaling: { allowed: false, max: "" },
        spellSlot: true
      },
      description: { chatFlavor: "" },
      duration: {
        concentration: false,
        value: "",
        units: "inst",
        special: "",
        override: false
      },
      effects: [],
      range: { value: "", units: "ft", special: "", override: false },
      target: {
        template: {
          count: "",
          contiguous: false,
          type: "",
          size: "",
          width: "",
          height: "",
          units: "ft"
        },
        affects: { count: "", type: "self", choice: false, special: "" },
        prompt: true,
        override: false
      },
      uses: { spent: 0, recovery: [], max: "" },
      sort: 0,
      _id: id,
      name: name || "",
      flags: {},
      visibility: {
        level: {},
        requireAttunement: false,
        requireIdentification: false,
        requireMagic: false
      },
      roll: { prompt: false, visible: false }
    }
  };
}

function buildUniqueName(names, culture, importantNpc, usedNames) {
  const tries = 12;
  for (let i = 0; i < tries; i++) {
    const firstName = pickRandomOr(names?.cultures?.[culture], "Nameless");
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

function isAllowedItemEntry(entry, allowMagic = false) {
  const rarity = String(entry.system?.rarity || "").toLowerCase();
  const properties = entry.system?.properties || [];
  const isMagical = Array.isArray(properties) && properties.includes("mgc");
  if (rarity === "artifact") return false;
  if (!allowMagic) {
    if (isMagical) return false;
    if (rarity && rarity !== "none") return false;
  }
  return true;
}

function isAllowedItemDoc(doc, allowMagic = false) {
  const rarity = String(doc.system?.rarity || "").toLowerCase();
  const properties = doc.system?.properties || [];
  const isMagical = Array.isArray(properties) && properties.includes("mgc");
  if (rarity === "artifact") return false;
  if (!allowMagic) {
    if (isMagical) return false;
    if (rarity && rarity !== "none") return false;
  }
  return true;
}

function shouldAllowMagicItem(npc) {
  if (!npc) return false;
  if (npc.importantNpc) return chance(0.5);
  switch (npc.tier) {
    case 1:
      return chance(0.02);
    case 2:
      return chance(0.05);
    case 3:
      return chance(0.1);
    case 4:
      return chance(0.2);
    default:
      return false;
  }
}

function applyTierToAbilities(abilities, tier, importantNpc) {
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

function varyBaseAbilities(base) {
  const abilities = { ...base };
  const keys = Object.keys(abilities);

  // Small random jitter so NPCs aren't identical.
  for (const key of keys) {
    abilities[key] += randInt(-1, 1);
  }

  // Randomly shift a couple of points between stats.
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

  // Clamp to a sane range.
  for (const key of keys) {
    abilities[key] = Math.max(6, Math.min(18, abilities[key]));
  }

  return abilities;
}

function getPrimeAbilities(abilities) {
  return Object.entries(abilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => key);
}

function getWeaponByStyle(style) {
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

function getDamageByTier(tier, base) {
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

function getProfBonus(tier) {
  if (tier <= 2) return 2;
  if (tier === 3) return 3;
  return 4;
}

function rollCrByTier(tier) {
  const table = {
    1: ["1/8", "1/4", "1/2"],
    2: ["1", "2", "3"],
    3: ["4", "5", "6"],
    4: ["7", "8", "9", "10"]
  };
  const value = pickRandom(table[tier] || ["1"]);
  if (value.includes("/")) {
    const [num, den] = value.split("/").map((n) => Number(n));
    return den ? num / den : 0;
  }
  return Number(value) || 0;
}

function getAutoTier() {
  const pcs = game.actors?.filter((a) => a.hasPlayerOwner && a.type === "character") || [];
  if (!pcs.length) return 1;

  const levels = pcs.map((a) => getActorLevel(a)).filter((n) => Number.isFinite(n));
  const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 1;

  if (avg <= 3) return 1;
  if (avg <= 6) return 2;
  if (avg <= 10) return 3;
  return 4;
}

function getTierForLevel(level) {
  const lvl = Number(level) || 1;
  if (lvl <= 3) return 1;
  if (lvl <= 6) return 2;
  if (lvl <= 10) return 3;
  return 4;
}

function buildEncounterCount(options) {
  const partyLevel = Math.max(1, Math.min(20, Number(options?.partyLevel) || 1));
  const partySize = Math.max(1, Math.min(8, Number(options?.partySize) || 4));
  const difficulty = String(options?.difficulty || "medium").toLowerCase();

  let base = partySize;
  if (difficulty === "easy") base = Math.max(1, partySize - 1);
  if (difficulty === "hard") base = partySize + 1;
  if (difficulty === "deadly") base = partySize + 2;

  if (partyLevel >= 11) base += 1;
  if (partyLevel >= 17) base += 1;

  return Math.max(1, Math.min(12, base));
}

function buildEncounterPlan(count, options) {
  const total = Math.max(1, Number(count) || 1);
  const partyLevel = Math.max(1, Math.min(20, Number(options?.partyLevel) || 1));
  const partySize = Math.max(1, Math.min(8, Number(options?.partySize) || 4));
  const difficulty = String(options?.difficulty || "medium").toLowerCase();

  let tier = getTierForLevel(partyLevel);
  if (difficulty === "easy") tier -= 1;
  if (difficulty === "deadly") tier += 1;

  if (total >= 6) tier -= 1;
  if (total >= 10) tier -= 1;

  tier = Math.max(1, Math.min(4, tier));

  const plan = [];
  const bossCount = difficulty === "deadly" ? 1 : difficulty === "hard" ? 1 : 0;
  const bossIndex = total > 1 ? Math.floor(Math.random() * total) : 0;

  for (let i = 0; i < total; i++) {
    let entryTier = tier;
    if (total >= 4 && Math.random() < 0.35) entryTier = Math.max(1, tier - 1);
    if (total >= 6 && Math.random() < 0.2) entryTier = Math.max(1, tier - 2);
    entryTier = Math.max(1, Math.min(4, entryTier));

    const isBoss = bossCount > 0 && i === bossIndex && partySize >= 3;
    plan.push({ tier: entryTier, importantNpc: isBoss });
  }

  return plan;
}

async function ensureEncounterFolder() {
  if (!game.user?.isGM || typeof Folder?.create !== "function") return null;
  const folders = (game.folders || []).filter((folder) => folder.type === "Actor");
  const used = new Set();
  for (const folder of folders) {
    const match = String(folder.name || "").match(/^Encounter-(\d+)$/);
    if (match) used.add(Number(match[1]));
  }
  let next = 1;
  while (used.has(next)) next += 1;
  const name = `Encounter-${next}`;
  try {
    const created = await Folder.create({ name, type: "Actor" });
    return created?.id || null;
  } catch {
    return null;
  }
}

function getActorLevel(actor) {
  const level = actor.system?.details?.level ?? actor.system?.details?.cr ?? 1;
  return Number(level) || 1;
}

async function loadData() {
  if (DATA_CACHE.loaded) return;
  if (LOAD_PROMISE) return LOAD_PROMISE;

  LOAD_PROMISE = (async () => {
    const [names, traits, archetypes, abilities, loot] = await Promise.all([
      fetchJson("names"),
      fetchJson("traits"),
      fetchJson("archetypes"),
      fetchJson("loot")
    ]);

    DATA_CACHE.names = names;
    DATA_CACHE.traits = traits;
    DATA_CACHE.archetypes = archetypes;
    DATA_CACHE.loot = loot;
    DATA_CACHE.speciesEntries = await getSpeciesEntries();
    DATA_CACHE.compendiumCache = await fetchOptionalJson(COMPENDIUM_CACHE_FILE);
    DATA_CACHE.compendiumLists = DATA_CACHE.compendiumCache?.packsByType || null;
    DATA_CACHE.loaded = true;
    validateDataCache();
  })();

  LOAD_PROMISE = LOAD_PROMISE.catch((err) => {
    LOAD_PROMISE = null;
    throw err;
  });

  return LOAD_PROMISE;
}

async function fetchJson(name) {
  const response = await fetch(`modules/${MODULE_ID}/data/${name}.json`);
  if (!response.ok) throw new Error(`${MODULE_ID} | Failed to load ${name}.json`);
  return response.json();
}

async function fetchOptionalJson(name) {
  try {
    const response = await fetch(`modules/${MODULE_ID}/data/${name}.json`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function getCachedPackIndex(pack) {
  const cache = DATA_CACHE.compendiumCache;
  if (!cache?.packs) return null;
  const entry = cache.packs[pack.collection];
  if (!entry?.entries?.length) return null;
  return entry.entries;
}

function cachedIndexHasPrice(entries) {
  const sample = entries?.[0];
  if (!sample) return false;
  const price = sample.system?.price ?? sample.system?.price?.value;
  return price !== undefined && price !== null;
}

function getCachedDoc(packName, id) {
  const cache = DATA_CACHE.compendiumCache;
  if (!cache?.packs) return null;
  return cache.packs[packName]?.documents?.[id] || null;
}

function getCachedDocsForPacks(packs) {
  const cache = DATA_CACHE.compendiumCache;
  if (!cache?.packs) return [];
  const out = [];
  for (const packName of packs) {
    const docs = cache.packs[packName]?.documents;
    if (!docs) continue;
    for (const doc of Object.values(docs)) out.push(doc);
  }
  return out;
}

function getCachedDocByName(packs, name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;
  const docs = getCachedDocsForPacks(packs);
  return docs.find((doc) => getDocSearchStrings(doc).includes(target)) || null;
}

function getRandomCachedDocByKeywords(packs, keywords, predicate) {
  const normalized = (keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
  const docs = getCachedDocsForPacks(packs).filter((doc) => !predicate || predicate(doc));
  if (!docs.length) return null;
  if (!normalized.length) return pickRandom(docs);
  const matches = docs.filter((doc) => {
    const haystack = getDocSearchStrings(doc);
    return normalized.some((k) => haystack.some((h) => h.includes(k)));
  });
  return matches.length ? pickRandom(matches) : pickRandom(docs);
}

function getRandomCachedDocByKeywordsWithBudget(packs, keywords, predicate, budget, allowMagic = false) {
  const normalized = (keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
  let docs = getCachedDocsForPacks(packs).filter((doc) => !predicate || predicate(doc));
  if (!docs.length) return null;
  if (normalized.length) {
    docs = docs.filter((doc) => {
      const haystack = getDocSearchStrings(doc);
      return normalized.some((k) => haystack.some((h) => h.includes(k)));
    });
  }
  if (!docs.length) return null;
  return pickByBudget(docs, budget, allowMagic, getItemPriceValue);
}

function getDocSearchStrings(doc) {
  const out = new Set();
  const add = (value) => {
    if (!value) return;
    const str = String(value).trim().toLowerCase();
    if (str) out.add(str);
  };

  add(doc.name);
  add(doc.originalName);
  add(doc.flags?.babele?.originalName);
  add(doc.system?.identifier);
  return Array.from(out);
}

function buildCachedSpellItemsFallback(maxLevel, keywords, count) {
  const normalized = (keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
  const docs = getCachedDocsForPacks(getPacks("spells")).filter((doc) => doc.type === "spell");
  if (!docs.length) return [];

  const byLevel = docs.filter((doc) => {
    const level = Number(doc.system?.level ?? 0);
    return Number.isFinite(level) && level <= maxLevel;
  });

  const pool = byLevel.length ? byLevel : docs;
  const matches = normalized.length
    ? pool.filter((doc) => normalized.some((k) => getDocSearchStrings(doc).some((h) => h.includes(k))))
    : pool;

  const picked = pickRandomN(matches.length ? matches : pool, count);
  return picked.map((doc) => cloneItemData(doc));
}

function getEntrySearchStrings(entry) {
  const out = new Set();
  const add = (value) => {
    if (!value) return;
    const str = String(value).trim().toLowerCase();
    if (str) out.add(str);
  };

  add(entry.name);
  add(entry.originalName);
  add(entry.flags?.babele?.originalName);
  add(entry.system?.identifier);
  return Array.from(out);
}

function warnMissingCacheOnce(packName) {
  if (!DATA_CACHE.cacheWarnings) DATA_CACHE.cacheWarnings = new Set();
  if (DATA_CACHE.cacheWarnings.has(packName)) return;
  DATA_CACHE.cacheWarnings.add(packName);
  // Silenced: cache may intentionally omit optional packs.
}

function collectAllItemPackNames() {
  const names = new Set();
  for (const pack of game.packs || []) {
    if (pack.documentName !== "Item") continue;
    const systemId = pack.metadata?.system;
    if (systemId && systemId !== "dnd5e") continue;
    names.add(pack.collection);
  }
  return names;
}

function buildPacksByType(packs) {
  const packsByType = {
    weapons: [],
    loot: [],
    spells: [],
    features: [],
    classFeatures: []
  };

  for (const [packName, packData] of Object.entries(packs)) {
    const entries = packData.entries || [];
    let hasWeapon = false;
    let hasLoot = false;
    let hasSpell = false;
    let hasFeat = false;

    for (const entry of entries) {
      if (entry.type === "weapon" || entry.type === "equipment") hasWeapon = true;
      if (entry.type === "loot" || entry.type === "consumable" || entry.type === "equipment") hasLoot = true;
      if (entry.type === "spell") hasSpell = true;
      if (entry.type === "feat") hasFeat = true;
    }

    if (hasWeapon) packsByType.weapons.push(packName);
    if (hasLoot) packsByType.loot.push(packName);
    if (hasSpell) packsByType.spells.push(packName);
    if (hasFeat) packsByType.features.push(packName);

    const label = String(packData.label || "").toLowerCase();
    if (hasFeat && (packName.includes("class") || label.includes("class") || label.includes("класс"))) {
      packsByType.classFeatures.push(packName);
    }
  }

  if (!packsByType.classFeatures.length) {
    packsByType.classFeatures = [...packsByType.features];
  }

  return packsByType;
}

async function buildCompendiumCache() {
  if (!game.user?.isGM) {
    ui.notifications?.warn("NPC Button: GM only.");
    return;
  }

  const packNames = new Set();
  Object.values(COMPENDIUMS).forEach((list) => {
    if (Array.isArray(list)) list.forEach((name) => packNames.add(name));
  });
  collectAllItemPackNames().forEach((name) => packNames.add(name));

  const fields = [
    "type",
    "name",
    "system.rarity",
    "system.properties",
    "system.requirements",
    "system.level",
    "system.price"
  ];

  const output = {
    generatedAt: new Date().toISOString(),
    packs: {},
    packsByType: {}
  };

  for (const packName of packNames) {
    const pack = game.packs?.get(packName);
    if (!pack) {
      ui.notifications?.warn(`NPC Button: pack not found: ${packName}`);
      continue;
    }
    const index = await pack.getIndex({ fields });
    const documents = {};
    try {
      const docs = await pack.getDocuments();
      for (const doc of docs) {
        if (CACHE_DOC_TYPES.has(doc.type)) {
          documents[doc.id] = doc.toObject();
        }
      }
    } catch (err) {
      console.warn(`NPC Button: failed to read documents for ${packName}`, err);
    }
    output.packs[pack.collection] = {
      label: pack.title,
      documentName: pack.documentName,
      entries: index,
      documents
    };
  }
  output.packsByType = buildPacksByType(output.packs);

  const data = JSON.stringify(output, null, 2);
  const file = new File([data], `${COMPENDIUM_CACHE_FILE}.json`, {
    type: "application/json"
  });

  try {
    await FilePicker.upload("data", `modules/${MODULE_ID}/data`, file, {}, { notify: true });
    DATA_CACHE.compendiumCache = output;
    DATA_CACHE.compendiumLists = output.packsByType;
    DATA_CACHE.packIndex = new Map();
    ui.notifications?.info("NPC Button: Compendium cache built.");
  } catch (err) {
    console.error(err);
    ui.notifications?.error("NPC Button: Failed to write compendium cache.");
  }
}

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  const out = Array.isArray(arr) ? [...arr] : [];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandomN(arr, n) {
  if (!arr || !arr.length) return [];
  if (arr.length <= n) return [...arr];
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function pickRandomOr(arr, fallback) {
  const value = pickRandom(arr);
  return value === null ? fallback : value;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(probability) {
  return Math.random() < probability;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function validateDataCache() {
  const problems = [];
  if (!DATA_CACHE.names?.cultures || !Object.keys(DATA_CACHE.names.cultures).length) {
    problems.push("names.cultures");
  }
  if (!Array.isArray(DATA_CACHE.names?.surnames) || !DATA_CACHE.names.surnames.length) {
    problems.push("names.surnames");
  }
  if (!Array.isArray(DATA_CACHE.traits?.appearance) || !DATA_CACHE.traits.appearance.length) {
    problems.push("traits.appearance");
  }
  if (!Array.isArray(DATA_CACHE.archetypes) || !DATA_CACHE.archetypes.length) {
    problems.push("archetypes");
  }

  if (problems.length) {
    ui.notifications?.warn(
      `NPC Button: Missing or empty data (${problems.join(", ")}). Using fallbacks where possible.`
    );
  }
}
