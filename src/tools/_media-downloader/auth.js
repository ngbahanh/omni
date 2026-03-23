// src/tools/_media-downloader/auth.js
// Authentication / cookies management for media-downloader

import { existsSync } from "fs";
import { execSync } from "child_process";
import inquirer from "inquirer";
import { ui } from "../../ui.js";
import { logger } from "../../logger.js";
import {
  getGlobalConfig,
  saveConfig,
  GLOBAL_CONFIG_NAME,
} from "../../config.js";
import { t } from "../../i18n/index.js";
import { TOOL_NAME, PLATFORMS } from "./constants.js";

const PLATFORM_LABELS = {
  [PLATFORMS.YOUTUBE]: "YouTube",
  [PLATFORMS.INSTAGRAM]: "Instagram",
  [PLATFORMS.TIKTOK]: "TikTok",
  [PLATFORMS.FACEBOOK]: "Facebook",
  [PLATFORMS.X]: "X (Twitter)",
};

/**
 * Get cookies path for a platform from global config.
 * @param {string} platform
 * @returns {string | null}
 */
export function getCookiesPath(platform) {
  const config = getGlobalConfig();
  const path = config.cookiesPaths?.[platform];
  if (path && existsSync(path)) return path;
  return null;
}

/**
 * Check if cookies are valid by running yt-dlp --simulate.
 * @param {string} cookiesPath
 * @param {string} testUrl - a URL to test against
 * @returns {boolean}
 */
export function validateCookies(cookiesPath, testUrl) {
  if (!cookiesPath || !existsSync(cookiesPath)) return false;
  try {
    execSync(`yt-dlp --cookies "${cookiesPath}" --simulate "${testUrl}" 2>&1`, {
      stdio: "pipe",
      timeout: 15000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Prompt user for authentication when content requires login.
 * @param {string} platform
 * @returns {{ method: string, cookiesPath?: string, username?: string, password?: string } | null}
 */
export async function promptAuth(platform) {
  const label = PLATFORM_LABELS[platform] || platform;

  ui.warn(t("downloader.auth_required", { platform: label }));

  const { method } = await inquirer.prompt([
    {
      type: "select",
      name: "method",
      message: t("downloader.auth_method"),
      choices: [
        { name: t("downloader.auth_cookies_recommended"), value: "cookies" },
        { name: t("downloader.auth_login"), value: "login" },
        { name: t("downloader.auth_skip"), value: "skip" },
      ],
    },
  ]);

  if (method === "skip") return null;

  if (method === "cookies") {
    const { cookiesPath } = await inquirer.prompt([
      {
        type: "input",
        name: "cookiesPath",
        message: t("downloader.auth_path_prompt"),
        validate: (input) => {
          if (!input.trim()) return t("downloader.auth_path_required");
          if (!existsSync(input.trim())) {
            return t("downloader.auth_file_not_found");
          }
          return true;
        },
      },
    ]);

    // Save to global config
    const config = getGlobalConfig();
    if (!config.cookiesPaths) config.cookiesPaths = {};
    config.cookiesPaths[platform] = cookiesPath.trim();
    saveConfig(GLOBAL_CONFIG_NAME, config);
    logger.info(TOOL_NAME, "Cookies path saved", {
      platform,
      path: cookiesPath.trim(),
    });
    ui.success(t("downloader.auth_cookies_saved_msg", { platform: label }));

    return { method: "cookies", cookiesPath: cookiesPath.trim() };
  }

  if (method === "login") {
    const answers = await inquirer.prompt([
      { type: "input", name: "username", message: "Username:" },
      { type: "password", name: "password", message: "Password:", mask: "*" },
    ]);

    logger.info(TOOL_NAME, "Login credentials provided (not stored)", {
      platform,
    });
    return {
      method: "login",
      username: answers.username,
      password: answers.password,
    };
  }

  return null;
}

/**
 * Build yt-dlp auth flags based on auth info.
 * @param {string} platform
 * @param {{ method: string, cookiesPath?: string, username?: string, password?: string } | null} auth
 * @returns {string[]}
 */
export function buildAuthFlags(platform, auth) {
  if (!auth) {
    // Check saved cookies
    const savedPath = getCookiesPath(platform);
    if (savedPath && existsSync(savedPath)) {
      return ["--cookies", savedPath];
    }
    return [];
  }

  if (auth.method === "cookies" && auth.cookiesPath) {
    return ["--cookies", auth.cookiesPath];
  }

  if (auth.method === "login") {
    const flags = [];
    if (auth.username) flags.push("--username", auth.username);
    if (auth.password) flags.push("--password", auth.password);
    return flags;
  }

  return [];
}

/**
 * Show session management sub-menu.
 */
export async function manageSessionsMenu() {
  const config = getGlobalConfig();

  const { action } = await inquirer.prompt([
    {
      type: "select",
      name: "action",
      message: t("downloader.auth_manage"),
      choices: [
        { name: t("downloader.auth_view_current"), value: "view" },
        { name: t("downloader.auth_update_cookies"), value: "update" },
        { name: t("downloader.auth_delete_session"), value: "delete" },
        { name: t("downloader.auth_delete_all"), value: "deleteAll" },
        { name: t("common.back"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "view") {
    ui.title(t("downloader.auth_current_sessions"));
    for (const [platform, label] of Object.entries(PLATFORM_LABELS)) {
      const path = config.cookiesPaths?.[platform];
      if (path && existsSync(path)) {
        ui.success(`${label}: ${path}`);
      } else if (path) {
        ui.warn(t("downloader.auth_file_missing", { label, path }));
      } else {
        ui.dim(t("downloader.auth_not_configured", { label }));
      }
    }
  }

  if (action === "update") {
    const { platform } = await inquirer.prompt([
      {
        type: "select",
        name: "platform",
        message: t("downloader.auth_select_platform"),
        choices: Object.entries(PLATFORM_LABELS).map(([value, name]) => ({
          name,
          value,
        })),
      },
    ]);

    const { cookiesPath } = await inquirer.prompt([
      {
        type: "input",
        name: "cookiesPath",
        message: t("downloader.auth_path_prompt"),
        validate: (input) => {
          if (!input.trim()) return t("downloader.auth_path_required");
          if (!existsSync(input.trim())) {
            return t("downloader.auth_file_not_found");
          }
          return true;
        },
      },
    ]);

    config.cookiesPaths[platform] = cookiesPath.trim();
    saveConfig(GLOBAL_CONFIG_NAME, config);
    ui.success(
      t("downloader.auth_updated", { platform: PLATFORM_LABELS[platform] }),
    );
  }

  if (action === "delete") {
    const { platform } = await inquirer.prompt([
      {
        type: "select",
        name: "platform",
        message: t("downloader.auth_delete_which"),
        choices: Object.entries(PLATFORM_LABELS).map(([value, name]) => ({
          name,
          value,
        })),
      },
    ]);
    config.cookiesPaths[platform] = null;
    saveConfig(GLOBAL_CONFIG_NAME, config);
    ui.success(
      t("downloader.auth_deleted", { platform: PLATFORM_LABELS[platform] }),
    );
  }

  if (action === "deleteAll") {
    for (const key of Object.keys(config.cookiesPaths)) {
      config.cookiesPaths[key] = null;
    }
    saveConfig(GLOBAL_CONFIG_NAME, config);
    ui.success(t("downloader.auth_all_deleted"));
  }
}
