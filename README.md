[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/ddmtvtt)
[![Latest Release](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/DeadMate/foundry-vtt-simple-npc-generator/master/module.json&query=%24.version&label=Latest%20Release)](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/releases/latest)
[![Foundry Compatibility](https://img.shields.io/badge/Foundry-v13-ff6400)](https://foundryvtt.com/)
[![CI Status](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/actions/workflows/release.yml/badge.svg)](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/actions/workflows/release.yml)
[![Downloads](https://img.shields.io/github/downloads/DeadMate/foundry-vtt-simple-npc-generator/total)](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/releases)

# NPC Button (D&D 5e)

Modern all-in-one generation toolkit for Foundry VTT `dnd5e`.

`NPC Button` adds one button to the Actors sidebar and opens a single workspace for:
- NPC generation
- Encounter generation
- Shop generation
- Loot generation
- Quest Board generation (journal output)

## Version 1.0.0

This release focuses on a cleaner UI, faster long operations, and better AI/manual workflows:
- Full dialog redesign with more stable layout behavior
- Better progress feedback during heavy operations
- Dedicated Quest Board mode with polished journal output
- Improved prompt quality for fantasy-styled naming consistency

## Requirements

- Foundry VTT `11+` (verified on `13`)
- `dnd5e` game system

## Installation

Install via Foundry manifest URL:

```text
https://github.com/DeadMate/foundry-vtt-simple-npc-generator/releases/latest/download/module.json
```

## Quick Start

1. Open **Actors** sidebar.
2. Click **NPC Button**.
3. (GM recommended) click **Build Cache** once.
4. Pick a mode and configure options.
5. Click **Create**.

## Generator Modes

### Main NPC

- Generate one or many playable NPCs
- Archetype, tier, budget, culture, gender, species controls
- Optional loot/secret/hook/boss flags
- Optional actor folder output

### Encounter

- Group generation based on party settings
- Auto-count from party level/size + difficulty
- Encounter template controls (species + archetype)
- Auto-foldering into `Encounter-N`

### Shop

- Shop types: `market`, `general`, `alchemy`, `scrolls`, `weapons`, `armor`, `food`
- Generates a shopkeeper actor and stock
- Budget, count, tier, name, and magic controls
- Localized numbered folders

### Loot

- Loot types: `mixed`, `coins`, `gear`, `consumables`, `weapons`, `armor`, `scrolls`
- Budget, count, tier controls
- Include coins / unique-only / magic toggles
- Localized numbered folders

### Quest Board

- Dedicated mode for generating multi-quest journals
- Configurable quest count
- Optional custom GM instruction field
- Creates formatted journal content with:
  - who
  - what
  - tasks
  - reward
  - GM notes
  - twists

## AI and Manual Workflows

The dialog uses one global checkbox: **Use AI Tools (OpenAI)**.

When enabled:
- AI controls are available for NPC/shop/loot flows
- Quest Board tab becomes visible

### With API key

- One-click direct generation inside Foundry for supported flows
- Quest Board can be generated directly into a journal

### Without API key

- Manual prompt export + JSON import workflows stay available
- Works for NPC, encounter arrays, shop, loot, and quest board payloads

## Language Support

- UI localization: `English`, `Russian`
- Prompting and matching are language-aware with English fallback
- Naming guidance in prompts is tuned for fantasy-style output

## OpenAI Setup

In module settings:
- Configure text model, image model, base URL, max batch
- Set API key from the built-in key dialog

API key notes:
- Stored as a client setting (per GM client)
- Not stored as shared world secret

## Performance and Cache

- Cache build is GM-only
- Cache file: `data/compendium-cache.json`
- Building cache improves matching speed and import reliability

## Troubleshooting

- No button in Actors sidebar:
  - Check module enabled and system is `dnd5e`
- Weak matching/import quality:
  - Rebuild cache as GM
- AI controls disabled:
  - Enable `Use AI Tools` and configure API key
- Long operation uncertainty:
  - Watch progress notifications; generation is not frozen

## Changelog

See `CHANGELOG.md`.

## Support

- Issues: https://github.com/DeadMate/foundry-vtt-simple-npc-generator/issues
- Support development: https://buymeacoffee.com/ddmtvtt
