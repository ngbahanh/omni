// src/tools/media-downloader.js
// Main entry point for the Media Downloader tool

import { ui } from "../ui.js";
import { logger } from "../logger.js";
import { loadConfig, getGlobalConfig } from "../config.js";
import { t } from "../i18n/index.js";
import inquirer from "inquirer";

import {
  TOOL_NAME,
  DEFAULT_CONFIG,
  PLATFORMS,
} from "./_media-downloader/constants.js";
import { checkDependencies } from "./_media-downloader/deps.js";
import { parseUrl } from "./_media-downloader/url-parser.js";
import {
  promptSingleUrl,
  promptBatchUrls,
  promptContentMenu,
  promptConfirmation,
} from "./_media-downloader/menus.js";
import { promptAdvancedOptions } from "./_media-downloader/advanced-options.js";
import { promptAuth, getCookiesPath } from "./_media-downloader/auth.js";
import {
  executeDownload,
  displaySummary,
  promptPostActions,
  openFolder,
  probeUrl,
} from "./_media-downloader/downloader.js";
import { addToHistory, showHistoryMenu } from "./_media-downloader/history.js";

export const meta = {
  label: `📥 ${t("downloader.menu_title")}`,
  description: "Download media from YouTube, TikTok, Instagram, Facebook, X",
};

export async function run() {
  logger.info(TOOL_NAME, "Tool started");

  // ─── Check dependencies ────────────────────────────────────
  const { ok, galleryDlAvailable } = checkDependencies();
  if (!ok) {
    logger.info(TOOL_NAME, "Tool exited — missing dependencies");
    return;
  }

  // ─── SIGINT handler ────────────────────────────────────────
  let interrupted = false;
  const sigintHandler = () => {
    if (interrupted) process.exit(1); // double Ctrl+C → force exit
    interrupted = true;
    ui.warn("\n" + t("downloader.stopping"));
  };
  process.on("SIGINT", sigintHandler);

  try {
    await mainMenu(galleryDlAvailable);
  } catch (err) {
    if (err.message?.includes("User force closed")) {
      // inquirer Ctrl+C — exit gracefully
      ui.dim(t("downloader.cancelled"));
    } else {
      logger.error(TOOL_NAME, err.message, { stack: err.stack });
      ui.error(t("downloader.error_prefix") + err.message);
    }
  } finally {
    process.removeListener("SIGINT", sigintHandler);
    logger.info(TOOL_NAME, "Tool finished");
  }
}

// ─── Main Tool Menu ────────────────────────────────────────────

async function mainMenu(galleryDlAvailable) {
  while (true) {
    console.log("");
    ui.title(`📥 ${t("downloader.menu_title")}`);
    console.log("─".repeat(35));

    const { action } = await inquirer.prompt([
      {
        type: "select",
        name: "action",
        message: t("downloader.select_function"),
        choices: [
          { name: t("downloader.menu_single"), value: "single" },
          { name: t("downloader.menu_batch"), value: "batch" },
          { name: t("downloader.menu_history"), value: "history" },
          new inquirer.Separator(),
          { name: t("downloader.menu_back"), value: "exit" },
        ],
      },
    ]);

    if (action === "exit") return;

    if (action === "single") {
      await handleSingleUrl(galleryDlAvailable);
    } else if (action === "batch") {
      await handleBatch(galleryDlAvailable);
    } else if (action === "history") {
      await handleHistory(galleryDlAvailable);
    }
  }
}

// ─── Single URL Flow ───────────────────────────────────────────

async function handleSingleUrl(galleryDlAvailable) {
  const url = await promptSingleUrl();
  await processUrl(url, galleryDlAvailable);
}

// ─── Batch Flow ────────────────────────────────────────────────

async function handleBatch(galleryDlAvailable) {
  const urls = await promptBatchUrls();
  if (urls.length === 0) {
    ui.info(t("downloader.batch_no_urls"));
    return;
  }

  // Parse and validate
  const parsed = urls.map((url) => ({ url, result: parseUrl(url) }));

  // Show preview table
  console.log("");
  console.log("  #   Platform    Type          Username/ID");
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    if (p.result) {
      console.log(
        `  ${String(i + 1).padEnd(4)}${p.result.platform.padEnd(12)}${p.result.type.padEnd(14)}${p.result.username}`,
      );
    } else {
      console.log(
        `  ✖   Unknown     -             ${p.url}  ${t("downloader.batch_will_skip")}`,
      );
    }
  }
  console.log("");

  const validUrls = parsed.filter((p) => p.result);
  if (validUrls.length === 0) {
    ui.error(t("downloader.batch_no_valid"));
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: t("downloader.batch_confirm", { count: validUrls.length }),
    },
  ]);

  if (!confirm) return;

  let successCount = 0;
  for (let i = 0; i < validUrls.length; i++) {
    ui.info(
      "\n" +
        t("downloader.batch_processing", {
          current: i + 1,
          total: validUrls.length,
          url: validUrls[i].url,
        }),
    );
    try {
      await processUrl(validUrls[i].url, galleryDlAvailable, true);
      successCount++;
    } catch (err) {
      ui.error(
        t("downloader.batch_error", {
          url: validUrls[i].url,
          error: err.message,
        }),
      );
    }
  }

  ui.success(
    "\n" +
      t("downloader.batch_complete", {
        success: successCount,
        total: validUrls.length,
      }),
  );
}

