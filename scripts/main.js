import { MODULE_ID } from "./constants.js";
import { t } from "./i18n.js";
import { registerOpenAiSettings } from "./openai.js";
import { addNpcButton, showChangelogIfUpdated } from "./ui.js";

let npcButtonObserver = null;
let ensureButtonTimeout = null;
let queuedEnsureContext = null;
const ENSURE_BUTTON_DEBOUNCE_MS = 60;
const ACTORS_ROOT_SELECTOR = ".sidebar-tab[data-tab='actors'], [data-tab='actors'], #actors, .sidebar-tab.actors, .tab.actors";

function isActorsSidebarNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const element = /** @type {Element} */ (node);
  if (element.matches?.(ACTORS_ROOT_SELECTOR)) return true;
  if (element.closest?.(ACTORS_ROOT_SELECTOR)) return true;
  if (element.querySelector?.(ACTORS_ROOT_SELECTOR)) return true;
  return false;
}

function mutationsTouchActorsSidebar(mutations) {
  for (const mutation of mutations || []) {
    if (isActorsSidebarNode(mutation?.target)) return true;
    for (const addedNode of mutation?.addedNodes || []) {
      if (isActorsSidebarNode(addedNode)) return true;
    }
    for (const removedNode of mutation?.removedNodes || []) {
      if (isActorsSidebarNode(removedNode)) return true;
    }
  }
  return false;
}

function scheduleEnsureNpcButton(contextHtml = null, options = {}) {
  if (contextHtml) queuedEnsureContext = contextHtml;
  if (ensureButtonTimeout !== null) return;

  const immediate = options?.immediate === true;
  const delay = immediate ? 0 : ENSURE_BUTTON_DEBOUNCE_MS;
  ensureButtonTimeout = setTimeout(() => {
    ensureButtonTimeout = null;
    const context = queuedEnsureContext;
    queuedEnsureContext = null;
    ensureNpcButtonInActorsSidebar(context);
  }, delay);
}

function ensureNpcButtonInActorsSidebar(contextHtml = null) {
  const resolveActorsRoots = (source) => {
    const roots = [];
    const $source = source?.jquery ? source : $(source);
    if (!$source?.length) return roots;

    if ($source.is(ACTORS_ROOT_SELECTOR)) roots.push($source.first());
    const nested = $source.find(ACTORS_ROOT_SELECTOR).toArray();
    for (const entry of nested) roots.push($(entry));
    return roots;
  };

  const targets = [];
  const contextRoots = resolveActorsRoots(contextHtml);
  for (const root of contextRoots) targets.push(root);

  if (!contextRoots.length) {
    const globalCandidates = [
      $("#sidebar"),
      $("#sidebar .app.sidebar"),
      $("#ui-right")
    ];
    for (const candidate of globalCandidates) {
      for (const root of resolveActorsRoots(candidate)) targets.push(root);
    }
  }

  const seen = new Set();
  for (const target of targets) {
    const node = target?.[0];
    if (!node) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    try {
      addNpcButton(target);
    } catch (err) {
      console.warn(`${MODULE_ID}: failed to add sidebar button`, err);
    }
  }
}

Hooks.once("init", () => {
  registerOpenAiSettings();

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
    ui.notifications?.warn(t("main.warnWrongSystem"));
  }
  showChangelogIfUpdated();
  scheduleEnsureNpcButton(null, { immediate: true });
  setTimeout(() => scheduleEnsureNpcButton(), 250);
  setTimeout(() => scheduleEnsureNpcButton(), 1000);

  if (!npcButtonObserver) {
    const sidebar = document.querySelector("#sidebar");
    if (sidebar && typeof MutationObserver !== "undefined") {
      npcButtonObserver = new MutationObserver((mutations) => {
        if (!mutationsTouchActorsSidebar(mutations)) return;
        scheduleEnsureNpcButton();
      });
      npcButtonObserver.observe(sidebar, { childList: true, subtree: true });
    }
  }
});

Hooks.on("renderActorDirectory", (app, html) => {
  scheduleEnsureNpcButton(html);
});

Hooks.on("renderDocumentDirectory", (app, html) => {
  const isActorDirectory =
    app?.documentName === "Actor" ||
    app?.collection?.documentName === "Actor" ||
    app?.options?.id === "actors";
  if (!isActorDirectory) return;
  scheduleEnsureNpcButton(html);
});

Hooks.on("renderSidebarTab", (app, html) => {
  const isActorsTab =
    app?.options?.id === "actors" ||
    app?.tabName === "actors" ||
    app?.tab?.id === "actors";
  if (!isActorsTab) return;
  scheduleEnsureNpcButton(html);
});

Hooks.on("changeSidebarTab", (app, tab) => {
  const tabId = String(tab || "").trim().toLowerCase();
  if (tabId !== "actors") return;
  scheduleEnsureNpcButton(null, { immediate: true });
});
