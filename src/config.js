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
