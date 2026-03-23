# Code Guidelines

## Language & Modules

- Use ESM (`import`/`export`) throughout — no `require()`
- Node.js version: >=18
- **All code comments MUST be written in English** — no Vietnamese or other languages in comments

## Code Formatting

- **Prettier** and **ESLint** are configured project-wide — all code must pass both
- Run `yarn format` to auto-format all source files
- Run `yarn lint` to check for code issues, `yarn lint:fix` to auto-fix
- Run `yarn format:check` to verify formatting without modifying files
- Prettier config (`.prettierrc`): double quotes, trailing commas, 80 char width, 2-space indent
- ESLint config (`eslint.config.js`): `prefer-const`, `no-var`, `eqeqeq`, `curly` (multi-line)
- **Always run `yarn format && yarn lint` before committing**
- Prefix intentionally unused function parameters with `_` (e.g. `_config`, `_contentTypes`)

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
- Use `ui.errorBox(icon, msg)` for categorized errors with icons (e.g. `ui.errorBox('🔒', 'Login required')`)
- Use `ui.errorDetail(text, isLast)` for tree-style error details below `errorBox`
- Use `ui.tip(msg)` for actionable hints/suggestions (shown in yellow with 💡)
- Use `ui.separator()` for visual breaks between sections
- Never use raw ANSI escape codes — always go through `ui.*`

## Error Handling

- Wrap all async tool logic in try/catch
- On error: call `logger.error(toolName, err.message, { stack: err.stack })` and `ui.error(err.message)`
- Return gracefully (don't crash the menu)
- All user-facing error messages MUST use `t('errors.*')` i18n keys instead of hardcoded strings
- Error patterns for known issues (auth, rate limit, geo-block, etc.) should be classified and shown with friendly messages
- Always provide actionable tips for fixable errors using `ui.tip(t('errors.tip_*'))`

## Logging

- Always log `Tool started` and `Tool finished` in every tool's `run()` function
- Log significant user actions with relevant data
- Never log sensitive data (passwords, tokens, API keys)
- Use `logger.debug()` for verbose internal states — only active when `OMNI_DEBUG=1`

## Config

### Global-First Pattern
- **Shared settings** live in the global config (`omni-global`), accessed via `getGlobalConfig()` from `config.js`
  - This includes: `outputDir`, `cookiesPaths`, `sleepInterval`, `maxRetries`, `fileTemplate`, `theme`, `language`
  - Any setting that **could be used by multiple tools** MUST go in the global config
  - Example: auth/cookies are global so any future tool needing Instagram login reuses existing cookies
- **Tool-specific data** lives in per-tool config (e.g. `media-downloader` for history)
  - Only data that is unique to one tool and irrelevant to others
- Use `getGlobalConfig()` for shared settings, `loadConfig(TOOL_NAME, defaults)` for tool-only data
- Use `saveConfig(GLOBAL_CONFIG_NAME, config)` when modifying shared settings
- **Never duplicate** a global setting in a tool config — read from global instead

### General Config Rules
- Config files live in `.agents/config/` — never in `src/`
- Always define `defaults` in `loadConfig(name, defaults)` so the tool works on first run
- Never store secrets in config — use env vars instead

## Adding Dependencies

- Use `yarn add` — never `npm install`
- Check ESM compatibility before adding any package
- Document the reason in LESSONS.md if it required any workaround

## Git

- Commit messages: `type(scope): description` — e.g., `feat(tools): add file-renamer tool`
- Always update TOOLS_REGISTRY.md and CONTEXT.md when adding/removing tools
