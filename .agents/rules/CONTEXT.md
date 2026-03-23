# OMNI — Project Context

Last updated: 2026-03-24
Updated by: Antigravity AI

## Current State

- Version: 1.0.0
- Active tools: Hello World (`src/tools/hello.js`), Media Downloader (`src/tools/media-downloader.js`), Settings (`src/tools/settings.js`)
- i18n: Supported languages: English (en), Vietnamese (vi)
- Known issues: none
- Next planned features: Add more utility tools as needed

## Architecture Decisions

- Why ESM over CJS: `inquirer` v9+ is ESM-only; ESM is the modern standard for Node.js
- Why inquirer v9+: Latest features, active maintenance, native ESM support
- Why chalk: Lightweight, zero-dependency terminal styling
- Why per-tool config: Each tool is self-contained; configs stored in `.agents/config/<tool-name>.json`
- Why structured logging: JSON logs in `.agents/logs/` for easy parsing and debugging
- Why custom i18n: No external i18n library — keeps dependencies minimal; engine is ~30 lines, async init + sync `t()` for interpolation
- Why `omni-global` config: Shared config for language, theme, auth, and advanced settings — replaces per-tool duplicated configs
- Why first-run setup: One-time wizard on first launch to configure language, output dir, and theme

## External Dependencies

- yt-dlp: Required by media-downloader for downloading video/audio from all platforms
- gallery-dl: Optional; used by media-downloader for Instagram photos/stories, Facebook albums, X photos
- ffmpeg: Required by yt-dlp for merging video+audio streams

## File Map (what lives where)

- `src/index.js` → entry: initI18n → initTheme → banner → firstRun check → showMenu
- `src/menu.js` → dynamic tool loader + inquirer list (uses i18n)
- `src/ui.js` → theme-aware chalk wrappers + `initTheme()`, no raw chalk in tools
- `src/logger.js` → structured NDJSON logger writing to `.agents/logs/`
- `src/config.js` → per-tool config read/write from `.agents/config/`
- `src/i18n/index.js` → i18n engine: `initI18n()`, `t()`, `getCurrentLocale()`, `getSupportedLocales()`
- `src/i18n/locales/en.js` → English translation strings
- `src/i18n/locales/vi.js` → Vietnamese translation strings
- `src/firstRun.js` → first-run setup wizard (4-step), `isFirstRun()`, `runFirstRunSetup()`
- `src/tools/*.js` → each file = one tool, must export `meta` and `run`
- `src/tools/_template.js` → base template for creating new tools
- `src/tools/_media-downloader/` → sub-modules for media-downloader tool (prefixed with `_` to avoid auto-loading)

## Key Config Files

- `.agents/config/omni-global.json` → global settings: language, theme, outputDir, auth, advanced options
- `.agents/config/media-downloader.json` → media-downloader specific config

## How to Add a Tool

1. Copy `src/tools/_template.js` → `src/tools/your-tool.js`
2. Fill in `meta.label`, `meta.description`, and `run()`
3. Import `t` from `../i18n/index.js` — use `t()` for all user-facing strings
4. Add translation keys to both `src/i18n/locales/en.js` and `vi.js`
5. Register in `.agents/rules/TOOLS_REGISTRY.md`
6. No other files need to change — menu loads dynamically
