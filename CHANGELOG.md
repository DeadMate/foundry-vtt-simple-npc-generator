# Changelog

## Unreleased
- TODO: describe changes

## 0.5.4
- Fix race picker to include only `race/species` compendium entries (exclude racial features like Fey Ancestry/Breath Weapon)
- Add optional OpenAI flavor generation for NPCs (dialog toggle + batch cap setting)
- Add GM OpenAI API key config menu with password input and client-local key storage
- Fix OpenAI enable-state persistence by saving toggle per GM client and auto-enabling when API key exists
- Remove dependency on Module Settings OpenAI checkbox (AI now enabled by presence of GM API key)
- Add direct "Set OpenAI API Key" button in NPC generator dialog for easier setup
- Improve OpenAI flavor quality with stricter prompts, longer structured outputs, and automatic retry when output is too fragmentary
- Expand OpenAI NPC context (race/class/attack style/tags) and allow AI to return improved name, rumor, and mannerism
- Add checkbox for OpenAI token image generation from NPC description
- Add dedicated token prompt template with strict race lock (including forged/construct hints)
- Upload generated AI tokens to `worlds/<world-id>/npc-button-5e/tokens`
- Add documentation for custom local token assets and AI usage/cost disclaimer

## 0.5.3
- Maintenance release metadata update.

## 0.5.2
- Persist actor changes with `actor.update(...)` for race/species application
- Fix changelog parsing to reliably extract notes for the current version
- Add defensive error handling in dialog open/create flows and data loading
- Add fallback to live pack index when a compendium is missing in cache
- Escape dynamic HTML in dialog option/content rendering
- Improve budget selection to honor explicit CP ranges before percentile pick
- Normalize species/advancement size values to valid dnd5e actor size keys
- Continue batch NPC creation when species application fails for one actor
- Clean up leftover release-trigger comment in constants

## 0.5.1
- Add cantrips for caster NPCs (2-4 by tier)

## 0.5.0
- **Major refactoring**: Split monolithic main.js (3000+ lines) into 9 focused modules
  - `constants.js` — configuration and constants
  - `utils.js` — utility functions
  - `data-loader.js` — data loading and caching
  - `cache.js` — compendium cache management
  - `items.js` — item handling and budget system
  - `species.js` — race/species handling
  - `encounter.js` — encounter generation
  - `npc-generator.js` — NPC generation logic
  - `ui.js` — UI components and dialogs
- **Bug fixes**:
  - Fixed null-check crash when picking items by budget
  - Added proper JSON parse error handling with descriptive messages
  - Fixed race condition in species loading with promise-based locking
  - Fixed fragile array index synchronization when applying species traits
- **Performance**: Parallel document loading in budget sampling (Promise.allSettled)
- **Code quality**: Removed duplicate functions, improved error messages

## 0.1.19
- Expand spell packs to include custom compendiums
- Increase spell counts for caster NPCs by tier

## 0.1.18
- Encounter tab with auto-balanced count/tier and Encounter-N folders
- Encounter race search with same filtering as main race picker
- Encounter archetype selector (single pick or random)
- Dialog layout cleanup (tabs, spacing, consistent widths)
- Create Encounter button label on encounter tab
- Avoid duplicate names in generated batches
- Randomize weapons/loot across all compendium packs (bigger variety)
- Extra random loot by tier/importance
- Ammo support for bows/crossbows (adds arrows/bolts)

## 0.1.17
- Encounter mode with auto-balanced count/tier and Encounter-N folders
- Encounter tab controls for race and archetype
- Improved dialog layout and archetype quick-roll button
- Avoid duplicate names in generated batches

## 0.1.16
- Speed up bulk NPC creation by batching actor creation
- Improve species search ordering and selection behavior
- Remember last NPC options (tier/budget/archetype/culture + toggles)
- Show update changelog to GM only, with "don't show again" option

## 0.1.15
- Prevent race conditions during data load
- Add safe fallbacks when data lists are empty or missing
- Warn when required data is missing and fall back gracefully

## 0.1.14
- Fix budgeted item selection stability
- Prevent armor conflicts more reliably
- Add race search auto-select
- Vary ability scores so NPCs differ

## 0.1.13
- Maintenance release prep

## 0.1.12
- Race search input with auto-select best match
- Expanded name lists across all cultures and titles
- Budgeted item selection uses price-aware sampling
- Armor conflicts now resolved by name/type (keeps one armor + one shield)

## 0.1.11
- Race selection from compendiums with applied racial features
- Randomized token silhouettes (20 SVG set) with archetype mapping
- Better species compendium detection (supports dnd5e.races + laaru packs)
- Fix race traits/movement/senses application on NPCs

## 0.1.10
- Enforce unreleased changelog notes before release

## 0.1.9
- More varied class- and role-based equipment picks
- Optional magic loot chance by tier (no artifacts)
- Folder selection for new NPCs (remembers last used)
- Bulk NPC generation with +/- count controls
- Safer loot generation when tables are missing
- Expanded names and traits; hooks rewritten for variety

## 0.1.8
- More varied class- and role-based equipment picks
- Optional magic loot chance by tier (no artifacts)
- Folder selection for new NPCs (remembers last used)
- Bulk NPC generation with +/- count controls
- Safer loot generation when tables are missing
- Expanded names and traits; hooks rewritten for variety

## 0.1.7
- TODO: describe changes

## 0.1.6
- TODO: describe changes

## 0.1.5
- Release pipeline fixes for changelog sync

## 0.1.4
- Changelog updates for recent releases

## 0.1.3
- Expanded NPC name lists further (more cultures, titles, and surnames)

## 0.1.2
- Minor name list expansion and cleanup

## 0.1.1
- Expanded name lists across cultures and surnames
- Added more trait variety for NPC generation
- Automated Foundry release pipeline

## 0.1.0
- Initial release
- NPC generator with compendium-backed gear and abilities
- Compendium cache builder
