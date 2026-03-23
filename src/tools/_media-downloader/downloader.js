// src/tools/_media-downloader/downloader.js
// Core download engine — spawn yt-dlp / gallery-dl with progress tracking

import { spawn, execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { ui } from '../../ui.js';
import { logger } from '../../logger.js';
import { t } from '../../i18n/index.js';
import {
  TOOL_NAME,
  PLATFORMS,
  URL_TYPES,
  CONTENT_TYPES,
  YT_DLP_FLAGS,
  RATE_LIMIT_WAIT,
} from './constants.js';
import { buildAuthFlags } from './auth.js';
import { createProgressRenderer } from './progress.js';
import inquirer from 'inquirer';

/**
 * Execute the download session.
 * @param {object} opts
 * @param {string} opts.platform
 * @param {string} opts.urlType
 * @param {string} opts.username
 * @param {string} opts.url
 * @param {string[]} opts.contentTypes
 * @param {object} opts.config - merged config
 * @param {string[]} opts.advancedFlags - extra flags from advanced options
 * @param {string} opts.fileTemplate
 * @param {object|null} opts.auth
 * @param {boolean} opts.galleryDlAvailable
 * @returns {{ success: number, skipped: number, errors: number, errorList: Array, duration: number, outputDir: string }}
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
  const baseOutput = resolve(config.outputDir, platform, username.replace('@', ''));
  mkdirSync(baseOutput, { recursive: true });

  logger.info(TOOL_NAME, 'Download started', {
    platform, username, contentTypes, outputDir: baseOutput,
  });

  ui.title(`\n${t('downloader.downloading_title', { username, types: contentTypes.join(', ') })}`);
  console.log('─'.repeat(45));

  for (const contentType of contentTypes) {
    const subDir = getSubDir(contentType);
    const outputDir = resolve(baseOutput, subDir);
    mkdirSync(outputDir, { recursive: true });

    // Decide tool and build command
    const useGalleryDl = shouldUseGalleryDl(platform, contentType, galleryDlAvailable);

    if (useGalleryDl) {
      const result = await runGalleryDl(url, outputDir, platform, auth, config);
      stats.success += result.success;
      stats.errors += result.errors;
      stats.errorList.push(...result.errorList);
    } else {
      const downloadUrl = buildDownloadUrl(url, platform, urlType, contentType);
      const flags = buildYtDlpFlags({
        contentType, outputDir, fileTemplate, config, platform, username, advancedFlags, auth,
      });

      const result = await runYtDlp(downloadUrl, flags, config);
      stats.success += result.success;
      stats.skipped += result.skipped;
      stats.errors += result.errors;
      stats.errorList.push(...result.errorList);
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  logger.info(TOOL_NAME, 'Download session complete', {
    ...stats,
    duration,
    outputDir: baseOutput,
  });

  return { ...stats, duration, outputDir: baseOutput };
}

/**
 * Run yt-dlp with streaming progress.
 */
async function runYtDlp(url, flags, config) {
  const stats = { success: 0, skipped: 0, errors: 0, errorList: [] };
  const maxRetries = config.maxRetries || 3;
  const renderer = createProgressRenderer();

  let currentFile = '';
  let videoCounter = { current: 0, total: 0 };

  return new Promise((resolvePromise) => {
    const args = [...flags, url];

    logger.debug(TOOL_NAME, 'yt-dlp command', { args: ['yt-dlp', ...args] });

    const proc = spawn('yt-dlp', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
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
          currentFile = dest.split('/').pop();
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
        if (line.includes('[Merger]') || line.includes('[ExtractAudio]') || line.includes('[Fixup]')) {
          continue; // ongoing processing, no action needed
        }

        // Download 100% line (sometimes yt-dlp shows "100% of X")
        if (line.includes('100%') && line.includes('[download]')) {
          // Handled by progress parser above
          continue;
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.includes('ERROR:')) {
          stats.errors++;
          const errorMsg = line.replace(/^ERROR:\s*/, '').trim();
          stats.errorList.push({ file: currentFile || 'unknown', error: errorMsg });
          logger.error(TOOL_NAME, 'yt-dlp error', { file: currentFile, error: errorMsg });
        }
      }
    });

    proc.on('close', (code) => {
      renderer.finish();
      if (code !== 0 && stats.success === 0 && stats.errors === 0) {
        stats.errors++;
        stats.errorList.push({ file: 'process', error: `yt-dlp exited with code ${code}` });
      }
      resolvePromise(stats);
    });

    proc.on('error', (err) => {
      renderer.finish();
      stats.errors++;
      stats.errorList.push({ file: 'process', error: err.message });
      logger.error(TOOL_NAME, 'yt-dlp spawn error', { error: err.message });
      resolvePromise(stats);
    });
  });
}

