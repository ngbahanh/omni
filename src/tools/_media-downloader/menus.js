// src/tools/_media-downloader/menus.js
// Content selection menus per platform

import inquirer from "inquirer";
import { execSync } from "child_process";
import { ui } from "../../ui.js";
import { t } from "../../i18n/index.js";
import { PLATFORMS, URL_TYPES, CONTENT_TYPES } from "./constants.js";
import { getCookiesPath } from "./auth.js";

/**
 * Show input mode selection menu.
 * @returns {'single' | 'batch' | 'history'}
 */
export async function promptInputMode() {
  const { mode } = await inquirer.prompt([
    {
      type: "select",
      name: "mode",
      message: t("downloader.input_mode"),
      choices: [
        { name: t("downloader.input_single"), value: "single" },
        { name: t("downloader.input_batch"), value: "batch" },
        { name: t("downloader.input_history"), value: "history" },
      ],
    },
  ]);
  return mode;
}

/**
 * Prompt user to enter a single URL.
 * @returns {string}
 */
export async function promptSingleUrl() {
  const { url } = await inquirer.prompt([
    {
      type: "input",
      name: "url",
      message: t("downloader.enter_url"),
      validate: (input) =>
        input.trim() ? true : t("downloader.enter_url_required"),
    },
  ]);
  return url.trim();
}

/**
 * Prompt user to enter multiple URLs.
 * @returns {string[]}
 */
export async function promptBatchUrls() {
  ui.info(t("downloader.batch_instructions"));
  const urls = [];

  while (true) {
    const { url } = await inquirer.prompt([
      {
        type: "input",
        name: "url",
        message: `URL #${urls.length + 1}:`,
      },
    ]);

    const trimmed = url.trim();
    if (!trimmed || trimmed.toUpperCase() === "DONE") break;
    urls.push(trimmed);
  }

  return urls;
}

/**
 * Format a count label suffix, e.g. " (23)" or "" if 0.
 */
function countLabel(n) {
  if (!n || n <= 0) return "";
  return ` (${n})`;
}

/**
 * Show content selection menu based on platform and URL type.
 * @param {object} probeInfo - Probe results {videos, photos, stories, reels, total}
 */
export async function promptContentMenu(
  platform,
  urlType,
  username,
  url,
  galleryDlAvailable,
  probeInfo = {},
) {
  switch (platform) {
    case PLATFORMS.YOUTUBE:
      return promptYouTubeMenu(urlType, username, url, probeInfo);
    case PLATFORMS.TIKTOK:
      return promptTikTokMenu(urlType, username, probeInfo);
    case PLATFORMS.INSTAGRAM:
      return promptInstagramMenu(
        urlType,
        username,
        galleryDlAvailable,
        probeInfo,
      );
    case PLATFORMS.FACEBOOK:
      return promptFacebookMenu(
        urlType,
        username,
        galleryDlAvailable,
        probeInfo,
      );
    case PLATFORMS.X:
      return promptXMenu(urlType, username, probeInfo);
    default:
      return [CONTENT_TYPES.VIDEOS];
  }
}

// ─── YouTube Menus ───────────────────────────────────────────────

