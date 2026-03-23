# 🛠️ OMNI — Multi-Tool CLI Project Guide

> This document is the **single source of truth** for building and maintaining the `omni` project.
> Any AI agent reading this file should be able to understand the full project context, architecture, conventions, and where to make changes — without reading every source file.

---

## 📌 Project Overview

| Field               | Value                                                |
| ------------------- | ---------------------------------------------------- |
| **Name**            | `omni`                                               |
| **Type**            | Multi-tool CLI (Command Line Interface)              |
| **Language**        | JavaScript (Node.js, CommonJS or ESM)                |
| **Package Manager** | `yarn`                                               |
| **CLI Framework**   | `chalk` (styling) + `inquirer` (interactive prompts) |
| **Entry Point**     | `src/index.js`                                       |
| **CLI Binary**      | `omni` (defined in `package.json → bin`)             |

**Purpose:** `omni` is an extensible CLI toolkit where each "tool" is a self-contained module. Users launch `omni`, pick a tool from an interactive menu (powered by `inquirer`), and the tool runs. New tools can be added by dropping a module into `src/tools/`.

---

## 🗂️ Directory Structure

```
omni/
├── .agents/
│   └── rules/
│       ├── CONTEXT.md          ← AI project context & architecture summary (auto-updated)
│       ├── LESSONS.md          ← Lessons learned, bugs fixed, decisions made
│       ├── GUIDELINES.md       ← Code style, naming, structure rules
│       └── TOOLS_REGISTRY.md   ← List of all tools: name, path, status, description
│
├── src/
│   ├── index.js                ← Entry point: loads menu, routes to tools
│   ├── menu.js                 ← Main interactive menu using inquirer
│   ├── ui.js                   ← Shared chalk UI helpers (colors, banners, spinners)
│   └── tools/
│       ├── _template.js        ← Template for creating a new tool
│       ├── hello.js            ← Example tool: Hello World
│       └── ...                 ← Additional tools go here
│
├── .agents/                    ← AI agent memory layer (see section below)
├── package.json
├── yarn.lock
├── .gitignore
└── OMNI_PROJECT_GUIDE.md       ← This file
```

---

## ⚙️ Setup Instructions

### 1. Initialize the project

```bash
mkdir omni && cd omni
yarn init -y
```

### 2. Install dependencies

```bash
yarn add chalk inquirer
yarn add --dev nodemon
```

> **Note:** `inquirer` v9+ is ESM-only. If using CommonJS (`require`), pin to `inquirer@^8.2.6`. If using ESM (`import`), use latest.

### 3. Configure `package.json`

```json
{
  "name": "omni",
  "version": "1.0.0",
  "description": "An extensible multi-tool CLI",
  "type": "module",
  "bin": {
    "omni": "./src/index.js"
  },
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "inquirer": "^9.2.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

### 4. Make the binary executable

Add this shebang line as the **first line** of `src/index.js`:

```js
#!/usr/bin/env node
```

Then run:

```bash
chmod +x src/index.js
yarn link   # makes `omni` available globally during development
```

---

## 🧩 Core Files — What to Build

### `src/index.js` — Entry Point

```js
#!/usr/bin/env node
import { showMenu } from "./menu.js";
import { banner } from "./ui.js";

async function main() {
  banner();
  await showMenu();
}

main();
```

---

### `src/ui.js` — Shared UI Helpers

Centralizes all chalk styling so tools don't import chalk directly.

```js
import chalk from "chalk";

export const ui = {
  success: (msg) => console.log(chalk.green("✔ " + msg)),
  error: (msg) => console.log(chalk.red("✖ " + msg)),
  info: (msg) => console.log(chalk.cyan("ℹ " + msg)),
  warn: (msg) => console.log(chalk.yellow("⚠ " + msg)),
  title: (msg) => console.log(chalk.bold.magenta(msg)),
  dim: (msg) => console.log(chalk.dim(msg)),
};

