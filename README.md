# Prompt Vault

Local-first prompt management for people and small teams who reuse prompts often.

Prompt Vault is not a model-calling platform and does not send prompts to a cloud service by default. It focuses on turning reusable prompts from scattered text into local assets that can be categorized, searched, versioned, restored, and shared through JSON packages.

## What It Does

- Create, edit, delete, favorite, and pin prompts.
- Organize prompts by scenes and tags.
- Search titles, descriptions, content, use cases, model hints, and tag names.
- Keep prompt version history and restore older versions.
- Compare different prompt versions line by line.
- Import and export JSON packages containing prompts, tags, scenes, and versions.
- Run as a local web app or an Electron desktop app.

## What It Does Not Do

- It does not call LLM APIs.
- It does not include agent workflow orchestration.
- It does not provide cloud sync, accounts, SSO, permissions, or audit logs.
- It does not include real-time multi-user editing.

## Tech Stack

- Frontend: React, TypeScript, Vite
- Backend: Fastify
- Storage: SQLite through Node.js `node:sqlite`, with FTS5 search
- Desktop: Electron
- Tests: Vitest, Testing Library, jsdom

## Requirements

- Node.js 24 or newer
- npm

The project uses Node's built-in `node:sqlite`, so Node 24+ is required.

## Quick Start

Install dependencies:

```bash
npm install
```

Run the local web app and open the browser automatically:

```bash
npm run open:web
```

On Windows, you can also double-click:

```text
Prompt Vault Web.cmd
```

The fixed local entry is:

```text
http://127.0.0.1:4317
```

Keep the terminal window open while using the local website. Press `Ctrl+C` to stop the local server.

## Development

Run API and Vite dev server together:

```bash
npm run dev
```

Development web entry:

```text
http://127.0.0.1:5173
```

Build production assets:

```bash
npm run build
```

Run the production local server:

```bash
npm start
```

Run the desktop app:

```bash
npm run desktop
```

Build a Windows installer/package:

```bash
npm run make:win
```

## Local Data

The web app and Electron desktop app use the same local SQLite database by default.

Default database locations:

```text
Windows: %APPDATA%\Prompt Vault\prompt-vault.sqlite
macOS: ~/Library/Application Support/Prompt Vault/prompt-vault.sqlite
Linux: ~/.local/share/prompt-vault/prompt-vault.sqlite
```

On first run, if the shared user-data database does not exist, the app can migrate the legacy project database from:

```text
data/prompt-vault.sqlite
```

You can override the database path with:

```bash
PROMPT_VAULT_DB=/path/to/prompt-vault.sqlite npm start
```

## Testing

Run tests:

```bash
npm test
```

If the Vitest fork pool is slow or unstable in your local Windows environment, use:

```bash
npm test -- --pool=threads
```

## Repository Notes

Generated and local-only files are intentionally ignored, including:

- `node_modules/`
- `dist/`
- `out/`
- `data/`
- `tmp/`
- `.vs/`
- local `.env` files

## License

MIT