async function promptYouTubeMenu(urlType, username, url, probeInfo = {}) {
  if (urlType === URL_TYPES.SINGLE_VIDEO) {
    const { content } = await inquirer.prompt([
      {
        type: "select",
        name: "content",
        message: `${t("downloader.download_video")} ${username}:`,
        choices: [
          { name: t("downloader.download_video"), value: CONTENT_TYPES.VIDEOS },
          { name: t("downloader.download_audio"), value: CONTENT_TYPES.AUDIO },
          { name: t("downloader.download_video_subs"), value: "video_subs" },
          {
            name: t("downloader.download_thumbnail"),
            value: CONTENT_TYPES.THUMBNAILS,
          },
        ],
      },
    ]);
    if (content === "video_subs") {
      return [CONTENT_TYPES.VIDEOS, CONTENT_TYPES.SUBTITLES];
    }
    return [content];
  }

  if (urlType === URL_TYPES.PLAYLIST) {
    // Count videos in playlist
    let videoCount = "?";
    try {
      const result = execSync(
        `yt-dlp --flat-playlist --print id "${url}" 2>/dev/null | wc -l`,
        { stdio: ["pipe", "pipe", "pipe"], timeout: 15000 },
      );
      videoCount = result.toString().trim();
    } catch {
      /* ignore */
    }

    const { mode } = await inquirer.prompt([
      {
        type: "select",
        name: "mode",
        message: t("downloader.playlist_count", { count: videoCount }),
        choices: [
          { name: t("downloader.playlist_all"), value: "all" },
          { name: t("downloader.download_audio_short"), value: "audio" },
        ],
      },
    ]);
    return mode === "audio" ? [CONTENT_TYPES.AUDIO] : [CONTENT_TYPES.VIDEOS];
  }

  // Channel/Profile menu
  const totalLabel = probeInfo.total ? countLabel(probeInfo.total) : "";
  const { content } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "content",
      message: t("downloader.select_content", { username }),
      choices: [
        {
          name: `${t("downloader.download_all")}${totalLabel}`,
          value: CONTENT_TYPES.ALL,
        },
        new inquirer.Separator(),
        {
          name: `${t("downloader.content_videos")}${countLabel(probeInfo.videos)}`,
          value: CONTENT_TYPES.VIDEOS,
        },
        {
          name: `${t("downloader.content_shorts")}${countLabel(probeInfo.shorts)}`,
          value: CONTENT_TYPES.SHORTS,
        },
        {
          name: `${t("downloader.content_live")}${countLabel(probeInfo.live)}`,
          value: CONTENT_TYPES.LIVE,
        },
        {
          name: `${t("downloader.content_playlists")}${countLabel(probeInfo.playlists)}`,
          value: CONTENT_TYPES.PLAYLISTS,
        },
        {
          name: t("downloader.content_audio_only"),
          value: CONTENT_TYPES.AUDIO,
        },
        {
          name: t("downloader.content_thumbnails_only"),
          value: CONTENT_TYPES.THUMBNAILS,
        },
        {
          name: t("downloader.content_subtitles_only"),
          value: CONTENT_TYPES.SUBTITLES,
        },
      ],
      validate: (answers) =>
        answers.length > 0 ? true : t("downloader.select_min_one"),
    },
  ]);

  if (content.includes(CONTENT_TYPES.ALL)) {
    return [
      CONTENT_TYPES.VIDEOS,
      CONTENT_TYPES.SHORTS,
      CONTENT_TYPES.LIVE,
      CONTENT_TYPES.PLAYLISTS,
    ];
  }
  return content;
}

// ─── TikTok Menus ────────────────────────────────────────────────

async function promptTikTokMenu(urlType, username, probeInfo = {}) {
  if (urlType === URL_TYPES.SINGLE_VIDEO) {
    const { content } = await inquirer.prompt([
      {
        type: "select",
        name: "content",
        message: t("downloader.tiktok_download"),
        choices: [
          {
            name: t("downloader.download_video_short"),
            value: CONTENT_TYPES.VIDEOS,
          },
          {
            name: t("downloader.download_audio_short"),
            value: CONTENT_TYPES.AUDIO,
          },
        ],
      },
    ]);
    return [content];
  }

  // Profile menu
  const totalLabel = probeInfo.total ? countLabel(probeInfo.total) : "";
  const { content } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "content",
      message: t("downloader.select_content", { username }),
      choices: [
        {
          name: `${t("downloader.tiktok_download_all")}${totalLabel}`,
          value: CONTENT_TYPES.ALL,
        },
        new inquirer.Separator(),
        {
          name: `${t("downloader.tiktok_videos")}${countLabel(probeInfo.videos)}`,
          value: CONTENT_TYPES.VIDEOS,
        },
        {
          name: `${t("downloader.tiktok_photos")}${countLabel(probeInfo.photos)}`,
          value: CONTENT_TYPES.PHOTOS,
        },
        { name: t("downloader.tiktok_audio_only"), value: CONTENT_TYPES.AUDIO },
        {
          name: t("downloader.tiktok_thumbnails"),
          value: CONTENT_TYPES.THUMBNAILS,
        },
      ],
      validate: (answers) =>
        answers.length > 0 ? true : t("downloader.select_min_one"),
    },
  ]);

  if (content.includes(CONTENT_TYPES.ALL)) {
    return [CONTENT_TYPES.VIDEOS, CONTENT_TYPES.PHOTOS];
  }
  return content;
}

// ─── Instagram Menus ─────────────────────────────────────────────