export function banner() {
  console.log(
    chalk.bold.blueBright(`
  ██████  ███    ███ ███    ██ ██ 
 ██    ██ ████  ████ ████   ██ ██ 
 ██    ██ ██ ████ ██ ██ ██  ██ ██ 
 ██    ██ ██  ██  ██ ██  ██ ██ ██ 
  ██████  ██      ██ ██   ████ ██ 
  `),
  );
  console.log(chalk.dim("  Multi-Tool CLI — type Ctrl+C to exit\n"));
}
```

---

### `src/menu.js` — Interactive Main Menu

Dynamically loads all tools from `src/tools/` and builds a menu.

```js
import inquirer from "inquirer";
import { ui } from "./ui.js";
import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadTools() {
  const toolsDir = resolve(__dirname, "tools");
  const files = readdirSync(toolsDir).filter(
    (f) => f.endsWith(".js") && !f.startsWith("_"),
  );

  const tools = await Promise.all(
    files.map(async (file) => {
      const mod = await import(`./tools/${file}`);
      return {
        name: mod.meta?.label ?? file.replace(".js", ""),
        value: mod.run,
        description: mod.meta?.description ?? "",
      };
    }),
  );

  return tools;
}

export async function showMenu() {
  const tools = await loadTools();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What do you want to do?",
      choices: [
        ...tools.map((t) => ({
          name: `${t.name}  ${chalk_dim(t.description)}`,
          value: t.value,
        })),
        new inquirer.Separator(),
        { name: "Exit", value: null },
      ],
    },
  ]);

  if (action) {
    await action();
    await showMenu(); // loop back
  } else {
    ui.dim("Goodbye.");
    process.exit(0);
  }
}

function chalk_dim(str) {
  return str ? `\x1b[2m${str}\x1b[0m` : "";
}
```

---

### `src/tools/_template.js` — Tool Template

Every new tool MUST follow this structure:

```js
// src/tools/my-tool.js

import { ui } from "../ui.js";
import { logger } from "../logger.js";
import { loadConfig, saveConfig } from "../config.js";
import inquirer from "inquirer";

const TOOL_NAME = "my-tool"; // must match filename (without .js)

// Required: metadata used by the menu loader
export const meta = {
  label: "My Tool", // shown in the menu
  description: "Does something cool", // shown as hint
};

// Required: main function called when tool is selected
export async function run() {
  logger.info(TOOL_NAME, "Tool started");
  ui.title("My Tool");

  // Load config with defaults (add any persistent fields here)
  const config = loadConfig(TOOL_NAME, { lastUsed: null });

  try {
    const { name } = await inquirer.prompt([
      { type: "input", name: "name", message: "Enter your name:" },
    ]);

    // Save anything you want to remember between sessions
    saveConfig(TOOL_NAME, { ...config, lastUsed: new Date().toISOString() });

    logger.info(TOOL_NAME, "Tool finished", { name });
    ui.success(`Hello, ${name}!`);
  } catch (err) {
    logger.error(TOOL_NAME, err.message, { stack: err.stack });
    ui.error("Something went wrong: " + err.message);
  }
}
```

---

## 🤖 `.agents/rules/` — AI Memory Layer

This directory is the **brain** for any AI agent working on this project. It must be read before making any changes.

---

### `.agents/rules/CONTEXT.md` — Project Context

**Purpose:** Gives an AI instant understanding of the project state without reading source code.

**Format:**

```markdown
# OMNI — Project Context

Last updated: YYYY-MM-DD
Updated by: [AI model or developer name]

## Current State

- Version: x.x.x
- Active tools: [list]
- Known issues: [list or "none"]
- Next planned features: [list]

## Architecture Decisions

- Why ESM over CJS: [reason]
- Why inquirer v9: [reason]
- ...

## File Map (what lives where)

- `src/index.js` → entry, calls banner + menu
- `src/menu.js` → dynamic tool loader + inquirer list
- `src/ui.js` → all chalk wrappers, no raw chalk in tools
- `src/tools/*.js` → each file = one tool, must export `meta` and `run`

