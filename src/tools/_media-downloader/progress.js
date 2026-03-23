// src/tools/_media-downloader/progress.js
// ANSI-based in-place progress display for downloads

import { t } from '../../i18n/index.js';

/**
 * Create a progress renderer that updates a single line in-place.
 */
export function createProgressRenderer() {
  let lastLineCount = 0;

  return {
    /**
     * Parse yt-dlp download progress line.
     * @param {string} line - raw stdout line from yt-dlp
     * @returns {{ percent: number, size: string, speed: string, eta: string } | null}
     */
    parseYtDlpProgress(line) {
      // Pattern: [download]  45.3% of 234.56MiB at 3.20MiB/s ETA 00:45
      const match = line.match(
        /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/,
      );
      if (match) {
        return {
          percent: parseFloat(match[1]),
          size: match[2],
          speed: match[3],
          eta: match[4],
        };
      }
      return null;
    },

    /**
     * Parse yt-dlp video counter line.
     * @param {string} line
     * @returns {{ current: number, total: number } | null}
     */
    parseVideoCounter(line) {
      // Pattern: [download] Downloading video X of Y
      const match = line.match(/\[download\]\s+Downloading\s+video\s+(\d+)\s+of\s+(\d+)/);
      if (match) {
        return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
      }
      return null;
    },

    /**
     * Parse destination filename.
     * @param {string} line
     * @returns {string | null}
     */
    parseDestination(line) {
      // Pattern: [download] Destination: filepath
      const match = line.match(/\[download\]\s+Destination:\s+(.+)$/);
      if (match) return match[1].trim();
      return null;
    },

    /**
     * Check if line indicates already downloaded.
     * @param {string} line
     * @returns {boolean}
     */
    isAlreadyDownloaded(line) {
      return line.includes('has already been downloaded') || line.includes('has already been recorded');
    },

    /**
     * Render progress bar.
     * @param {object} opts
     * @param {number} opts.percent
     * @param {string} opts.size
     * @param {string} opts.speed
     * @param {string} opts.eta
     * @param {string} opts.filename
     * @param {number} opts.current - current video number
     * @param {number} opts.total - total videos
     * @param {number} opts.completed - completed count
     * @param {number} opts.errors - error count
     */
    render({ percent = 0, size = '', speed = '', eta = '', filename = '', current = 0, total = 0, completed = 0, errors = 0 }) {
      const barWidth = 30;
      const filled = Math.round((percent / 100) * barWidth);
      const empty = barWidth - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);

      const lines = [];

      if (total > 0) {
        lines.push(`  Video ${current}/${total}: ${truncate(filename, 45)}`);
      } else if (filename) {
        lines.push(`  ${truncate(filename, 55)}`);
      }

      lines.push(`  [${bar}] ${percent.toFixed(1)}% — ${size} — ${speed} — ETA ${eta}`);

      if (completed > 0 || errors > 0) {
        lines.push(`  ✔ ${t('downloader.progress_completed', { n: completed })}  ✖ ${t('downloader.progress_errors_count', { n: errors })}`);
      }

      // Move cursor up to overwrite previous lines
      if (lastLineCount > 0) {
        process.stdout.write(`\x1b[${lastLineCount}A`);
      }

      for (const line of lines) {
        process.stdout.write(`\x1b[2K${line}\n`); // clear line + write
      }

      lastLineCount = lines.length;
    },

    /**
     * Print final line (not overwritable).
     */
    finish() {
      lastLineCount = 0;
    },

    /**
     * Clear the progress area.
     */
    clear() {
      if (lastLineCount > 0) {
        for (let i = 0; i < lastLineCount; i++) {
          process.stdout.write('\x1b[1A\x1b[2K');
        }
        lastLineCount = 0;
      }
    },
  };
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
