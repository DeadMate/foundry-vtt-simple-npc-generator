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
      @keyframes npc-btn-rise {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes npc-btn-shine {
        from { transform: translateX(-70%); opacity: 0; }
        45% { opacity: 0.5; }
        to { transform: translateX(140%); opacity: 0; }
      }

      .npc-btn-dialog-app .window-header {
        border: none;
        border-radius: 14px 14px 0 0;
        background: linear-gradient(125deg, #20222c, #101319);
        color: #f7e8c8;
      }
      .npc-btn-dialog-app .window-content {
        border-radius: 0 0 14px 14px;
        background:
          radial-gradient(circle at 0% 0%, rgba(123, 185, 244, 0.12), transparent 28%),
          radial-gradient(circle at 100% 0%, rgba(255, 188, 98, 0.12), transparent 28%),
          linear-gradient(165deg, #0d1218, #171f2b);
      }

      .npc-btn-form {
        display: flex;
        flex-direction: column;
        gap: 0.82rem;
        max-height: min(80vh, 920px);
        overflow: auto;
        padding-right: 0.15rem;
        scrollbar-gutter: stable;
      }
      .npc-btn-form::-webkit-scrollbar { width: 8px; }
      .npc-btn-form::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: linear-gradient(180deg, #e1b873, #8f6233);
      }

      .npc-btn-shell {
        --paper-0: #f4ead7;
        --paper-1: #e5d1af;
        --paper-line: rgba(88, 64, 34, 0.08);
        --ink-main: #2b2014;
        --ink-soft: #5a4530;
        --gold: #d59a4a;
        --gold-soft: #f2d39f;
        --obsidian-0: #121823;
        --obsidian-1: #1d2838;

        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        padding: 0.95rem;
        border-radius: 16px;
        border: 1px solid rgba(223, 182, 118, 0.4);
        color: #f6efdf;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.52);
        background:
          radial-gradient(circle at 8% -6%, rgba(105, 170, 242, 0.22), transparent 28%),
          radial-gradient(circle at 100% 0%, rgba(241, 175, 89, 0.2), transparent 24%),
          linear-gradient(165deg, var(--obsidian-0), var(--obsidian-1));
        animation: npc-btn-rise 240ms ease-out;
      }
      .npc-btn-shell,
      .npc-btn-shell label,
      .npc-btn-shell span,
      .npc-btn-shell p,
      .npc-btn-shell h3,
      .npc-btn-shell small,
      .npc-btn-shell strong { color: #f6efdf; }

      .npc-btn-hero {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.7rem;
        padding: 0.8rem 0.9rem;
        border-radius: 12px;
        border: 1px solid rgba(229, 190, 132, 0.44);
        background: linear-gradient(130deg, rgba(30, 38, 52, 0.82), rgba(16, 21, 31, 0.95));
        overflow: hidden;
      }
      .npc-btn-hero::after {
        content: "";
        position: absolute;
        inset: 0 auto 0 -40%;
        width: 30%;
        background: linear-gradient(95deg, transparent, rgba(255, 255, 255, 0.16), transparent);
        animation: npc-btn-shine 2.8s ease-out 0.3s 1;
      }
      .npc-btn-hero strong {
        display: block;
        margin: 0 0 0.1rem;
        font-family: "Cinzel", "Trajan Pro", "Georgia", serif;
        font-size: 1.08rem;
        letter-spacing: 0.04em;
      }
      .npc-btn-hero small {
        display: block;
        color: #d8c8ac;
        line-height: 1.25;
      }
      .npc-btn-badge {
        font-family: "Cinzel", "Trajan Pro", serif;
        font-size: 0.7rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        font-weight: 700;
        border-radius: 999px;
        padding: 0.28rem 0.58rem;
        color: #2f1f0d;
        background: linear-gradient(180deg, #f8d7a0, #cc8e41);
        border: 1px solid rgba(255, 225, 169, 0.76);
      }

      .npcx-workspace {
        display: grid;
        grid-template-columns: 13.2rem minmax(0, 1fr);
        gap: 0.8rem;
        min-height: 0;
      }
      .npcx-sidebar {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        min-width: 0;
      }
      .npcx-stage {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .npcx-sidebar-card {
        border: 1px solid rgba(217, 174, 106, 0.35);
        border-radius: 10px;
        padding: 0.55rem 0.62rem;
        background: linear-gradient(180deg, rgba(35, 44, 58, 0.86), rgba(22, 29, 40, 0.92));
      }
      .npcx-sidebar-card strong {
        display: block;
        margin: 0 0 0.2rem;
        font-family: "Cinzel", "Trajan Pro", serif;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        font-size: 0.7rem;
      }
      .npcx-sidebar-card p {
        margin: 0;
        color: #ccbaa0;
        font-size: 0.74rem;
        line-height: 1.3;
      }

      .npc-btn-tabs {
        display: flex;
        flex-direction: column;
        gap: 0.42rem;
      }
      .npc-btn-tabs button {
        width: 100%;
        margin: 0;
        border-radius: 9px;
        border: 1px solid rgba(210, 170, 111, 0.5);
        padding: 0.56rem 0.58rem;
        text-align: left;
        color: #ead7ba;
        background: linear-gradient(180deg, rgba(44, 57, 76, 0.92), rgba(26, 34, 48, 0.92));
        font-family: "Cinzel", "Trajan Pro", serif;
        font-size: 0.68rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        transition: transform 120ms ease, filter 120ms ease, border-color 120ms ease;
      }
      .npc-btn-tabs button:hover {
        transform: translateX(2px);
        filter: brightness(1.08);
        border-color: rgba(249, 218, 164, 0.8);
      }
      .npc-btn-tabs button.active {
        color: #2f210f;
        background: linear-gradient(180deg, #f3cf96, #d79948);
        border-color: rgba(255, 232, 189, 0.86);
      }

      .npc-btn-tools-strip {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.4rem;
        padding: 0.56rem 0.62rem;
        border-radius: 10px;
        border: 1px solid rgba(212, 171, 109, 0.34);
        background: linear-gradient(180deg, rgba(25, 33, 47, 0.92), rgba(18, 24, 35, 0.94));
      }
      .npc-btn-tools-strip .checkbox {
        margin: 0;
        font-size: 0.82rem;
      }

      .npc-btn-panel {
        display: flex;
        flex-direction: column;
        gap: 0.72rem;
        animation: npc-btn-rise 220ms ease-out;
      }
      .npc-btn-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.7rem;
        align-items: start;
      }
      .npc-btn-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        border-radius: 12px;
        border: 1px solid rgba(162, 119, 60, 0.42);
        padding: 0.74rem;
        background:
          linear-gradient(176deg, var(--paper-0), var(--paper-1)),
          repeating-linear-gradient(0deg, var(--paper-line) 0, var(--paper-line) 1px, transparent 1px, transparent 6px);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.2);
      }
      .npc-btn-span-2 { grid-column: 1 / -1; }
      .npc-btn-card,
      .npc-btn-card label,
      .npc-btn-card span,
      .npc-btn-card p,
      .npc-btn-card h3,
      .npc-btn-card small,
      .npc-btn-card strong { color: var(--ink-main); }
      .npc-btn-card h3 {
        margin: 0;
        font-family: "Cinzel", "Trajan Pro", serif;
        font-size: 0.71rem;
        letter-spacing: 0.13em;
        text-transform: uppercase;
        color: #4b341a;
      }

      .npc-btn-field { display: flex; flex-direction: column; gap: 0.24rem; min-width: 0; }
      .npc-btn-field > span {
        font-size: 0.69rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink-soft);
        font-weight: 600;
      }
      .npc-btn-row { display: flex; gap: 0.42rem; align-items: center; min-width: 0; }
      .npc-btn-row > * { flex: 1; min-width: 0; }
      .npc-btn-row .npc-btn-roll,
      .npc-btn-row .npc-btn-stepper {
        flex: 0 0 auto;
        width: 2.1rem;
        padding: 0;
      }

      .npc-btn-field select,
      .npc-btn-field input[type="text"],
      .npc-btn-field input[type="number"],
      .npc-btn-field textarea {
        width: 100%;
        box-sizing: border-box;
        min-height: 2.04rem;
        border-radius: 9px;
        border: 1px solid rgba(123, 91, 56, 0.46);
        padding: 0.36rem 0.52rem;
        color: #302112;
        background: rgba(255, 249, 237, 0.94);
        font-family: "Spectral", "Georgia", serif;
      }
      .npc-btn-field textarea {
        min-height: 5.3rem;
        resize: vertical;
        line-height: 1.32;
      }
      .npc-btn-field select option,
      .npc-btn-field select optgroup {
        color: #302112;
        background: #fdf5e4;
      }
      .npc-btn-field select:focus,
      .npc-btn-field input[type="text"]:focus,
      .npc-btn-field input[type="number"]:focus,
      .npc-btn-field textarea:focus {
        outline: none;
        border-color: var(--gold);
        box-shadow: 0 0 0 2px rgba(213, 154, 74, 0.26);
      }

      .npc-btn-checks {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.34rem 0.58rem;
      }
      .npc-btn-checks--single { grid-template-columns: 1fr; }
      .npc-btn-shell .checkbox {
        display: flex;
        align-items: flex-start;
        gap: 0.44rem;
        line-height: 1.27;
      }
      .npc-btn-shell .checkbox input[type="checkbox"] {
        flex: 0 0 auto;
        margin: 0.14rem 0 0;
        accent-color: #d59a4a;
      }
      .npc-btn-note {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.31;
        color: #d8c7aa;
      }
      .npc-btn-card .npc-btn-note { color: #59432d; }

      .npc-btn-shell button {
        color: #fff7e9;
        border: 1px solid rgba(227, 189, 128, 0.68);
        border-radius: 9px;
        background: linear-gradient(180deg, #5f789d, #465b79);
        font-family: "Cinzel", "Trajan Pro", serif;
        font-size: 0.71rem;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        font-weight: 700;
        transition: transform 120ms ease, filter 120ms ease, border-color 120ms ease;
      }
      .npc-btn-shell button:hover {
        transform: translateY(-1px);
        filter: brightness(1.08);
        border-color: rgba(255, 230, 183, 0.92);
      }
      .npc-btn-shell button:disabled {
        opacity: 0.56;
        transform: none;
        filter: none;
      }

      .npc-btn-shop-actions,
      .npc-btn-ai-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.4rem;
      }
      .npc-btn-shop-actions button,
      .npc-btn-ai-actions button {
        min-height: 2.04rem;
        white-space: normal;
        line-height: 1.2;
      }
      .npc-btn-ai-group { gap: 0.58rem; }
      .npc-btn-ai-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
      }
      .npc-btn-ai-top h3 {
        margin: 0;
        font-size: 0.72rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .npc-btn-ai-controls { display: none; flex-direction: column; gap: 0.5rem; }
      .npc-btn-ai-options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.34rem 0.58rem; }

      .npc-btn-quest-actions {
        display: flex;
        flex-direction: column;
        gap: 0.44rem;
        border-radius: 9px;
        border: 1px dashed rgba(139, 102, 54, 0.54);
        padding: 0.56rem;
        background: rgba(255, 246, 226, 0.6);
      }

      .npc-btn-dialog-buttons { display: flex !important; gap: 0.45rem; }
      .npc-btn-dialog-buttons .dialog-button {
        margin: 0;
        flex: 1 1 0;
        min-height: 2.24rem;
        white-space: normal;
        border-radius: 10px;
        border: 1px solid rgba(230, 188, 122, 0.8);
        color: #fff7e7;
        background: linear-gradient(180deg, #e0a952, #ba7836);
        font-family: "Cinzel", "Trajan Pro", serif;
        font-size: 0.77rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .npc-btn-dialog-buttons .dialog-button:hover {
        border-color: #ffe2b2;
        background: linear-gradient(180deg, #ebb767, #c7833f);
      }
      .npc-btn-dialog-buttons .dialog-button[data-button='cancel'] {
        border-color: rgba(179, 171, 153, 0.72);
        background: linear-gradient(180deg, #5d697e, #434d60);
      }

      @media (max-width: 920px) {
        .npcx-workspace {
          grid-template-columns: 1fr;
        }
        .npcx-sidebar {
          order: 0;
        }
        .npc-btn-tabs {
          flex-direction: row;
          flex-wrap: wrap;
        }
        .npc-btn-tabs button {
          flex: 1 1 8rem;
        }
      }
      @media (max-width: 720px) {
        .npc-btn-grid,
        .npc-btn-checks,
        .npc-btn-shop-actions,
        .npc-btn-ai-actions,
        .npc-btn-ai-options { grid-template-columns: 1fr; }
        .npc-btn-dialog-buttons {
          flex-direction: column;
        }
      }
    </style>
    <form class="npc-btn-form">
      <input type="hidden" name="encounterMode" value="main">
      <input type="hidden" name="shopImportPayload" value="">
      <input type="hidden" name="lootImportPayload" value="">
      <div class="npc-btn-shell">
        <div class="npc-btn-hero">
          <div>
            <strong>${i18nHtml("ui.dialog.heroTitle")}</strong>
            <small>${i18nHtml("ui.dialog.heroSubtitle")}</small>
          </div>
          <span class="npc-btn-badge">${i18nHtml("ui.dialog.badgeDnd5e")}</span>
        </div>

        <div class="npcx-workspace">
          <aside class="npcx-sidebar">
            <div class="npc-btn-tabs">
              <button type="button" data-tab="main" class="active">${i18nHtml("ui.dialog.tabMainNpc")}</button>
              <button type="button" data-tab="encounter">${i18nHtml("ui.dialog.tabEncounter")}</button>
              <button type="button" data-tab="shop">${i18nHtml("ui.dialog.tabShop")}</button>
              <button type="button" data-tab="loot">${i18nHtml("ui.dialog.tabLoot")}</button>
              <button type="button" data-tab="questboard" data-quest-tab-button style="display:none;">${i18nHtml("ui.dialog.tabQuestBoard")}</button>
            </div>

            <div class="npc-btn-tools-strip">
              <label class="checkbox">
                <input type="checkbox" name="useAi"> ${i18nHtml("ui.dialog.useAiOpenAi")}
              </label>
            </div>

            <div class="npcx-sidebar-card">
              <strong>${i18nHtml("ui.dialog.cardAiTools")}</strong>
              <p>${i18nHtml("ui.dialog.heroSubtitle")}</p>
            </div>
          </aside>

          <section class="npcx-stage">
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

        <div data-tab-panel="loot" class="npc-btn-panel" style="display: none;">
          <div class="npc-btn-grid">
            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardLootType")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldLootType")}</span>
                <select name="lootType">
                  <option value="mixed">${i18nHtml("ui.dialog.lootTypeMixed")}</option>
                  <option value="coins">${i18nHtml("ui.dialog.lootTypeCoins")}</option>
                  <option value="gear">${i18nHtml("ui.dialog.lootTypeGear")}</option>
                  <option value="consumables">${i18nHtml("ui.dialog.lootTypeConsumables")}</option>
                  <option value="weapons">${i18nHtml("ui.dialog.lootTypeWeapons")}</option>
                  <option value="armor">${i18nHtml("ui.dialog.lootTypeArmor")}</option>
                  <option value="scrolls">${i18nHtml("ui.dialog.lootTypeScrolls")}</option>
                </select>
              </label>
              <p class="npc-btn-note">${i18nHtml("ui.dialog.noteLootSummary")}</p>
            </section>

            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardLootRoll")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldLootItemCount")}</span>
                <input type="number" name="lootCount" value="12" min="1" max="60">
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldLootBudget")}</span>
                <select name="lootBudget">
                  <option value="poor">${i18nHtml("ui.dialog.budgetPoor")}</option>
                  <option value="normal" selected>${i18nHtml("ui.dialog.budgetNormal")}</option>
                  <option value="well">${i18nHtml("ui.dialog.budgetWellOff")}</option>
                  <option value="elite">${i18nHtml("ui.dialog.budgetElite")}</option>
                </select>
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.fieldLootTier")}</span>
                <select name="lootTier">
                  <option value="auto">${i18nHtml("ui.dialog.tierAutoPartyLevel")}</option>
                  <option value="1">T1</option>
                  <option value="2">T2</option>
                  <option value="3">T3</option>
                  <option value="4">T4</option>
                </select>
              </label>
            </section>

            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardLootOptions")}</h3>
              <div class="npc-btn-checks npc-btn-checks--single">
                <label class="checkbox"><input type="checkbox" name="lootAllowMagic"> ${i18nHtml("ui.dialog.lootOptionAllowMagic")}</label>
                <label class="checkbox"><input type="checkbox" name="lootIncludeCoins" checked> ${i18nHtml("ui.dialog.lootOptionIncludeCoins")}</label>
                <label class="checkbox"><input type="checkbox" name="lootUniqOnly" checked> ${i18nHtml("ui.dialog.lootOptionUniqueOnly")}</label>
              </div>
            </section>
          </div>
        </div>

        <div data-tab-panel="questboard" class="npc-btn-panel" style="display: none;">
          <div class="npc-btn-grid">
            <section class="npc-btn-card">
              <h3>${i18nHtml("ui.dialog.cardQuestBoardSetup")}</h3>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.questBoardCount")}</span>
                <input type="number" name="questBoardCount" value="3" min="1" max="20">
              </label>
              <label class="npc-btn-field">
                <span>${i18nHtml("ui.dialog.questBoardCustomPrompt")}</span>
                <textarea
                  name="questBoardPromptExtra"
                  rows="4"
                  placeholder="${i18nHtml("ui.dialog.questBoardCustomPromptPlaceholder")}"></textarea>
              </label>
              <p class="npc-btn-note">${i18nHtml("ui.dialog.questBoardCountNote")}</p>
            </section>

            <section class="npc-btn-card npc-btn-span-2">
              <h3>${i18nHtml("ui.dialog.cardQuestBoardActions")}</h3>
              <div class="npc-btn-quest-actions" data-ai-quest-actions>
                <div class="npc-btn-ai-actions">
                  <button type="button" data-action="quest-copy-prompt" data-quest-manual-action>${i18nHtml("ui.dialog.questCopyPrompt")}</button>
                  <button type="button" data-action="quest-import-json" data-quest-manual-action>${i18nHtml("ui.dialog.questImportJson")}</button>
                  <button type="button" data-action="quest-generate-board">${i18nHtml("ui.dialog.questGenerateBoard")}</button>
                </div>
                <p class="npc-btn-note">${i18nHtml("ui.dialog.questBoardNote")}</p>
              </div>
            </section>
          </div>
        </div>

        <section class="npc-btn-card npc-btn-ai-group" data-ai-section>
          <div class="npc-btn-ai-top">
            <h3>${i18nHtml("ui.dialog.cardAiTools")}</h3>
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
            <div class="npc-btn-ai-actions" data-ai-loot-actions style="display:none;">
              <button type="button" data-action="loot-copy-prompt">${i18nHtml("ui.dialog.lootCopyPrompt")}</button>
              <button type="button" data-action="loot-import-json">${i18nHtml("ui.dialog.lootImportJson")}</button>
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
          </section>
        </div>
      </div>
    </form>
  `;
}
