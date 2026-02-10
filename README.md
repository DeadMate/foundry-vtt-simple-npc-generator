[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/ddmtvtt)
[![Latest Release](https://img.shields.io/github/v/release/DeadMate/foundry-vtt-simple-npc-generator?sort=semver)](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/releases/latest)
[![Foundry Compatibility](https://img.shields.io/badge/Foundry-v13-ff6400)](https://foundryvtt.com/)
[![CI Status](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/actions/workflows/release.yml/badge.svg)](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/actions/workflows/release.yml)
[![Downloads](https://img.shields.io/github/downloads/DeadMate/foundry-vtt-simple-npc-generator/total)](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/releases)

# NPC Button (D&D 5e)

Fast NPC, encounter, and shop generation for Foundry VTT `dnd5e`.

This module adds a single **NPC Button** to the Actors sidebar and gives you three workflows in one dialog:
- **Main NPC**: create one or many playable NPCs.
- **Encounter**: generate encounter-ready groups with auto balancing and foldering.
- **Shop**: generate a shopkeeper actor with localized stock pulled from compendiums.

## Highlights

- Sidebar button integration in the Actors directory.
- Compendium-backed generation for items, spells, and features.
- Race/species selection from compendiums with searchable dropdown.
- Budget tiers (`poor`, `normal`, `well`, `elite`) for item quality.
- Encounter generator with auto count/tier by party setup and difficulty.
- Automatic encounter folders: `Encounter-N`.
- Shop generator with shop types:
  - `market`, `general`, `alchemy`, `scrolls`, `weapons`, `armor`, `food`
- Automatic localized shop folders:
  - EN example: `Shop-Market-1`
  - RU example: `Магазин-Рынок-1`
- Shop stock is added directly to the created shopkeeper actor (no separate table flow).
- Shop prices come from compendium items, then roll with `+-30%`, and are normalized to integer `gp`.
- Interface-language-aware compendium matching with English fallback.
- Optional OpenAI integration for full AI NPC generation, flavor text, and token images.
- Manual no-API flow: copy prompt, run in ChatGPT, import JSON back.

## Requirements

- Foundry VTT (compatibility: minimum `11`, verified `13`)
- `dnd5e` game system

## Installation

Install via Foundry manifest URL:

```text
https://github.com/DeadMate/foundry-vtt-simple-npc-generator/releases/latest/download/module.json
```

## Quick Start

1. Open the **Actors** sidebar.
2. Click **NPC Button**.
3. (Recommended, GM) click **Build Cache** once.
4. Pick a tab:
   - **Main NPC** for single/batch NPCs
   - **Encounter** for group generation
   - **Shop** for shopkeeper + inventory
5. Click **Create**.

## Generator Modes

### Main NPC

- Archetype, tier, budget, culture, gender, race/species.
- Optional add-ons: loot, secret, quest hook, boss.
- Batch creation with count control.
- Optional target actor folder.

### Encounter

- Encounter race + archetype template.
- Party level, party size, difficulty (`easy` to `deadly`).
- Count auto-adjusts from party setup.
- Creates actors in the next `Encounter-N` folder automatically.

### Shop

- Shop type, item count, budget, shopkeeper tier.
- Optional custom shop name.
- Optional magic items toggle.
- Creates one shopkeeper actor and fills their inventory with generated/imported stock.
- Creates/uses localized numbered folders by shop type.

## AI and Manual Workflows

All AI actions are under **Use AI (OpenAI)** in the dialog.

### OpenAI (direct in Foundry)

- **Create AI NPC**: full NPC blueprint generation.
- **AI flavor text**: enriches biography fields.
- **AI token image**: generates token art from description.

OpenAI usage is GM-only and requires API key setup.

### Manual (no API key required)

- **Copy Prompt**: generate a strict JSON prompt for ChatGPT.
- **Import JSON**: import ChatGPT result back into Foundry.
- Works for:
  - Main NPC JSON
  - Encounter JSON arrays
  - Shop JSON imports (including item lists)

## Language and Matching

- Module UI supports `en` and `ru`.
- Item/spell lookup prioritizes compendium entries matching current interface language/script.
- If no localized match is found, import falls back to English-compatible entries.

## OpenAI Settings and Privacy

In **Module Settings → NPC Button (D&D 5e)**:
- Configure text model, image model, API base URL, and max AI batch size.
- Set API key via **Set API Key** menu.

API key storage:
- Stored as a **client setting** in the current GM browser.
- Not synced as a world-level shared secret.

## Cache and Performance

- Cache build is GM-only.
- Cache file: `data/compendium-cache.json` (generated at runtime).
- Building cache once improves matching speed for generation/import.

## Custom Tokens

- Built-in token silhouettes are in:
  - `assets/tokens/`
- You can add your own and map archetypes in:
  - `scripts/constants.js` (`TOKEN_ASSETS`, `TOKEN_ROLE_MAP`)
- Detailed guide:
  - `docs/custom-tokens.md`

## Troubleshooting

- No button in Actors sidebar:
  - Ensure module is enabled and system is `dnd5e`.
- Weak compendium matching:
  - Rebuild cache as GM, then retry import.
- AI buttons disabled:
  - Enable **Use AI** and configure API key in module settings.
- Wrong-language items/spells:
  - Check Foundry interface language, then rebuild cache.

## Changelog

See `CHANGELOG.md` for release notes.

## Support

Issues and feedback:
- https://github.com/DeadMate/foundry-vtt-simple-npc-generator/issues

If you want to support development:
- https://buymeacoffee.com/ddmtvtt

