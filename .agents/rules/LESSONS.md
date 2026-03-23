# Lessons Learned

## [2026-03-24] — inquirer ESM compatibility

**Context:** Setting up inquirer for the interactive menu.
**Problem:** `require('inquirer')` throws ERR_REQUIRE_ESM with v9+.
**Solution:** Use `import` and set `"type": "module"` in package.json.
**Rule going forward:** Always check ESM/CJS compatibility before adding a package.

---

## [2026-03-24] — Tool auto-loading convention

**Context:** Designing the dynamic tool loader in `menu.js`.
**Problem:** Need a way to have template files in the tools directory without them appearing in the menu.
**Solution:** Files prefixed with `_` (e.g., `_template.js`) are excluded from auto-loading by the filter in `menu.js`.
**Rule going forward:** Always prefix non-tool files in `src/tools/` with `_` to prevent them from being loaded.

---

## [2026-03-24] — chalk should not be imported directly in tools

**Context:** Deciding how to handle terminal styling in tools.
**Problem:** If each tool imports chalk directly, style consistency becomes hard to enforce.
**Solution:** All styling goes through `ui.*` helpers in `src/ui.js`. Tools import `{ ui }` instead of chalk.
**Rule going forward:** Never import chalk directly in tool files — always use `ui.*`.

---

## [2026-03-24] — spawn vs exec for yt-dlp

**Context:** Building the media-downloader tool, need to run yt-dlp.
**Problem:** `exec` buffers all stdout before returning, making it impossible to show realtime progress.
**Solution:** Use `child_process.spawn` which streams stdout/stderr in real time, allowing us to parse yt-dlp's progress lines and render an in-place progress bar.
**Rule going forward:** Always use `spawn` (not `exec`) when you need streaming output from child processes.

---

## [2026-03-24] — Parsing yt-dlp progress from stdout

**Context:** Displaying download progress for media-downloader.
**Problem:** yt-dlp outputs progress in a specific format that varies between stages.
**Solution:** Parse specific patterns:
- `[download]  XX.X% of XXXMiB at X.XXMiB/s ETA XX:XX` → progress bar
- `[download] Downloading video X of Y` → video counter
- `[download] Destination: path` → current filename
- `has already been downloaded` → skip counter
**Rule going forward:** Always regex-match yt-dlp output patterns; don't try to split on spaces naively.

---

## [2026-03-24] — gallery-dl for Instagram photos instead of yt-dlp

**Context:** Downloading Instagram photos, stories, and highlights.
**Problem:** yt-dlp can download Instagram reels/videos, but does NOT support downloading static photos, stories, or highlights.
**Solution:** Use `gallery-dl` for Instagram photos, stories, highlights, and tagged posts. It has a proper Instagram extractor that handles carousels and multiple media types.
**Rule going forward:** Use gallery-dl for static image content from Instagram, yt-dlp for video content.

---

## [2026-03-24] — gallery-dl for Facebook albums

**Context:** Downloading Facebook photo albums.
**Problem:** yt-dlp supports Facebook videos but NOT photo albums or individual photos.
**Solution:** Use `gallery-dl` for Facebook photo content (albums and individual photos). It can navigate album pages and download all images.
**Rule going forward:** Use gallery-dl for Facebook photo/album content.

---

## [2026-03-24] — X (Twitter) rate limit is 15 minutes

**Context:** Handling rate limits when downloading from X (Twitter).
**Problem:** X API rate limit windows are 15 minutes — much longer than YouTube/TikTok's typical 30-second retry interval.
**Solution:** When hitting X's 429 rate limit, wait 15 minutes (900 seconds) instead of the default 30 seconds. Display a countdown timer.
**Rule going forward:** Platform-specific rate limit handling is essential. X's window is 15 minutes, not 30 seconds.

---

## [2026-03-24] — Cookies are near-mandatory for Facebook and X

