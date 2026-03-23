// src/tools/_media-downloader/downloader.js
// Core download engine — spawn yt-dlp / gallery-dl with progress tracking

import { spawn, execSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { ui } from "../../ui.js";
import { logger } from "../../logger.js";
import { t } from "../../i18n/index.js";
import {
  TOOL_NAME,
  PLATFORMS,
  URL_TYPES,
  CONTENT_TYPES,
  YT_DLP_FLAGS,
} from "./constants.js";
import { buildAuthFlags, getCookiesPath } from "./auth.js";
import { createProgressRenderer } from "./progress.js";
import inquirer from "inquirer";

// ─── Known Error Patterns → i18n keys ─────────────────────────
const ERROR_PATTERNS = [
  {
    pattern: /Unable to extract data/i,
    icon: "🔒",
    key: "errors.auth_required",
    category: "auth",
  },
  {
    pattern: /login required/i,
    icon: "🔒",
    key: "errors.login_required",
    category: "auth",
  },
  {
    pattern: /private video/i,
    icon: "🔐",
    key: "errors.private_content",
    category: "auth",
  },
  {
    pattern: /members.only|member.?level/i,
    icon: "💎",
    key: "errors.members_only",
    category: "premium",
  },
  {
    pattern: /age.?restrict|sign in to confirm/i,
    icon: "🔞",
    key: "errors.age_restricted",
    category: "auth",
  },
  {
    pattern:
      /copyright|blocked.*country|geo.?restrict|not available in your country/i,
    icon: "🌍",
    key: "errors.geo_blocked",
    category: "geo",
  },
  {
    pattern: /429|too many requests|rate.?limit/i,
    icon: "⏳",
    key: "errors.rate_limited",
    category: "ratelimit",
  },
  {
    pattern: /HTTP Error 403/i,
    icon: "🚫",
    key: "errors.forbidden_403",
    category: "blocked",
  },
  {
    pattern: /HTTP Error 404|not found|does not exist/i,
    icon: "❓",
    key: "errors.not_found",
    category: "notfound",
  },
  {
    pattern: /network|connection|timed? ?out|ETIMEDOUT|ECONNREFUSED/i,
    icon: "📡",
    key: "errors.network_error",
    category: "network",
  },
  {
    pattern: /ffmpeg.*not found|ffprobe/i,
    icon: "🔧",
    key: "errors.missing_ffmpeg",
    category: "deps",
  },
  {
    pattern: /Unsupported URL/i,
    icon: "🔗",
    key: "errors.unsupported_url",
    category: "unsupported",
  },
  {
    pattern: /marked as broken/i,
    icon: "🚧",
    key: "errors.broken_extractor",
    category: "broken",
  },
];

/**
 * Map a raw yt-dlp error to a friendly message.
 */
function classifyError(rawError) {
  for (const ep of ERROR_PATTERNS) {
    if (ep.pattern.test(rawError)) {
      return {
        icon: ep.icon,
        friendly: t(ep.key),
        category: ep.category,
        raw: rawError,
      };
    }
  }
  // Unknown error — show first 120 chars of raw
  const short =
    rawError.length > 120 ? rawError.slice(0, 117) + "..." : rawError;
  return { icon: "✖", friendly: short, category: "unknown", raw: rawError };
}

/**
 * Execute the download session.
 */
export async function executeDownload(opts) {
  const {
    platform,
    urlType,
    username,
    url,
    contentTypes,
    config,
    advancedFlags = [],
    fileTemplate,
    auth,
    galleryDlAvailable,
  } = opts;

  const startTime = Date.now();
  const stats = { success: 0, skipped: 0, errors: 0, errorList: [] };

  // Build output directory
  const baseOutput = resolve(
    config.outputDir,
    platform,
    username.replace("@", ""),
  );
  mkdirSync(baseOutput, { recursive: true });

  logger.info(TOOL_NAME, "Download started", {
    platform,
    username,
    contentTypes,
    outputDir: baseOutput,
  });

  ui.title(
    `\n${t("downloader.downloading_title", { username, types: contentTypes.join(", ") })}`,
  );
  console.log("─".repeat(45));

  for (const contentType of contentTypes) {
    const subDir = getSubDir(contentType);
    const outputDir = resolve(baseOutput, subDir);
    mkdirSync(outputDir, { recursive: true });

    const downloadUrl = buildDownloadUrl(url, platform, urlType, contentType);
    const template =
      fileTemplate || config.fileTemplate || "%(title)s [%(id)s].%(ext)s";

    // ─── Strategy: try yt-dlp first, fallback to gallery-dl ───
    const ytdlpFlags = buildYtDlpFlags({
      contentType,
      outputDir,
      fileTemplate: template,
      config,
      platform,
      username,
      advancedFlags,
      auth,
    });

    const ytResult = await runYtDlp(downloadUrl, ytdlpFlags, config);

    // Check if yt-dlp completely failed (broken extractor, 0 success)
    const ytdlpFailed = ytResult.success === 0 && ytResult.errors > 0;

    if (ytdlpFailed && galleryDlAvailable) {
      // Fallback to gallery-dl
      ui.info(t("downloader.fallback_gallery_dl"));
      logger.info(TOOL_NAME, "Falling back to gallery-dl", {
        platform,
        contentType,
      });

      const gdlResult = await runGalleryDl(
        downloadUrl,
        outputDir,
        platform,
        auth,
        config,
        template,
      );
      stats.success += gdlResult.success;
      stats.errors += gdlResult.errors;
      stats.errorList.push(...gdlResult.errorList);

      if (gdlResult.success === 0 && gdlResult.errors > 0) {
        // Both tools failed — add yt-dlp errors too for context
        stats.errorList.push(...ytResult.errorList);
      }
    } else {
      // yt-dlp succeeded or gallery-dl not available
      stats.success += ytResult.success;
      stats.skipped += ytResult.skipped;
      stats.errors += ytResult.errors;
      stats.errorList.push(...ytResult.errorList);
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  logger.info(TOOL_NAME, "Download session complete", {
    ...stats,
    duration,
    outputDir: baseOutput,
  });

  return { ...stats, duration, outputDir: baseOutput };
}

/**
 * Run yt-dlp with streaming progress.
 */
async function runYtDlp(url, flags, _config) {
  const stats = {
    success: 0,
    skipped: 0,
    errors: 0,
    errorList: [],
    hadBrokenWarning: false,
  };

  const renderer = createProgressRenderer();

  let currentFile = "";
  let videoCounter = { current: 0, total: 0 };

  return new Promise((resolvePromise) => {
    const args = [...flags, url];

    logger.debug(TOOL_NAME, "yt-dlp command", { args: ["yt-dlp", ...args] });

    const proc = spawn("yt-dlp", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;

        // Video counter
        const counter = renderer.parseVideoCounter(line);
        if (counter) {
          videoCounter = counter;
          continue;
        }

        // Destination
        const dest = renderer.parseDestination(line);
        if (dest) {
          currentFile = dest.split("/").pop();
          continue;
        }

        // Already downloaded
        if (renderer.isAlreadyDownloaded(line)) {
          stats.skipped++;
          continue;
        }

        // Progress
        const progress = renderer.parseYtDlpProgress(line);
        if (progress) {
          renderer.render({
            ...progress,
            filename: currentFile,
            current: videoCounter.current,
            total: videoCounter.total,
            completed: stats.success,
            errors: stats.errors,
          });

          if (progress.percent >= 100) {
            stats.success++;
          }
          continue;
        }

        // Merger/post-processing lines
        if (
          line.includes("[Merger]") ||
          line.includes("[ExtractAudio]") ||
          line.includes("[Fixup]")
        ) {
          continue; // ongoing processing, no action needed
        }

        // Download 100% line (sometimes yt-dlp shows "100% of X")
        if (line.includes("100%") && line.includes("[download]")) {
          // Handled by progress parser above
          continue;
        }
      }
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      const lines = text.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        // WARNING lines — just log, don't count as errors
        if (line.includes("WARNING:")) {
          const warnMsg = line.replace(/^WARNING:\s*/, "").trim();
          logger.warn(TOOL_NAME, "yt-dlp warning", { warning: warnMsg });
          // Show broken extractor warning to user
          if (/marked as broken/i.test(warnMsg)) {
            ui.warn(t("errors.broken_extractor"));
            stats.hadBrokenWarning = true;
          }
          continue;
        }
        if (line.includes("ERROR:")) {
          stats.errors++;
          const errorMsg = line.replace(/^ERROR:\s*/, "").trim();
          const classified = classifyError(errorMsg);
          // Extract URL and file from error if present
          const urlMatch = errorMsg.match(/https?:\/\/[^\s"']+/);
          const errorUrl = urlMatch ? urlMatch[0] : "";
          // yt-dlp often starts error with [extractor] filename: ...
          const fileMatch = errorMsg.match(/^\[[^\]]+\]\s+([^:]+):/);
          const errorFile = fileMatch
            ? fileMatch[1].trim()
            : currentFile || "unknown";

          stats.errorList.push({
            file: errorFile,
            url: errorUrl,
            error: errorMsg,
            friendly: classified.friendly,
            icon: classified.icon,
            category: classified.category,
          });
          // Show error immediately to user
          renderer.finish();
          ui.errorBox(classified.icon, classified.friendly);
          if (errorFile && errorFile !== "unknown") {
            ui.errorDetail(errorFile, !errorUrl);
          }
          if (errorUrl) {
            ui.errorDetail(truncateStr(errorUrl, 80));
          } else if (classified.category === "unknown") {
            ui.errorDetail(errorMsg.slice(0, 150));
          }
          logger.error(TOOL_NAME, "yt-dlp error", {
            file: currentFile,
            error: errorMsg,
            category: classified.category,
          });
        }
      }
    });

    proc.on("close", (code) => {
      renderer.finish();
      if (code !== 0 && stats.success === 0 && stats.errors === 0) {
        stats.errors++;
        const errMsg = `yt-dlp exited with code ${code}`;
        const classified = classifyError(errMsg);
        stats.errorList.push({
          file: "process",
          error: errMsg,
          friendly: classified.friendly,
          icon: classified.icon,
          category: classified.category,
        });
      }
      resolvePromise(stats);
    });

    proc.on("error", (err) => {
      renderer.finish();
      stats.errors++;
      stats.errorList.push({ file: "process", error: err.message });
      logger.error(TOOL_NAME, "yt-dlp spawn error", { error: err.message });
      resolvePromise(stats);
    });
  });
}

/**
 * Run gallery-dl with progress display, skip detection, and detailed errors.
 */
async function runGalleryDl(
  url,
  outputDir,
  platform,
  auth,
  _config,
  _fileTemplate,
) {
  const stats = { success: 0, skipped: 0, errors: 0, errorList: [] };

  return new Promise((resolvePromise) => {
    // Use -D for exact directory (not -d which adds subdirs)
    const args = ["-D", outputDir, url];

    // Filename format
    args.push("-f", "{filename}.{extension}");

    // Download archive — skip already downloaded (same archive as yt-dlp)
    const archivePath = resolve(outputDir, "..", "downloaded.txt");
    args.push("--download-archive", archivePath);

    // Add cookies — from auth prompt OR from saved config (tool + global)
    let cookiesPath = auth?.cookiesPath;
    if (!cookiesPath) {
      cookiesPath = getCookiesPath(platform);
    }
    if (cookiesPath && existsSync(cookiesPath)) {
      args.unshift("--cookies", cookiesPath);
    }

    logger.debug(TOOL_NAME, "gallery-dl command", {
      args: ["gallery-dl", ...args],
    });

    const proc = spawn("gallery-dl", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let count = 0;
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let spinnerIdx = 0;
    let spinnerActive = true;
    const spinner = setInterval(() => {
      if (!spinnerActive) return;
      process.stdout.write(
        `\x1b[2K\r  ${spinnerFrames[spinnerIdx % spinnerFrames.length]} ${t("downloader.gallery_dl_connecting")}`,
      );
      spinnerIdx++;
    }, 100);

    function stopSpinner() {
      if (!spinnerActive) return;
      spinnerActive = false;
      clearInterval(spinner);
      process.stdout.write("\x1b[2K\r");
    }

    proc.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        stopSpinner();
        count++;
        stats.success++;
        const filename = trimmed.split("/").pop() || trimmed;
        // In-place progress counter
        process.stdout.write(
          `\x1b[2K\r  [${count}] \x1b[32m\u2193\x1b[0m ${truncateStr(filename, 55)}`,
        );
      }
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString().trim();
      if (!text) return;

      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Skip detection
        if (/skipping|already in archive/i.test(trimmed)) {
          stopSpinner();
          stats.skipped++;
          const skipFile = trimmed.match(/"([^"]+)"/)?.[1] || "";
          const shortName = skipFile.split("/").pop() || "file";
          process.stdout.write(
            `\x1b[2K\r  \x1b[2m[\u21b7] ${truncateStr(shortName, 55)}\x1b[0m`,
          );
          continue;
        }

        // Actual errors
        if (/\[error\]|error:|ERROR/i.test(trimmed)) {
          stats.errors++;
          const classified = classifyError(trimmed);
          const urlMatch = trimmed.match(/https?:\/\/[^\s"']+/);
          const errorUrl = urlMatch ? urlMatch[0] : url;
          const fileMatch = trimmed.match(/"([^"]+)"/);
          const errorFile = fileMatch ? fileMatch[1].split("/").pop() : "";

          stats.errorList.push({
            file: errorFile || errorUrl.split("/").pop() || "unknown",
            url: errorUrl,
            error: trimmed,
            friendly: classified.friendly,
            icon: classified.icon,
            category: classified.category,
          });

          process.stdout.write("\n");
          ui.errorBox(classified.icon, classified.friendly);
          if (errorFile) ui.errorDetail(errorFile, false);
          ui.errorDetail(truncateStr(errorUrl, 80));
          logger.error(TOOL_NAME, "gallery-dl error", {
            error: trimmed,
            url: errorUrl,
            file: errorFile,
          });
        } else {
          logger.debug(TOOL_NAME, "gallery-dl stderr", { text: trimmed });
        }
      }
    });

    proc.on("close", () => {
      stopSpinner();
      if (count > 0 || stats.skipped > 0) {
        process.stdout.write("\n");
        const parts = [];
        if (stats.success > 0) {
          parts.push(`\x1b[32m\u2714 ${stats.success}\x1b[0m`);
        }
        if (stats.skipped > 0) {
          parts.push(`\x1b[2m\u21b7 ${stats.skipped} skipped\x1b[0m`);
        }
        if (stats.errors > 0) {
          parts.push(`\x1b[31m\u2716 ${stats.errors} errors\x1b[0m`);
        }
        if (parts.length > 0) console.log(`  ${parts.join("  ")}`);
      }
      resolvePromise(stats);
    });
    proc.on("error", (err) => {
      process.stdout.write("\n");
      stats.errors++;
      stats.errorList.push({ file: "gallery-dl", url, error: err.message });
      resolvePromise(stats);
    });
  });
}