async function promptInstagramMenu(
  urlType,
  username,
  galleryDlAvailable,
  probeInfo = {},
) {
  if (urlType === URL_TYPES.SINGLE_POST || urlType === URL_TYPES.SINGLE_REEL) {
    return [CONTENT_TYPES.VIDEOS]; // yt-dlp handles both
  }

  if (urlType === URL_TYPES.SINGLE_STORY || urlType === URL_TYPES.HIGHLIGHTS) {
    return [
      urlType === URL_TYPES.SINGLE_STORY
        ? CONTENT_TYPES.STORIES
        : CONTENT_TYPES.HIGHLIGHTS,
    ];
  }

  // Profile menu
  const hasCookies = !!getCookiesPath(PLATFORMS.INSTAGRAM);
  const loginNote = hasCookies ? "" : t("downloader.ig_login_note");
  const totalLabel = probeInfo.total ? countLabel(probeInfo.total) : "";

  const { content } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "content",
      message: t("downloader.select_content", { username }),
      choices: [
        {
          name: `${t("downloader.download_all")}${totalLabel}`,
          value: CONTENT_TYPES.ALL,
        },
        new inquirer.Separator(),
        {
          name: `${t("downloader.ig_posts_photos")}${countLabel(probeInfo.photos)}`,
          value: CONTENT_TYPES.PHOTOS,
          disabled: !galleryDlAvailable
            ? t("downloader.ig_needs_gallery_dl")
            : false,
        },
        {
          name: `${t("downloader.ig_posts_videos")}${countLabel(probeInfo.videos)}`,
          value: CONTENT_TYPES.VIDEOS,
        },
        {
          name: `${t("downloader.ig_reels")}${countLabel(probeInfo.reels)}`,
          value: CONTENT_TYPES.REELS,
        },
        {
          name: `${t("downloader.ig_stories")}${countLabel(probeInfo.stories)}${loginNote}`,
          value: CONTENT_TYPES.STORIES,
        },
        {
          name: `${t("downloader.ig_highlights")}${countLabel(probeInfo.highlights)}${loginNote}`,
          value: CONTENT_TYPES.HIGHLIGHTS,
        },
        {
          name: `${t("downloader.ig_tagged")}${countLabel(probeInfo.tagged)}`,
          value: CONTENT_TYPES.TAGGED,
        },
        { name: t("downloader.ig_metadata"), value: CONTENT_TYPES.METADATA },
      ],
      validate: (answers) =>
        answers.length > 0 ? true : t("downloader.select_min_one"),
    },
  ]);

  if (content.includes(CONTENT_TYPES.ALL)) {
    return [CONTENT_TYPES.PHOTOS, CONTENT_TYPES.VIDEOS, CONTENT_TYPES.REELS];
  }
  return content;
}

// ─── Facebook Menus ──────────────────────────────────────────────

async function promptFacebookMenu(
  urlType,
  username,
  galleryDlAvailable,
  probeInfo = {},
) {
  if (urlType === URL_TYPES.SINGLE_VIDEO) {
    const { content } = await inquirer.prompt([
      {
        type: "select",
        name: "content",
        message: t("downloader.fb_download"),
        choices: [
          {
            name: t("downloader.download_video_short"),
            value: CONTENT_TYPES.VIDEOS,
          },
          {
            name: t("downloader.download_audio_short"),
            value: CONTENT_TYPES.AUDIO,
          },
        ],
      },
    ]);
    return [content];
  }

  if (urlType === URL_TYPES.SINGLE_PHOTO || urlType === URL_TYPES.ALBUM) {
    return [CONTENT_TYPES.PHOTOS];
  }

  if (urlType === URL_TYPES.SINGLE_POST) {
    return [CONTENT_TYPES.VIDEOS];
  }

  // Page menu
  const hasCookies = !!getCookiesPath(PLATFORMS.FACEBOOK);

  if (!hasCookies) {
    ui.warn(t("downloader.fb_limit_warning"));
    ui.info(t("downloader.fb_login_hint"));
  }

  const loginNote = hasCookies ? "" : t("downloader.fb_login_note");

  const { content } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "content",
      message: t("downloader.select_content", { username }),
      choices: [
        {
          name: `${t("downloader.download_all")}${probeInfo.total ? countLabel(probeInfo.total) : ""}`,
          value: CONTENT_TYPES.ALL,
        },
        new inquirer.Separator(),
        {
          name: `${t("downloader.fb_videos")}${countLabel(probeInfo.videos)}${loginNote}`,
          value: CONTENT_TYPES.VIDEOS,
        },
        {
          name: `${t("downloader.fb_reels")}${countLabel(probeInfo.reels)}${loginNote}`,
          value: CONTENT_TYPES.REELS,
        },
        {
          name: `${t("downloader.fb_photos")}${countLabel(probeInfo.photos)}${loginNote}`,
          value: CONTENT_TYPES.PHOTOS,
          disabled: !galleryDlAvailable
            ? t("downloader.ig_needs_gallery_dl")
            : false,
        },
        {
          name: t("downloader.content_audio_only"),
          value: CONTENT_TYPES.AUDIO,
        },
        {
          name: t("downloader.content_thumbnails_only"),
          value: CONTENT_TYPES.THUMBNAILS,
        },
      ],
      validate: (answers) =>
        answers.length > 0 ? true : t("downloader.select_min_one"),
    },
  ]);

  if (content.includes(CONTENT_TYPES.ALL)) {
    return [CONTENT_TYPES.VIDEOS, CONTENT_TYPES.REELS];
  }
  return content;
}