## How to Add a Tool

1. Copy `src/tools/_template.js` → `src/tools/your-tool.js`
2. Fill in `meta.label`, `meta.description`, and `run()`
3. Register in `.agents/rules/TOOLS_REGISTRY.md`
4. No other files need to change — menu loads dynamically
```

**Rules for AI:**

- Read this file FIRST on every session
- Update the `Current State` section after completing any significant task
- Never leave it stale — update `Last updated` field

---

### `.agents/rules/LESSONS.md` — Lessons Learned

**Purpose:** Captures bugs, gotchas, failed approaches, and key decisions so they are never repeated.

**Format:**

```markdown
# Lessons Learned

## [YYYY-MM-DD] — Lesson title

**Context:** What was being built or fixed.
**Problem:** What went wrong or what was discovered.
**Solution:** What was done to fix it.
**Rule going forward:** What should always/never be done.

---

## [YYYY-MM-DD] — inquirer ESM compatibility

**Context:** Setting up inquirer.
**Problem:** `require('inquirer')` throws ERR_REQUIRE_ESM with v9+.
**Solution:** Use `import` and set `"type": "module"` in package.json, OR pin to v8.
**Rule going forward:** Always check ESM/CJS compatibility before adding a package.
```

**Rules for AI:**

- Add an entry any time a non-obvious bug is fixed or a decision is made
- Be concise but complete — future AI must understand without original context

---

### `.agents/rules/GUIDELINES.md` — Code Style & Rules

**Purpose:** Enforces consistent code style across all contributors (human or AI).

```markdown
# Code Guidelines

## Language & Modules

- Use ESM (`import`/`export`) throughout — no `require()`
- Node.js version: >=18

## File Naming

- `kebab-case.js` for all files
- Tools: `src/tools/tool-name.js`

## Tool Structure

- Every tool MUST export `meta` (object with `label` and `description`) and `run` (async function)
- Tools MUST use `ui.*` helpers from `../ui.js` — never import chalk directly in a tool
- Tools MUST be self-contained — no shared state between tools

## UI / Output Rules

- Use `ui.success` for success, `ui.error` for errors, `ui.info` for info, `ui.title` for section titles
- Never use `console.log` with raw strings in tools — always go through `ui.*`

## Error Handling

- Wrap all async tool logic in try/catch
- On error: call `ui.error(err.message)` and return gracefully (don't crash the menu)

## Adding Dependencies

- Use `yarn add` — never `npm install`
- Check ESM compatibility before adding any package
- Document the reason in LESSONS.md if it required any workaround

## Git

- Commit messages: `type(scope): description` — e.g., `feat(tools): add file-renamer tool`
- Always update TOOLS_REGISTRY.md and CONTEXT.md when adding/removing tools
```

---

### `.agents/rules/TOOLS_REGISTRY.md` — Tool Registry

**Purpose:** Single list of all tools. AI reads this to know what already exists before building anything new.

```markdown
# Tools Registry

| Name        | File                     | Status      | Description                 |
| ----------- | ------------------------ | ----------- | --------------------------- |
| Hello World | `src/tools/hello.js`     | ✅ Active   | Greets the user by name     |
| \_template  | `src/tools/_template.js` | 🔧 Template | Base template for new tools |

## Status Legend

- ✅ Active — working and in menu
- 🚧 WIP — being built, not yet functional
- ❌ Deprecated — disabled, pending removal
```

**Rules for AI:**

- Check this registry before creating a new tool to avoid duplicates
- Update status immediately when a tool changes state

---

## 🔧 Per-Tool Configuration

Each tool can have its own persistent configuration stored in `.agents/config/<tool-name>.json`. This lets tools remember user preferences between sessions without polluting global state.

### Config File Location

```
.agents/
└── config/
    ├── hello.json          ← config for the "hello" tool
    ├── file-renamer.json   ← config for another tool
    └── ...
```

### Config Helper — `src/config.js`

Create this shared utility so every tool can read/write its own config:

```js
// src/config.js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(__dirname, "../.agents/config");

function getConfigPath(toolName) {
  return resolve(CONFIG_DIR, `${toolName}.json`);
}

export function loadConfig(toolName, defaults = {}) {
  const path = getConfigPath(toolName);
  if (!existsSync(path)) return { ...defaults };
  try {
    return { ...defaults, ...JSON.parse(readFileSync(path, "utf-8")) };
  } catch {
    return { ...defaults };
  }
}

export function saveConfig(toolName, data) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(
    getConfigPath(toolName),
    JSON.stringify(data, null, 2),
    "utf-8",
  );
}

