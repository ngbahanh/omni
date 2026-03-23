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

/**
 * Global config name shared across all tools.
 * Settings like outputDir, cookies, theme, language live here.
 */
export const GLOBAL_CONFIG_NAME = "omni-global";

/**
 * Load the global config (omni-global) with sensible defaults.
 * All tools should read shared settings from here.
 */
export function getGlobalConfig() {
  return loadConfig(GLOBAL_CONFIG_NAME, {
    outputDir: "downloads",
    sleepInterval: [1, 3],
    maxRetries: 3,
    fileTemplate: "%(upload_date)s - %(title)s [%(id)s].%(ext)s",
    cookiesPaths: {
      youtube: null,
      instagram: null,
      tiktok: null,
      facebook: null,
      x: null,
    },
  });
}
