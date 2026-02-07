import { MODULE_ID } from "./constants.js";
import { registerOpenAiSettings } from "./openai.js";
import { addNpcButton, showChangelogIfUpdated } from "./ui.js";

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
