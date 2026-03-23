# Code Guidelines

## Language & Modules

- Use ESM (`import`/`export`) throughout — no `require()`
- Node.js version: >=18
- **All code comments MUST be written in English** — no Vietnamese or other languages in comments

## File Naming

- `kebab-case.js` for all files
- Tools: `src/tools/tool-name.js`

## Tool Structure

- Every tool MUST export `meta` (object with `label` and `description`) and `run` (async function)
- Tools MUST use `ui.*` helpers from `../ui.js` — never import chalk directly in a tool
- Tools MUST be self-contained — no shared state between tools
- Tools MUST use `logger.*` from `../logger.js` for logging (never `console.log` with raw strings)
- Tools SHOULD use `loadConfig`/`saveConfig` from `../config.js` if they need persistent state

## UI / Output Rules

- Use `ui.success` for success, `ui.error` for errors, `ui.info` for info, `ui.title` for section titles
- Never use `console.log` with raw strings in tools — always go through `ui.*`

## Error Handling

- Wrap all async tool logic in try/catch
- On error: call `logger.error(toolName, err.message, { stack: err.stack })` and `ui.error(err.message)`
- Return gracefully (don't crash the menu)

## Logging

- Always log `Tool started` and `Tool finished` in every tool's `run()` function
- Log significant user actions with relevant data
- Never log sensitive data (passwords, tokens, API keys)
- Use `logger.debug()` for verbose internal states — only active when `OMNI_DEBUG=1`

## Config

- Config files live in `.agents/config/` — never in `src/`
- Config is per-tool — no tool reads another tool's config
- Always define `defaults` in `loadConfig(name, defaults)` so the tool works on first run
- Never store secrets in config — use env vars instead

## Adding Dependencies

- Use `yarn add` — never `npm install`
- Check ESM compatibility before adding any package
- Document the reason in LESSONS.md if it required any workaround

## Git

- Commit messages: `type(scope): description` — e.g., `feat(tools): add file-renamer tool`
- Always update TOOLS_REGISTRY.md and CONTEXT.md when adding/removing tools