export function clearConfig(toolName) {
  const path = getConfigPath(toolName);
  if (existsSync(path)) writeFileSync(path, "{}", "utf-8");
}
```

### How a Tool Uses Config

```js
// src/tools/hello.js
import { ui } from "../ui.js";
import { loadConfig, saveConfig } from "../config.js";
import inquirer from "inquirer";

export const meta = {
  label: "Hello World",
  description: "Greets you by name — remembers your name",
};

export async function run() {
  ui.title("Hello World");

  // Load saved config, with defaults
  const config = loadConfig("hello", { userName: null });

  let name = config.userName;

  if (!name) {
    const answer = await inquirer.prompt([
      { type: "input", name: "name", message: "What is your name?" },
    ]);
    name = answer.name;
    saveConfig("hello", { userName: name }); // persist for next time
    ui.info("Name saved for future sessions.");
  } else {
    ui.dim(`Welcome back, ${name}! (saved from last session)`);
  }

  ui.success(`Hello, ${name}!`);
}
```

### Config Rules for AI

- Config files live in `.agents/config/` — never in `src/`
- Config is **per-tool** — no tool reads another tool's config
- Always define `defaults` in `loadConfig(name, defaults)` so the tool works on first run
- Never store secrets (passwords, API keys) in config — use env vars instead
- Add `.agents/config/` to `.gitignore` if configs contain user-specific data

### `.gitignore` Update

```
node_modules/
.DS_Store
*.log
.agents/config/
```

> Remove `.agents/config/` from gitignore if you _want_ configs to be shared across the team.

---

## 📝 Logging

`omni` has a lightweight structured logging system. Logs are written to `.agents/logs/` so they don't clutter the terminal but are always available for debugging.

### Log File Location

```
.agents/
└── logs/
    ├── omni.log            ← main rolling log (all tools)
    └── errors.log          ← errors only, for quick diagnosis
```

### Logger — `src/logger.js`

```js
// src/logger.js
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, "../.agents/logs");
const MAIN_LOG = resolve(LOG_DIR, "omni.log");
const ERR_LOG = resolve(LOG_DIR, "errors.log");

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function write(file, level, tool, message, data) {
  ensureLogDir();
  const entry = JSON.stringify({
    ts: timestamp(),
    level,
    tool,
    message,
    ...(data ? { data } : {}),
  });
  appendFileSync(file, entry + "\n", "utf-8");
}

export const logger = {
  info: (tool, message, data) => write(MAIN_LOG, "INFO", tool, message, data),
  warn: (tool, message, data) => write(MAIN_LOG, "WARN", tool, message, data),
  error: (tool, message, data) => {
    write(MAIN_LOG, "ERROR", tool, message, data);
    write(ERR_LOG, "ERROR", tool, message, data);
  },
  debug: (tool, message, data) => {
    if (process.env.OMNI_DEBUG === "1") {
      write(MAIN_LOG, "DEBUG", tool, message, data);
    }
  },
};
```

**Log format (NDJSON — one JSON object per line):**

```json
{"ts":"2025-01-15T10:23:01.000Z","level":"INFO","tool":"hello","message":"Tool started"}
{"ts":"2025-01-15T10:23:05.000Z","level":"INFO","tool":"hello","message":"User greeted","data":{"name":"Nam"}}
{"ts":"2025-01-15T10:23:10.000Z","level":"ERROR","tool":"file-renamer","message":"File not found","data":{"path":"/tmp/foo.txt"}}
```

### How a Tool Uses the Logger

```js
// src/tools/hello.js
import { ui } from "../ui.js";
import { logger } from "../logger.js";
import inquirer from "inquirer";