**Context:** Downloading content from Facebook and X/Twitter.
**Problem:** Both platforms heavily restrict unauthenticated access. Facebook requires login for most content (non-public pages, friends' posts, albums). X restricts timeline scraping severely without authentication since 2023.
**Solution:** Store cookies paths per-platform in config. Display clear warnings when cookies are absent. Support both cookies-file and username/password login methods.
**Rule going forward:** Always warn users and offer auth flow when targeting Facebook or X downloads.

---

## [2026-03-24] — Resolving t.co short links

**Context:** Accepting X/Twitter URLs that use t.co short links.
**Problem:** Users may paste `https://t.co/XXXXX` links which are redirects to the actual tweet/media URL. URL parser cannot detect the platform from the t.co domain.
**Solution:** Use `curl -Ls -o /dev/null -w '%{url_effective}'` to follow redirects and get the final URL before platform detection.
**Rule going forward:** Always resolve short URLs (t.co, vm.tiktok.com, fb.watch) before parsing.

---

## [2026-03-24] — SIGINT handling for graceful exit

**Context:** User presses Ctrl+C during a download.
**Problem:** Default SIGINT kills the process immediately, leaving partial files and no summary.
**Solution:** Register `process.on('SIGINT')` handler. First Ctrl+C sets a flag and warns. Second Ctrl+C force exits. The handler is cleaned up when the tool returns to prevent interfering with the omni menu.
**Rule going forward:** Complex tools with long-running operations should handle SIGINT gracefully and clean up listeners on exit.

---

## [2026-03-24] — Sub-modules directory for complex tools

**Context:** Building media-downloader which has many modules (deps, url-parser, menus, downloader, auth, etc.).
**Problem:** Putting all logic in a single file would be >2000 lines and unmaintainable.
**Solution:** Create a `_media-downloader/` directory (underscore prefix so menu.js ignores it) alongside the main tool file. Split logic into focused sub-modules. The main entry `media-downloader.js` imports and orchestrates them.
**Rule going forward:** For complex tools, create a `_tool-name/` sub-directory for auxiliary modules.

---

## [2026-03-24] — inquirer v13 uses 'select' not 'list'

**Context:** Media Downloader menu showing as text input instead of selectable list.
**Problem:** inquirer v13 wraps `@inquirer/prompts` which registers `select` (not `list`) as the prompt type. Using `type: "list"` silently falls back to `input`, showing a text field instead of arrows.
**Solution:** Replace all `type: "list"` with `type: "select"` and `type: "checkbox"` remains valid.
**Rule going forward:** Always use `type: "select"` (not `type: "list"`) with inquirer v9+.

---

## [2026-03-24] — Why no external i18n library

**Context:** Adding multilanguage support to omni.
**Problem:** Libraries like `i18next` add ~50+ dependencies and complex configuration for what is a simple key-value lookup.
**Solution:** Built a custom i18n engine in ~30 lines: async `initI18n()` loads the locale file via dynamic import, sync `t(key, vars)` does dot-notation lookup with `{{var}}` interpolation. Fallback returns the key string if not found.
**Rule going forward:** Keep the custom i18n engine. Only consider external libraries if pluralization or ICU formatting becomes necessary.

---

## [2026-03-24] — initI18n() is async but t() is sync

**Context:** i18n engine design.
**Problem:** Dynamic `import()` for locale files is async, but every UI string call needs to be synchronous for ergonomic use.
**Solution:** `initI18n()` is async and loads the locale module into a module-level `strings` variable. After that, `t()` is a pure sync function that reads from `strings`. The rule is: always `await initI18n()` before any `t()` call.
**Rule going forward:** Never call `t()` before `initI18n()` has resolved. In `src/index.js`, `initI18n()` is the first thing called.

---

## [2026-03-24] — First-run step 1 uses hardcoded bilingual text

**Context:** First-run setup wizard language selection.
**Problem:** At step 1, we don't know the user's language yet — so `t()` would return English strings by default, which is useless for Vietnamese users.
**Solution:** Step 1 displays all text in both English AND Vietnamese hardcoded (e.g., "Choose your language / Chọn ngôn ngữ"). After the user selects, we save the language, reload i18n, and from step 2 onward use `t()` normally.
**Rule going forward:** Any UI that runs BEFORE language is known must be bilingual hardcoded.

---

## [2026-03-24] — Theme integration with chalk

**Context:** Adding theme support to `ui.js`.
**Problem:** chalk uses method chaining (`chalk.bold.blueBright()`), but theme config stores color names as strings (e.g., `"blueBright"`).
**Solution:** Created an `applyColor(colorName, text)` helper that splits the color string on `.` and chains chalk methods dynamically. Themes are plain objects mapping semantic roles (primary, success, error, etc.) to chalk color names.
**Rule going forward:** All `ui.*` functions use `applyColor(activeTheme.role, text)`. Never hardcode chalk colors in tools — the theme handles it.

---

## [2026-03-24] — Project-wide error display pattern

**Context:** Improving CLI error messages to be user-friendly.
**Problem:** Raw yt-dlp errors are long, technical, and in English — useless for end users.
**Solution:** Established a three-layer error pattern:
1. **Classify**: Map raw errors to categories (`auth`, `ratelimit`, `geo`, `network`, etc.) via regex patterns in `downloader.js`.
2. **Display**: Use `ui.errorBox(icon, friendlyMsg)` + `ui.errorDetail(filename)` for structured error output.
3. **i18n**: All error messages go through `t('errors.*')` keys, tips through `t('errors.tip_*')`. Defined in `src/i18n/locales/{en,vi}.js`.
4. **Tips**: After errors, show actionable hints via `ui.tip()` based on error categories.
**Rule going forward:** Never show raw tool errors to users. Always classify → translate → display with tips.