// ─── History Flow ──────────────────────────────────────────────

async function handleHistory(galleryDlAvailable) {
  const urls = await showHistoryMenu();
  if (!urls) return;

  for (const url of urls) {
    await processUrl(url, galleryDlAvailable, urls.length > 1);
  }
}

// ─── Core Processing Flow ──────────────────────────────────────

async function processUrl(url, galleryDlAvailable, isBatch = false) {
  // 1. Parse URL
  let parsed = parseUrl(url);
  while (!parsed) {
    ui.error(t("downloader.unrecognized"));
    if (isBatch) return;
    const newUrl = await promptSingleUrl();
    parsed = parseUrl(newUrl);
    url = newUrl;
  }

  const { platform, type: urlType, username } = parsed;
  logger.info(TOOL_NAME, "URL parsed", { platform, urlType, username, url });
  ui.success(`${platform.toUpperCase()} — ${urlType} — ${username}`);

  // 1.5. Probe URL for content info
  const globalConfig = getGlobalConfig();
  const toolConfig = loadConfig(TOOL_NAME, DEFAULT_CONFIG);
  ui.dim(`  ${t("downloader.probe_scanning")}`);
  const probeInfo = await probeUrl(
    url,
    platform,
    globalConfig,
    galleryDlAvailable,
  );
  if (probeInfo.total > 0) {
    const parts = [];
    if (probeInfo.videos > 0) {
      parts.push(t("downloader.probe_videos", { n: probeInfo.videos }));
    }
    if (probeInfo.photos > 0) {
      parts.push(t("downloader.probe_photos", { n: probeInfo.photos }));
    }
    if (probeInfo.stories > 0) {
      parts.push(t("downloader.probe_stories", { n: probeInfo.stories }));
    }
    if (probeInfo.reels > 0) {
      parts.push(t("downloader.probe_reels", { n: probeInfo.reels }));
    }
    if (parts.length === 0) {
      parts.push(t("downloader.probe_total", { n: probeInfo.total }));
    }
    ui.info(t("downloader.probe_found", { details: parts.join(", ") }));
    if (probeInfo.title) ui.dim(`  ${probeInfo.title}`);
  } else {
    ui.dim(`  ${t("downloader.probe_failed")}`);
  }

  // 2. Content selection menu
  const contentTypes = await promptContentMenu(
    platform,
    urlType,
    username,
    url,
    galleryDlAvailable,
    probeInfo,
  );

  // 3. Check if auth needed (Instagram stories/highlights, Facebook, X)
  let auth = null;
  const needsAuth = checkIfAuthNeeded(platform, contentTypes);
  if (needsAuth) {
    auth = await promptAuth(platform);
  }

  // 4. Advanced options
  const { flags: advancedFlags, template: fileTemplate } =
    await promptAdvancedOptions(toolConfig);

  // 5. Confirmation
  const qualityLabel = contentTypes.includes("audio")
    ? t("downloader.quality_audio")
    : t("downloader.quality_video");
  const outputPath = `${globalConfig.outputDir}/${platform}/${username.replace("@", "")}/`;

  const confirmAction = await promptConfirmation({
    platform: platform.toUpperCase(),
    username,
    contentTypes,
    limit: advancedFlags.includes("--playlist-end")
      ? t("downloader.first_n", {
          n: advancedFlags[advancedFlags.indexOf("--playlist-end") + 1],
        })
      : null,
    quality: qualityLabel,
    outputDir: outputPath,
    auth,
  });

  if (confirmAction === "cancel") return;
  if (confirmAction === "change") {
    return processUrl(url, galleryDlAvailable, isBatch);
  }

  // 6. Execute download
  const result = await executeDownload({
    platform,
    urlType,
    username,
    url,
    contentTypes,
    config: { ...globalConfig, ...toolConfig },
    advancedFlags,
    fileTemplate: fileTemplate || globalConfig.fileTemplate,
    auth,
    galleryDlAvailable,
  });

  // 7. Summary
  displaySummary(result);

  // 8. Save to history
  addToHistory(url, platform, username);

  // 9. Post-download actions
  if (!isBatch) {
    const postAction = await promptPostActions(result.errors > 0);
    if (postAction === "open") {
      openFolder(result.outputDir);
    } else if (postAction === "retry" && result.errorList.length > 0) {
      ui.info(t("downloader.retry_errors"));
    } else if (postAction === "new") {
      await handleSingleUrl(galleryDlAvailable);
    }
    // 'back' → return to main menu
  }
}

/**
 * Check if the selected content types need authentication.
 * Instagram requires cookies for ALL content (profile, reels, posts).
 * Facebook and X are heavily restricted without cookies.
 */
function checkIfAuthNeeded(platform, _contentTypes) {
  // Instagram: yt-dlp ALWAYS needs cookies for Instagram scraping
  if (platform === PLATFORMS.INSTAGRAM) {
    if (!getCookiesPath(PLATFORMS.INSTAGRAM)) return true;
  }

  // Facebook: most content needs login
  if (platform === PLATFORMS.FACEBOOK) {
    if (!getCookiesPath(PLATFORMS.FACEBOOK)) return true;
  }

  return false;
}
