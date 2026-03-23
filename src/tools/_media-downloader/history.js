// src/tools/_media-downloader/history.js
// Download history management

import inquirer from "inquirer";
import { ui } from "../../ui.js";
import { loadConfig, saveConfig } from "../../config.js";
import { t } from "../../i18n/index.js";
import { TOOL_NAME, DEFAULT_CONFIG, MAX_HISTORY } from "./constants.js";

/**
 * Add a URL to download history.
 * @param {string} url
 * @param {string} platform
 * @param {string} username
 */
export function addToHistory(url, platform, username) {
  const config = loadConfig(TOOL_NAME, DEFAULT_CONFIG);
  const entry = {
    url,
    platform,
    username,
    date: new Date().toISOString(),
  };

  // Remove duplicate if exists
  config.history = (config.history || []).filter((h) => h.url !== url);

  // Add to front
  config.history.unshift(entry);

  // Keep only MAX_HISTORY entries
  if (config.history.length > MAX_HISTORY) {
    config.history = config.history.slice(0, MAX_HISTORY);
  }

  saveConfig(TOOL_NAME, config);
}

/**
 * Show history menu and let user select URLs to re-download.
 * @returns {string[] | null} selected URLs, or null if cancelled
 */
export async function showHistoryMenu() {
  const config = loadConfig(TOOL_NAME, DEFAULT_CONFIG);
  const history = config.history || [];

  if (history.length === 0) {
    ui.info(t("downloader.history_empty"));
    return null;
  }

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: t("downloader.history_select"),
      choices: history.map((h, _i) => ({
        name: `${h.platform.toUpperCase().padEnd(10)} ${h.username.padEnd(20)} ${h.url}`,
        value: h.url,
        short: h.url,
      })),
    },
  ]);

  if (!selected || selected.length === 0) {
    ui.info(t("downloader.history_none_selected"));
    return null;
  }

  return selected;
}
