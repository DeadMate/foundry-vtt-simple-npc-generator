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
- Optional folder placement (remembers last used)
- Optional loot, secrets, quest hooks
- Compendium cache builder (faster, uses all Item compendiums)

## Usage
1) Open the Actors sidebar and click **NPC Button**.
2) (Recommended) Click **Build Compendium Cache** once as GM.
3) Create NPCs.

## Release Notes (Dev)
- Before pushing, update the **Unreleased** section in `CHANGELOG.md`.
- The release workflow bumps the version only if module files changed:
  `module.json`, `scripts/`, `data/`, or `assets/`.

## Requirements
- Foundry VTT
- dnd5e system

## Notes
- Cache file: `data/compendium-cache.json` (generated, not committed)

