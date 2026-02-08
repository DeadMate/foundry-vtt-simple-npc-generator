[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/ddmtvtt)
[![Latest Release](https://img.shields.io/github/v/release/DeadMate/foundry-vtt-simple-npc-generator?sort=semver)](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/releases/latest)
[![Foundry Compatibility](https://img.shields.io/badge/Foundry-v13-ff6400)](https://foundryvtt.com/)
[![CI Status](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/actions/workflows/release.yml/badge.svg)](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/actions/workflows/release.yml)
[![Downloads](https://img.shields.io/github/downloads/DeadMate/foundry-vtt-simple-npc-generator/total)](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/releases)

# Simple NPC Generator (D&D 5e)

One-click NPC generator for Foundry VTT. Creates a ready-to-play 5e NPC with stats, gear, spells/features, and a short description.

## Features
- NPC Button in Actors sidebar
- Class/role-based gear from compendiums
- Spells/features from compendiums
- Race selection from compendiums (searchable)
- Budget tiers for gear quality (Poor/Normal/Well-Off/Elite)
- Random token silhouettes with archetype mapping
- Bulk NPC generation with count controls
- Encounter mode (auto-balanced count/tier, Encounter-N folders)
- Optional folder placement (remembers last used)
- Optional loot, secrets, quest hooks
- Optional OpenAI flavor generation (GM-only API key, stored locally in GM browser)
- Optional OpenAI token image generation from NPC description
- Shared `Use AI (OpenAI)` toggle that shows/hides AI controls in the generator dialog
- Dedicated **Create AI NPC** button for full AI blueprint generation (stats + skills + gear/spells/features via compendium lookup)
- **Copy ChatGPT Prompt** action for no-API users (single NPC or multi-NPC encounter prompt)
- **Import ChatGPT NPC JSON** action to create NPC from pasted JSON response
- AI prompts now include current Foundry interface language and request localized output (with English fallback for item/spell names)
- Spell compendium lookup prioritizes packs matching interface language, then falls back to English packs
- Compendium cache builder (faster, uses all Item compendiums)

## Usage
1) Open the Actors sidebar and click **NPC Button**.
2) (Recommended) Click **Build Compendium Cache** once as GM.
3) (Optional, AI) In **Module Settings → NPC Button (D&D 5e)**:
   - Set text/image model and base URL if needed
   - Click **Set API Key** and paste your key (saved in GM client setting only)
4) In the NPC dialog, enable **Use AI (OpenAI)** to reveal AI actions/options.
5) Use **Create NPC** for local generation, or **Create AI NPC** for full AI blueprint generation.
6) (Optional) Toggle **AI flavor (OpenAI)** and/or **AI token from description (OpenAI)**.
7) No API flow: click **Copy ChatGPT Prompt** → run prompt in ChatGPT → paste response via **Import ChatGPT NPC JSON** (accepts object or array; prompt requests strict schema plus extra flavor keys for better biography import).

## Custom Tokens
- Default local token folder: `modules/npc-button-5e/assets/tokens/`
- To use your own local tokens, add files there and update `TOKEN_ASSETS` in `scripts/constants.js`.
- Archetype-to-token-style matching is configured by `TOKEN_ROLE_MAP` in `scripts/constants.js`.
- Detailed guide: `docs/custom-tokens.md`

## AI Cost & Responsibility
- OpenAI features (flavor and token image generation) use paid API calls.
- Token generation now defaults to a lower-cost profile (`gpt-image-1-mini`, `quality: low`), but API usage is still paid.
- You are responsible for your OpenAI account, usage limits, billing, and generated content.
- This module author does not provide cost reimbursement and is not liable for third-party API charges or output.

## Release Notes (Dev)
- Before pushing, update the **Unreleased** section in `CHANGELOG.md`.
- The release workflow bumps the version only if module files changed:
  `module.json`, `scripts/`, `data/`, `assets/`, or `templates/`.

## Requirements
- Foundry VTT
- dnd5e system

## Notes
- Cache file: `data/compendium-cache.json` (generated, not committed)

