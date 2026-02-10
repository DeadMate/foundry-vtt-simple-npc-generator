/**
 * NPC dialog HTML template builder
 * @module ui-dialog-template
 */

/**
 * Build NPC generator dialog content HTML
 * @param {Object} params
 * @param {string} params.archetypeOptionsHtml - Rendered archetype options
 * @param {string} params.cultureOptionsHtml - Rendered culture options
 * @param {string} params.folderOptionsHtml - Rendered actor folder options
 * @param {string} params.speciesOptionsHtml - Rendered species options
 * @param {boolean} params.aiReady - Whether AI is configured for current GM client
 * @param {(key:string, fallback?:string)=>string} params.i18nHtml - Escaped i18n getter
 * @returns {string}
 */
export function buildNpcDialogContent({
  archetypeOptionsHtml,
  cultureOptionsHtml,
  folderOptionsHtml,
  speciesOptionsHtml,
  aiReady,
  i18nHtml
}) {
  return `
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
        grid-template-columns: repeat(3, minmax(0, 1fr));
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
      .npc-btn-checks--single { grid-template-columns: 1fr; }
      .npc-btn-shell .checkbox {
        display: flex;
        align-items: flex-start;
        gap: 0.45rem;
        line-height: 1.25;
      }
      .npc-btn-shell .checkbox input[type="checkbox"] {
        flex: 0 0 auto;
        margin: 0.12rem 0 0;
      }
      .npc-btn-note {
        margin: 0;
        font-size: 0.78rem;
        line-height: 1.3;
        color: #c9d8f6;
      }
      .npc-btn-shell .checkbox { color: #edf2ff; }
      .npc-btn-shop-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.4rem;
      }
      .npc-btn-shop-actions button {
        min-height: 2rem;
        white-space: normal;
        line-height: 1.2;
        font-size: 0.78rem;
      }
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
        .npc-btn-shop-actions,
        .npc-btn-ai-actions,
        .npc-btn-ai-options { grid-template-columns: 1fr; }
      }
    </style>
    <form class="npc-btn-form">
      <input type="hidden" name="encounterMode" value="main">
      <input type="hidden" name="shopImportPayload" value="">
      <div class="npc-btn-shell">
        <div class="npc-btn-hero">
          <div>
            <strong>${i18nHtml("ui.dialog.heroTitle")}</strong>
            <small>${i18nHtml("ui.dialog.heroSubtitle")}</small>
          </div>
          <span class="npc-btn-badge">${i18nHtml("ui.dialog.badgeDnd5e")}</span>
        </div>

        <div class="npc-btn-tabs">
          <button type="button" data-tab="main" class="active">${i18nHtml("ui.dialog.tabMainNpc")}</button>
          <button type="button" data-tab="encounter">${i18nHtml("ui.dialog.tabEncounter")}</button>
          <button type="button" data-tab="shop">${i18nHtml("ui.dialog.tabShop")}</button>
        </div>

        <div data-tab-panel="main" class="npc-btn-panel">
          <div class="npc-btn-grid">
            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardCoreSetup")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldArchetype")}</span>
                <div class="npc-btn-row">
                  <select name="archetype">
                    <option value="random">${i18nHtml("common.random")}</option>
                    ${archetypeOptionsHtml}
                  </select>
                  <button type="button" class="npc-btn-roll" data-action="roll-archetype" title="${i18nHtml("ui.dialog.rollArchetypeTitle")}">🎲</button>
                </div>
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldDifficultyTier")}</span>
                <select name="tier">
                  <option value="auto">${i18nHtml("ui.dialog.tierAutoPartyLevel")}</option>
                  <option value="1">${i18nHtml("ui.dialog.tier1")}</option>
                  <option value="2">${i18nHtml("ui.dialog.tier2")}</option>
                  <option value="3">${i18nHtml("ui.dialog.tier3")}</option>
                  <option value="4">${i18nHtml("ui.dialog.tier4")}</option>
                </select>
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldBudget")}</span>
                <select name="budget">
                  <option value="poor">${i18nHtml("ui.dialog.budgetPoor")}</option>
                  <option value="normal" selected>${i18nHtml("ui.dialog.budgetNormal")}</option>
                  <option value="well">${i18nHtml("ui.dialog.budgetWellOff")}</option>
                  <option value="elite">${i18nHtml("ui.dialog.budgetElite")}</option>
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardIdentity")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldCulture")}</span>
                <select name="culture">
                  <option value="random">${i18nHtml("common.random")}</option>
                  ${cultureOptionsHtml}
                </select>
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldGender")}</span>
                <select name="gender">
                  <option value="random">${i18nHtml("common.random")}</option>
                  <option value="male">${i18nHtml("ui.dialog.genderMale")}</option>
                  <option value="female">${i18nHtml("ui.dialog.genderFemale")}</option>
                </select>
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldRace")}</span>
                <input type="text" name="speciesSearch" placeholder="${i18nHtml("ui.dialog.searchRacePlaceholder")}" />
                <select name="species">
                  <option value="random">${i18nHtml("common.random")}</option>
                  ${speciesOptionsHtml}
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardOutput")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldCount")}</span>
                <div class="npc-btn-row">
                  <button type="button" class="npc-btn-stepper" data-npc-count="minus">-</button>
                  <input type="number" name="count" value="1" min="1" max="50" style="text-align: center;">
                  <button type="button" class="npc-btn-stepper" data-npc-count="plus">+</button>
                </div>
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldFolder")}</span>
                <select name="folder">
                  <option value="">${i18nHtml("common.none")}</option>
                  ${folderOptionsHtml}
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardAddons")}</h3>
              <div class="npc-btn-checks">
                <label class="checkbox"><input type="checkbox" name="includeLoot" checked> ${i18nHtml("ui.dialog.addonLoot")}</label>
                <label class="checkbox"><input type="checkbox" name="includeSecret" checked> ${i18nHtml("ui.dialog.addonSecret")}</label>
                <label class="checkbox"><input type="checkbox" name="includeHook" checked> ${i18nHtml("ui.dialog.addonQuestHook")}</label>
                <label class="checkbox"><input type="checkbox" name="importantNpc"> ${i18nHtml("ui.dialog.addonBoss")}</label>
              </div>
              <p class="npc-btn-note">${i18nHtml("ui.dialog.noteBoss")}</p>
            </section>
          </div>
        </div>

        <div data-tab-panel="encounter" class="npc-btn-panel" style="display: none;">
          <div class="npc-btn-grid">
            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardEncounterTemplate")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldEncounterRace")}</span>
                <input type="text" name="encounterSpeciesSearch" placeholder="${i18nHtml("ui.dialog.searchRacePlaceholder")}" />
                <select name="encounterSpecies">
                  <option value="random">${i18nHtml("common.random")}</option>
                  ${speciesOptionsHtml}
                </select>
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldEncounterArchetype")}</span>
                <select name="encounterArchetype">
                  <option value="random">${i18nHtml("common.random")}</option>
                  ${archetypeOptionsHtml}
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardPartyBalance")}</h3>
              <div class="npc-btn-row">
                <label class="npc-btn-field">
                  <span>${i18nHtml("ui.dialog.fieldPartyLevel")}</span>
                  <input type="number" name="partyLevel" value="3" min="1" max="20">
                </label>
                <label class="npc-btn-field">
                  <span>${i18nHtml("ui.dialog.fieldPartySize")}</span>
                  <input type="number" name="partySize" value="4" min="1" max="8">
                </label>
              </div>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldDifficulty")}</span>
                <select name="encounterDifficulty">
                  <option value="easy">${i18nHtml("ui.dialog.difficultyEasy")}</option>
                  <option value="medium" selected>${i18nHtml("ui.dialog.difficultyMedium")}</option>
                  <option value="hard">${i18nHtml("ui.dialog.difficultyHard")}</option>
                  <option value="deadly">${i18nHtml("ui.dialog.difficultyDeadly")}</option>
                </select>
              </label>
              <p class="npc-btn-note">${i18nHtml("ui.dialog.noteEncounterCountAuto")}</p>
            </section>

            <section class="npc-btn-card npc-btn-span-2">
              <h3>${i18nHtml("ui.dialog.cardEncounterNotes")}</h3>
              <p class="npc-btn-note">
                ${i18nHtml("ui.dialog.noteEncounterFolderAuto")}
              </p>
            </section>
          </div>
        </div>

        <div data-tab-panel="shop" class="npc-btn-panel" style="display: none;">
          <div class="npc-btn-grid">
            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardShopType")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldShopType")}</span>
                <select name="shopType">
                  <option value="market">${i18nHtml("ui.dialog.shopTypeMarket")}</option>
                  <option value="general">${i18nHtml("ui.dialog.shopTypeGeneral")}</option>
                  <option value="alchemy">${i18nHtml("ui.dialog.shopTypeAlchemy")}</option>
                  <option value="scrolls">${i18nHtml("ui.dialog.shopTypeScrolls")}</option>
                  <option value="weapons">${i18nHtml("ui.dialog.shopTypeWeapons")}</option>
                  <option value="armor">${i18nHtml("ui.dialog.shopTypeArmor")}</option>
                  <option value="food">${i18nHtml("ui.dialog.shopTypeFood")}</option>
                </select>
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldShopName")}</span>
                <input type="text" name="shopName" placeholder="${i18nHtml("ui.dialog.shopNamePlaceholder")}">
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardShopStock")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldShopItemCount")}</span>
                <input type="number" name="shopCount" value="12" min="1" max="60">
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldShopBudget")}</span>
                <select name="shopBudget">
                  <option value="poor">${i18nHtml("ui.dialog.budgetPoor")}</option>
                  <option value="normal" selected>${i18nHtml("ui.dialog.budgetNormal")}</option>
                  <option value="well">${i18nHtml("ui.dialog.budgetWellOff")}</option>
                  <option value="elite">${i18nHtml("ui.dialog.budgetElite")}</option>
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardShopOutput")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldShopkeeperTier")}</span>
                <select name="shopkeeperTier">
                  <option value="1">T1</option>
                  <option value="2">T2</option>
                  <option value="3">T3</option>
                  <option value="4">T4</option>
                </select>
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldShopFolder")}</span>
                <select name="shopFolder">
                  <option value="">${i18nHtml("common.none")}</option>
                  ${folderOptionsHtml}
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardShopOptions")}</h3>
              <div class="npc-btn-checks npc-btn-checks--single">
                <label class="checkbox"><input type="checkbox" name="shopAllowMagic" checked> ${i18nHtml("ui.dialog.shopOptionAllowMagic")}</label>
              </div>
              <p class="npc-btn-note">${i18nHtml("ui.dialog.noteShopSummary")}</p>
            </section>
          </div>
        </div>

        <section class="npc-btn-card npc-btn-ai-group" data-ai-section>
          <div class="npc-btn-ai-top">
            <h3>${i18nHtml("ui.dialog.cardAiTools")}</h3>
            <label class="checkbox"><input type="checkbox" name="useAi"> ${i18nHtml("ui.dialog.useAiOpenAi")}</label>
          </div>
          <div class="npc-btn-ai-controls" data-ai-controls>
            <div class="npc-btn-ai-actions" data-ai-npc-actions>
              <button type="button" data-action="open-ai-key">${i18nHtml("ui.dialog.aiSetApiKey")}</button>
              <button type="button" data-action="copy-ai-prompt">${i18nHtml("ui.dialog.aiCopyPrompt")}</button>
              <button type="button" data-action="import-ai-json">${i18nHtml("ui.dialog.aiImportJson")}</button>
            </div>
            <div class="npc-btn-ai-actions" data-ai-shop-actions style="display:none;">
              <button type="button" data-action="shop-copy-prompt">${i18nHtml("ui.dialog.shopCopyPrompt")}</button>
              <button type="button" data-action="shop-import-json">${i18nHtml("ui.dialog.shopImportJson")}</button>
            </div>
            <div class="npc-btn-ai-options" data-ai-npc-options>
              <label class="checkbox">
                <input type="checkbox" name="includeAiFlavor" ${aiReady ? "" : "disabled"}>
                ${i18nHtml("ui.dialog.aiFlavorText")}
              </label>
              <label class="checkbox">
                <input type="checkbox" name="includeAiToken" ${aiReady ? "" : "disabled"}>
                ${i18nHtml("ui.dialog.aiTokenImage")}
              </label>
            </div>
            <p class="npc-btn-note" data-ai-npc-note>
              ${aiReady
                ? i18nHtml("ui.dialog.aiConfiguredForClient")
                : i18nHtml("ui.dialog.aiSetKeyInSettings")}
            </p>
            <p class="npc-btn-note" data-ai-npc-note>
              <strong>${i18nHtml("ui.dialog.buttonCreateAiNpc")}</strong> ${i18nHtml("ui.dialog.aiCreateNpcNote")}
            </p>
          </div>
        </section>
      </div>
    </form>
  `;
}