// ─── X (Twitter) Menus ───────────────────────────────────────────

async function promptXMenu(urlType, username, probeInfo = {}) {
  if (urlType === URL_TYPES.TWEET) {
    const { content } = await inquirer.prompt([
      {
        type: "select",
        name: "content",
        message: t("downloader.x_download"),
        choices: [
          {
            name: t("downloader.download_video_short"),
            value: CONTENT_TYPES.VIDEOS,
          },
          {
            name: t("downloader.x_download_photo"),
            value: CONTENT_TYPES.PHOTOS,
          },
          {
            name: t("downloader.download_audio_short"),
            value: CONTENT_TYPES.AUDIO,
          },
        ],
      },
    ]);
    return [content];
  }

  // Profile menu
  const hasCookies = !!getCookiesPath(PLATFORMS.X);

  if (!hasCookies) {
    ui.warn(t("downloader.x_limit_warning"));
    ui.info(t("downloader.x_no_cookies"));
  }

  const totalLabel = probeInfo.total ? countLabel(probeInfo.total) : "";
  const { content } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "content",
      message: t("downloader.select_content", { username }),
      choices: [
        {
          name: `${t("downloader.x_all_media")}${totalLabel}`,
          value: CONTENT_TYPES.ALL,
        },
        new inquirer.Separator(),
        {
          name: `${t("downloader.x_photos_only")}${countLabel(probeInfo.photos)}`,
          value: CONTENT_TYPES.PHOTOS,
        },
        {
          name: `${t("downloader.x_videos_only")}${countLabel(probeInfo.videos)}`,
          value: CONTENT_TYPES.VIDEOS,
        },
        { name: t("downloader.x_audio_only"), value: CONTENT_TYPES.AUDIO },
      ],
      validate: (answers) =>
        answers.length > 0 ? true : t("downloader.select_min_one"),
    },
  ]);

  if (content.includes(CONTENT_TYPES.ALL)) {
    return [CONTENT_TYPES.VIDEOS, CONTENT_TYPES.PHOTOS];
  }
  return content;
}

/**
 * Show download confirmation.
 * @param {object} summary
 * @returns {'start' | 'change' | 'cancel'}
 */
export async function promptConfirmation(summary) {
  console.log("");
  console.log("  ┌─────────────────────────────────────────┐");
  console.log(`  │  ${pad(t("downloader.confirm_box_title"), 39)}│`);
  console.log("  ├─────────────────────────────────────────┤");
  console.log(
    `  │  ${pad(t("downloader.confirm_platform"), 11)}: ${pad(summary.platform, 25)}│`,
  );
  console.log(
    `  │  ${pad(t("downloader.confirm_source"), 11)}: ${pad(summary.username, 25)}│`,
  );
  console.log(
    `  │  ${pad(t("downloader.confirm_content"), 11)}: ${pad(summary.contentTypes.join(", "), 25)}│`,
  );
  if (summary.limit) {
    console.log(
      `  │  ${pad(t("downloader.confirm_limit"), 11)}: ${pad(summary.limit, 25)}│`,
    );
  }
  console.log(
    `  │  ${pad(t("downloader.confirm_quality"), 11)}: ${pad(summary.quality, 25)}│`,
  );
  console.log(
    `  │  ${pad(t("downloader.confirm_output_dir"), 11)}: ${pad(summary.outputDir, 25)}│`,
  );
  console.log(
    `  │  ${pad(t("downloader.confirm_auth_label"), 11)}: ${pad(summary.auth ? t("downloader.confirm_auth_yes_short") : t("downloader.confirm_auth_no_short"), 25)}│`,
  );
  console.log("  └─────────────────────────────────────────┘");
  console.log("");

  const { action } = await inquirer.prompt([
    {
      type: "select",
      name: "action",
      message: t("downloader.confirm_start_question"),
      choices: [
        { name: t("downloader.start"), value: "start" },
        { name: t("downloader.change"), value: "change" },
        { name: t("downloader.abort"), value: "cancel" },
      ],
    },
  ]);

  return action;
}

function pad(str, len) {
  const s = str || "";
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}