function truncateStr(str, maxLen) {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/**
 * Build yt-dlp flags.
 */
function buildYtDlpFlags({
  contentType,
  outputDir,
  fileTemplate,
  config,
  platform,
  username,
  advancedFlags,
  auth,
}) {
  const flags = [];

  // Quality / format flags
  if (contentType === CONTENT_TYPES.AUDIO) {
    flags.push(...YT_DLP_FLAGS.audioOnly);
    if (config.defaultAudioFormat && config.defaultAudioFormat !== "mp3") {
      // Replace mp3 with the config format
      const idx = flags.indexOf("mp3");
      if (idx !== -1) flags[idx] = config.defaultAudioFormat;
    }
  } else if (contentType === CONTENT_TYPES.THUMBNAILS) {
    flags.push("--skip-download", ...YT_DLP_FLAGS.thumbnail);
  } else if (contentType === CONTENT_TYPES.SUBTITLES) {
    flags.push("--skip-download", ...YT_DLP_FLAGS.subtitles);
    // Update sub langs from config
    const subLangsIdx = flags.indexOf("vi,en");
    if (subLangsIdx !== -1 && config.defaultSubLangs) {
      flags[subLangsIdx] = config.defaultSubLangs.join(",");
    }
  } else if (contentType === CONTENT_TYPES.METADATA) {
    flags.push("--skip-download", ...YT_DLP_FLAGS.metadata);
  } else {
    flags.push(...YT_DLP_FLAGS.bestVideo);
  }

  // Output template
  const template =
    fileTemplate || config.fileTemplate || "%(title)s [%(id)s].%(ext)s";
  flags.push("-o", resolve(outputDir, template));

  // Archive file
  const archivePath = resolve(
    config.outputDir,
    platform,
    username.replace("@", ""),
    "downloaded.txt",
  );
  flags.push("--download-archive", archivePath);

  // Resume + anti-block
  flags.push(...YT_DLP_FLAGS.resume);
  flags.push(...YT_DLP_FLAGS.antiBlock);

  // Override sleep intervals from config
  if (config.sleepInterval) {
    const sleepIdx = flags.indexOf("--sleep-interval");
    if (sleepIdx !== -1) flags[sleepIdx + 1] = String(config.sleepInterval[0]);
    const maxSleepIdx = flags.indexOf("--max-sleep-interval");
    if (maxSleepIdx !== -1) {
      flags[maxSleepIdx + 1] = String(config.sleepInterval[1]);
    }
  }

  // Auth flags
  const authFlags = buildAuthFlags(platform, auth);
  flags.push(...authFlags);

  // Advanced flags
  flags.push(...advancedFlags);

  return flags;
}

/**
 * Build download URL with tab suffix for channel content types.
 */
function buildDownloadUrl(url, platform, urlType, contentType) {
  if (platform === PLATFORMS.YOUTUBE) {
    const channelTypes = [
      URL_TYPES.CHANNEL,
      URL_TYPES.VIDEOS_TAB,
      URL_TYPES.SHORTS_TAB,
      URL_TYPES.PLAYLISTS_TAB,
    ];
    if (channelTypes.includes(urlType)) {
      const baseUrl = url.replace(/\/(videos|shorts|playlists)\/?$/, "");
      switch (contentType) {
        case CONTENT_TYPES.SHORTS:
          return `${baseUrl}/shorts`;
        case CONTENT_TYPES.LIVE:
          return `${baseUrl}/streams`;
        case CONTENT_TYPES.PLAYLISTS:
          return `${baseUrl}/playlists`;
        default:
          return `${baseUrl}/videos`;
      }
    }
  }
  return url;
}

/**
 * Determine output sub-directory based on content type.
 */
function getSubDir(contentType) {
  const map = {
    [CONTENT_TYPES.VIDEOS]: "videos",
    [CONTENT_TYPES.SHORTS]: "shorts",
    [CONTENT_TYPES.LIVE]: "live",
    [CONTENT_TYPES.PLAYLISTS]: "playlists",
    [CONTENT_TYPES.AUDIO]: "audio",
    [CONTENT_TYPES.THUMBNAILS]: "thumbnails",
    [CONTENT_TYPES.SUBTITLES]: "subtitles",
    [CONTENT_TYPES.PHOTOS]: "photos",
    [CONTENT_TYPES.REELS]: "reels",
    [CONTENT_TYPES.STORIES]: "stories",
    [CONTENT_TYPES.HIGHLIGHTS]: "highlights",
    [CONTENT_TYPES.TAGGED]: "tagged",
    [CONTENT_TYPES.METADATA]: "metadata",
  };
  return map[contentType] || "other";
}

/**
 * Probe URL to get content info (counts, types) without downloading.
 * Uses yt-dlp --flat-playlist -J for quick metadata.
 * Falls back to gallery-dl --dump-json if yt-dlp fails.
 */
export async function probeUrl(url, platform, config, galleryDlAvailable) {
  const info = {
    videos: 0,
    photos: 0,
    stories: 0,
    reels: 0,
    total: 0,
    title: "",
    tool: "",
  };

  // Build cookies args (checks both tool config and global settings)
  const cookiesPath = getCookiesPath(platform);

  // Try yt-dlp first
  try {
    const cookieArgs =
      cookiesPath && existsSync(cookiesPath)
        ? `--cookies "${cookiesPath}"`
        : "";
    const cmd = `yt-dlp --flat-playlist -J ${cookieArgs} "${url}" 2>/dev/null`;
    const raw = execSync(cmd, { stdio: "pipe", timeout: 15000 }).toString();
    const data = JSON.parse(raw);

    info.tool = "yt-dlp";
    info.title = data.title || data.channel || "";

    if (data._type === "playlist" && data.entries) {
      info.total = data.playlist_count || data.entries.length;
      for (const entry of data.entries) {
        if (entry.duration && entry.duration > 0) info.videos++;
        else info.photos++;
      }
    } else {
      // Single item
      info.total = 1;
      info.videos = 1;
    }

    return info;
  } catch {
    // yt-dlp failed — try gallery-dl
  }

  if (!galleryDlAvailable) return info;

  try {
    const cookieArgs =
      cookiesPath && existsSync(cookiesPath)
        ? `--cookies "${cookiesPath}"`
        : "";
    const cmd = `gallery-dl --dump-json ${cookieArgs} --range 1-20 "${url}" 2>/dev/null`;
    const raw = execSync(cmd, { stdio: "pipe", timeout: 20000 }).toString();
    const data = JSON.parse(raw);

    info.tool = "gallery-dl";

    // gallery-dl returns nested arrays: [[category_id, url, metadata], ...]
    const flatten = (arr) => {
      if (!Array.isArray(arr)) return;
      if (
        arr.length >= 3 &&
        typeof arr[0] === "number" &&
        typeof arr[1] === "string"
      ) {
        // This is an entry tuple: [category_id, url, metadata]
        info.total++;
        const meta = arr[2] || {};
        const entryUrl = arr[1] || "";
        if (
          meta.typename === "GraphVideo" ||
          meta.typename === "XDTGraphVideo" ||
          /\.mp4/i.test(entryUrl)
        ) {
          info.videos++;
        } else if (
          meta.typename === "GraphStoryVideo" ||
          meta.typename === "GraphStoryImage"
        ) {
          info.stories++;
        } else {
          info.photos++;
        }
      } else {
        for (const item of arr) {
          flatten(item);
        }
      }
    };
    flatten(data);

    return info;
  } catch {
    // Both failed
  }

  return info;
}

/**
 * Display download summary.
 */
export function displaySummary(result) {
  const minutes = Math.floor(result.duration / 60);
  const seconds = result.duration % 60;
  const timeStr =
    minutes > 0
      ? t("downloader.summary_minutes", { min: minutes, sec: seconds })
      : t("downloader.summary_seconds", { sec: seconds });

  const hasErrors = result.errorList && result.errorList.length > 0;
  const boxColor =
    hasErrors && result.success === 0
      ? "\x1b[31m"
      : hasErrors
        ? "\x1b[33m"
        : "\x1b[32m";
  const reset = "\x1b[0m";

  // Build rows, then calculate width dynamically
  const rows = [
    `✔ ${t("downloader.summary_success")} : ${result.success}`,
    `↷ ${t("downloader.summary_skipped")}: ${result.skipped}`,
    `✖ ${t("downloader.summary_errors")}  : ${result.errors}`,
    `⏱ ${t("downloader.summary_time")} : ${timeStr}`,
    `📁 ${t("downloader.summary_path")}  : ${result.outputDir}`,
  ];

  const titleText = t("downloader.summary_title");
  const minWidth = 30;
  const maxLen = Math.max(
    minWidth,
    titleText.length,
    ...rows.map((r) => r.length),
  );
  const w = maxLen + 4; // 2 padding each side

  const hLine = "─".repeat(w);
  const pad = (str) => {
    const diff = w - 2 - str.length;
    return diff > 0 ? str + " ".repeat(diff) : str;
  };

  console.log("");
  console.log(`  ${boxColor}┌${hLine}┐${reset}`);
  console.log(`  ${boxColor}│${reset}  ${pad(titleText)}${boxColor}│${reset}`);
  console.log(`  ${boxColor}├${hLine}┤${reset}`);
  for (const row of rows) {
    console.log(`  ${boxColor}│${reset}  ${pad(row)}${boxColor}│${reset}`);
  }
  console.log(`  ${boxColor}└${hLine}┘${reset}`);

  // ─── Error Details (outside the box, full width) ────────────
  if (hasErrors) {
    console.log("");
    ui.error(t("downloader.summary_error_files"));
    console.log("");

    // Group errors by category
    const grouped = {};
    for (const err of result.errorList) {
      const cat = err.category || "unknown";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(err);
    }

    for (const errors of Object.values(grouped)) {
      const sample = errors[0];
      const icon = sample.icon || "✖";
      const friendly = sample.friendly || t("errors.unknown_error");

      if (errors.length === 1) {
        ui.errorBox(icon, friendly);
        if (
          sample.file &&
          sample.file !== "unknown" &&
          sample.file !== "process"
        ) {
          ui.errorDetail(sample.file, !sample.url);
        }
        if (sample.url) {
          ui.errorDetail(truncateStr(sample.url, 80));
        }
      } else {
        ui.errorBox(
          icon,
          t("errors.error_group_count", { friendly, count: errors.length }),
        );
        // Show up to 5 errors with file+url details
        const shown = errors.slice(0, 5);
        for (let i = 0; i < shown.length; i++) {
          const isLast = i === shown.length - 1 && errors.length <= 5;
          const e = shown[i];
          if (e.file && e.file !== "unknown" && e.file !== "process") {
            const detail = e.url
              ? `${e.file} → ${truncateStr(e.url, 60)}`
              : e.file;
            ui.errorDetail(detail, isLast);
          } else if (e.url) {
            ui.errorDetail(truncateStr(e.url, 80), isLast);
          }
        }
        if (errors.length > 5) {
          ui.errorDetail(t("errors.error_more", { n: errors.length - 5 }));
        }
      }
    }

    // Actionable tips based on error categories
    const categories = Object.keys(grouped);
    console.log("");
    if (categories.includes("auth") || categories.includes("premium")) {
      ui.tip(t("errors.tip_auth"));
    }
    if (categories.includes("ratelimit")) {
      ui.tip(t("errors.tip_ratelimit"));
    }
    if (categories.includes("network")) {
      ui.tip(t("errors.tip_network"));
    }
    if (categories.includes("deps")) {
      ui.tip(t("errors.tip_ffmpeg"));
    }
    if (categories.includes("geo")) {
      ui.tip(t("errors.tip_geo"));
    }
  }
  console.log("");
}

/**
 * Show post-download actions menu.
 * @returns {'open' | 'retry' | 'new' | 'back'}
 */
export async function promptPostActions(hasErrors) {
  const choices = [{ name: t("downloader.post_open_folder"), value: "open" }];

  if (hasErrors) {
    choices.push({ name: t("downloader.post_retry"), value: "retry" });
  }

  choices.push(
    { name: t("downloader.post_new"), value: "new" },
    { name: t("downloader.post_back"), value: "back" },
  );

  const { action } = await inquirer.prompt([
    {
      type: "select",
      name: "action",
      message: t("downloader.post_next"),
      choices,
    },
  ]);

  return action;
}

/**
 * Open output folder in system file manager.
 */
export function openFolder(folderPath) {
  const cmds = {
    darwin: "open",
    win32: "explorer",
    linux: "xdg-open",
  };
  const cmd = cmds[process.platform] || "open";

  try {
    execSync(`${cmd} "${folderPath}"`);
  } catch {
    ui.warn(t("downloader.open_folder_error", { path: folderPath }));
  }
}