/**
 * Run gallery-dl for photo downloads.
 */
async function runGalleryDl(url, outputDir, platform, auth, config) {
  const stats = { success: 0, errors: 0, errorList: [] };

  return new Promise((resolvePromise) => {
    const args = ['-d', outputDir, url];

    // Add cookies if available
    const cookiesPath = auth?.cookiesPath;
    if (cookiesPath && existsSync(cookiesPath)) {
      args.unshift('--cookies', cookiesPath);
    }

    logger.debug(TOOL_NAME, 'gallery-dl command', { args: ['gallery-dl', ...args] });

    const proc = spawn('gallery-dl', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim() && !line.startsWith('#')) {
          stats.success++;
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('error') || text.includes('ERROR')) {
        stats.errors++;
        stats.errorList.push({ file: 'gallery-dl', error: text.trim() });
        logger.error(TOOL_NAME, 'gallery-dl error', { error: text.trim() });
      }
    });

    proc.on('close', () => resolvePromise(stats));
    proc.on('error', (err) => {
      stats.errors++;
      stats.errorList.push({ file: 'gallery-dl', error: err.message });
      resolvePromise(stats);
    });
  });
}

/**
 * Build yt-dlp flags.
 */
function buildYtDlpFlags({ contentType, outputDir, fileTemplate, config, platform, username, advancedFlags, auth }) {
  const flags = [];

  // Quality / format flags
  if (contentType === CONTENT_TYPES.AUDIO) {
    flags.push(...YT_DLP_FLAGS.audioOnly);
    if (config.defaultAudioFormat && config.defaultAudioFormat !== 'mp3') {
      // Replace mp3 with the config format
      const idx = flags.indexOf('mp3');
      if (idx !== -1) flags[idx] = config.defaultAudioFormat;
    }
  } else if (contentType === CONTENT_TYPES.THUMBNAILS) {
    flags.push('--skip-download', ...YT_DLP_FLAGS.thumbnail);
  } else if (contentType === CONTENT_TYPES.SUBTITLES) {
    flags.push('--skip-download', ...YT_DLP_FLAGS.subtitles);
    // Update sub langs from config
    const subLangsIdx = flags.indexOf('vi,en');
    if (subLangsIdx !== -1 && config.defaultSubLangs) {
      flags[subLangsIdx] = config.defaultSubLangs.join(',');
    }
  } else if (contentType === CONTENT_TYPES.METADATA) {
    flags.push('--skip-download', ...YT_DLP_FLAGS.metadata);
  } else {
    flags.push(...YT_DLP_FLAGS.bestVideo);
  }

  // Output template
  const template = fileTemplate || config.fileTemplate || '%(title)s [%(id)s].%(ext)s';
  flags.push('-o', resolve(outputDir, template));

  // Archive file
  const archivePath = resolve(config.outputDir, platform, username.replace('@', ''), 'downloaded.txt');
  flags.push('--download-archive', archivePath);

  // Resume + anti-block
  flags.push(...YT_DLP_FLAGS.resume);
  flags.push(...YT_DLP_FLAGS.antiBlock);

  // Override sleep intervals from config
  if (config.sleepInterval) {
    const sleepIdx = flags.indexOf('--sleep-interval');
    if (sleepIdx !== -1) flags[sleepIdx + 1] = String(config.sleepInterval[0]);
    const maxSleepIdx = flags.indexOf('--max-sleep-interval');
    if (maxSleepIdx !== -1) flags[maxSleepIdx + 1] = String(config.sleepInterval[1]);
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
    const channelTypes = [URL_TYPES.CHANNEL, URL_TYPES.VIDEOS_TAB, URL_TYPES.SHORTS_TAB, URL_TYPES.PLAYLISTS_TAB];
    if (channelTypes.includes(urlType)) {
      const baseUrl = url.replace(/\/(videos|shorts|playlists)\/?$/, '');
      switch (contentType) {
        case CONTENT_TYPES.SHORTS: return `${baseUrl}/shorts`;
        case CONTENT_TYPES.LIVE: return `${baseUrl}/streams`;
        case CONTENT_TYPES.PLAYLISTS: return `${baseUrl}/playlists`;
        default: return `${baseUrl}/videos`;
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
    [CONTENT_TYPES.VIDEOS]: 'videos',
    [CONTENT_TYPES.SHORTS]: 'shorts',
    [CONTENT_TYPES.LIVE]: 'live',
    [CONTENT_TYPES.PLAYLISTS]: 'playlists',
    [CONTENT_TYPES.AUDIO]: 'audio',
    [CONTENT_TYPES.THUMBNAILS]: 'thumbnails',
    [CONTENT_TYPES.SUBTITLES]: 'subtitles',
    [CONTENT_TYPES.PHOTOS]: 'photos',
    [CONTENT_TYPES.REELS]: 'reels',
    [CONTENT_TYPES.STORIES]: 'stories',
    [CONTENT_TYPES.HIGHLIGHTS]: 'highlights',
    [CONTENT_TYPES.TAGGED]: 'tagged',
    [CONTENT_TYPES.METADATA]: 'metadata',
  };
  return map[contentType] || 'other';
}

/**
 * Determine whether to use gallery-dl instead of yt-dlp.
 */
function shouldUseGalleryDl(platform, contentType, galleryDlAvailable) {
  if (!galleryDlAvailable) return false;

  // Instagram photos, stories, highlights → gallery-dl
  if (platform === PLATFORMS.INSTAGRAM) {
    if ([CONTENT_TYPES.PHOTOS, CONTENT_TYPES.STORIES, CONTENT_TYPES.HIGHLIGHTS, CONTENT_TYPES.TAGGED].includes(contentType)) {
      return true;
    }
  }

  // Facebook photos → gallery-dl
  if (platform === PLATFORMS.FACEBOOK && contentType === CONTENT_TYPES.PHOTOS) {
    return true;
  }

  // X photos → gallery-dl
  if (platform === PLATFORMS.X && contentType === CONTENT_TYPES.PHOTOS) {
    return true;
  }

  return false;
}

/**
 * Display download summary.
 */
export function displaySummary(result) {
  const minutes = Math.floor(result.duration / 60);
  const seconds = result.duration % 60;
  const timeStr = minutes > 0
    ? t('downloader.summary_minutes', { min: minutes, sec: seconds })
    : t('downloader.summary_seconds', { sec: seconds });

  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log(`  │  ${pad45(t('downloader.summary_title'))}│`);
  console.log('  ├─────────────────────────────────────────────┤');
  console.log(`  │  ✔ ${pad45(`${t('downloader.summary_success')}  : ${result.success}`).slice(2)}│`);
  console.log(`  │  ↷ ${pad45(`${t('downloader.summary_skipped')} : ${result.skipped}`).slice(2)}│`);
  console.log(`  │  ✖ ${pad45(`${t('downloader.summary_errors')}    : ${result.errors}`).slice(2)}│`);
  console.log(`  │  ⏱ ${pad45(`${t('downloader.summary_time')}  : ${timeStr}`).slice(2)}│`);
  console.log(`  │  📁 ${pad45(`${t('downloader.summary_path')}   : ${result.outputDir}`).slice(2)}│`);

  if (result.errorList && result.errorList.length > 0) {
    console.log('  ├─────────────────────────────────────────────┤');
    console.log(`  │  ${pad45(t('downloader.summary_error_files'))}│`);
    for (const err of result.errorList.slice(0, 5)) {
      const line = `  - ${err.file} → ${err.error}`;
      console.log(`  │  ${line.slice(0, 43).padEnd(43)}│`);
    }
    if (result.errorList.length > 5) {
      console.log(`  │  ${pad45(t('downloader.summary_more_errors', { n: result.errorList.length - 5 }))}│`);
    }
  }
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
}

function pad45(str) {
  const s = str || '';
  if (s.length >= 43) return s.slice(0, 43);
  return s + ' '.repeat(43 - s.length);
}

/**
 * Show post-download actions menu.
 * @returns {'open' | 'retry' | 'new' | 'back'}
 */
export async function promptPostActions(hasErrors) {
  const choices = [
    { name: t('downloader.post_open_folder'), value: 'open' },
  ];

  if (hasErrors) {
    choices.push({ name: t('downloader.post_retry'), value: 'retry' });
  }

  choices.push(
    { name: t('downloader.post_new'), value: 'new' },
    { name: t('downloader.post_back'), value: 'back' },
  );

  const { action } = await inquirer.prompt([
    { type: 'select', name: 'action', message: t('downloader.post_next'), choices },
  ]);

  return action;
}

/**
 * Open output folder in system file manager.
 */
export function openFolder(folderPath) {
  const cmds = {
    darwin: 'open',
    win32: 'explorer',
    linux: 'xdg-open',
  };
  const cmd = cmds[process.platform] || 'open';

  try {
    execSync(`${cmd} "${folderPath}"`);
  } catch {
    ui.warn(t('downloader.open_folder_error', { path: folderPath }));
  }
}