export const meta = {
  label: "Hello World",
  description: "Greets you by name",
};

export async function run() {
  logger.info("hello", "Tool started");
  ui.title("Hello World");

  try {
    const { name } = await inquirer.prompt([
      { type: "input", name: "name", message: "What is your name?" },
    ]);

    logger.info("hello", "User greeted", { name });
    ui.success(`Hello, ${name}!`);
  } catch (err) {
    logger.error("hello", err.message, { stack: err.stack });
    ui.error("Something went wrong: " + err.message);
  }
}
```

### Debug Mode

Set the env variable to enable `debug` level logs:

```bash
OMNI_DEBUG=1 yarn start
```

### Log Rotation (optional, for long-running setups)

Add to `package.json` scripts:

```json
"logs:clear": "node -e \"require('fs').writeFileSync('.agents/logs/omni.log','');require('fs').writeFileSync('.agents/logs/errors.log','');\""
```

Or run:

```bash
yarn logs:clear
```

### Logging Rules for AI

- **Always** wrap tool `run()` logic in try/catch and call `logger.error()` in the catch block
- Log at **start** and **end** of a tool run: `logger.info(toolName, 'Tool started')` / `'Tool finished'`
- Log significant user actions with relevant data (e.g., what file was selected, what name was entered)
- Never log sensitive data (passwords, tokens)
- Use `logger.debug()` for verbose internal states — it only writes when `OMNI_DEBUG=1`
- Logs go to `.agents/logs/` — keep them out of terminal output

### `.gitignore` Final Version

```
node_modules/
.DS_Store
*.log
.agents/config/
.agents/logs/
```

> Keep `.agents/logs/` out of git — logs are local and can grow large.
> Keep `.agents/rules/` **in** git — that is the shared AI memory.

---

## 📋 AI Agent Instructions (Read This Every Session)

If you are an AI agent working on this project, follow these steps **in order**:

```
1. Read `.agents/rules/CONTEXT.md`       → understand current project state
2. Read `.agents/rules/TOOLS_REGISTRY.md` → know what tools exist
3. Read `.agents/rules/GUIDELINES.md`    → know the rules before writing code
4. Do the task
5. Update `.agents/rules/CONTEXT.md`     → reflect any state changes
6. Update `.agents/rules/LESSONS.md`     → record any lessons or decisions
7. Update `.agents/rules/TOOLS_REGISTRY.md` → if tools were added/changed
```

> **Never skip steps 5–7.** Keeping these files current is the entire point of this system.
> The value of this project is not just the code — it is the accumulated knowledge in `.agents/rules/`.

---

## 🚀 Development Workflow

```bash
# Start in dev mode (auto-restarts on change)
yarn dev

# Run directly
yarn start

# Link globally for testing
yarn link
omni
```

---

## 📦 `.gitignore`

```
node_modules/
.DS_Store
*.log
```

---

## ✅ Definition of Done (for any task)

A task is complete when:

- [ ] Code works as expected
- [ ] Tool follows `_template.js` structure (if a tool was added)
- [ ] Tool's `run()` is wrapped in try/catch with `logger.error()` in catch
- [ ] Tool logs start/end and key user actions via `logger.*`
- [ ] Tool uses `loadConfig` / `saveConfig` if it needs persistent state
- [ ] No raw `console.log` or `chalk` imports in tool files
- [ ] `TOOLS_REGISTRY.md` is updated
- [ ] `CONTEXT.md` is updated with current state
- [ ] `LESSONS.md` has an entry if anything non-obvious was learned
- [ ] Code committed with proper message format
