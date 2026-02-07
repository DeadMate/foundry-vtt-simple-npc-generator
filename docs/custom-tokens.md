# Custom Token Assets

This module ships with built-in token silhouettes in:

- `modules/npc-button-5e/assets/tokens/`

## Add your own local tokens

1. Put your token image files into `assets/tokens/`.
2. Open `scripts/constants.js`.
3. Edit `TOKEN_ASSETS` and add your file names.
4. (Optional) Tune `TOKEN_ROLE_MAP` so archetypes prefer your desired token styles.

Example token file entry in `TOKEN_ASSETS`:

```js
"token-21-my-custom-knight.png"
```

## AI-generated tokens location

When **AI token from description (OpenAI)** is enabled, generated files are uploaded to:

- `worlds/<world-id>/npc-button-5e/tokens/`

`<world-id>` is your current Foundry world id.

## Cost and responsibility

- OpenAI generation uses your own API key and can incur charges.
- You are solely responsible for OpenAI billing, rate limits, and generated content moderation/compliance.
- The module author does not reimburse API costs and is not liable for third-party API charges or output.
