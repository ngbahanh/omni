// src/tools/_media-downloader/deps.js
// Dependency checker for external binaries: yt-dlp, gallery-dl, ffmpeg

import { execSync } from 'child_process';
import { ui } from '../../ui.js';
import { logger } from '../../logger.js';
import { TOOL_NAME, DEPENDENCIES, INSTALL_COMMANDS } from './constants.js';

/**
 * Check if a binary exists in PATH.
 * @param {string} name - binary name
 * @returns {boolean}
 */
function binaryExists(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execSync(`${cmd} ${name}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check all dependencies and display status table.
 * @returns {{ ok: boolean, galleryDlAvailable: boolean }}
 *   ok = false if any required dep is missing (tool should exit)
 */
export function checkDependencies() {
  const os = process.platform;
  const installCmds = INSTALL_COMMANDS[os] || INSTALL_COMMANDS.linux;

  const results = DEPENDENCIES.map((dep) => ({
    ...dep,
    found: binaryExists(dep.name),
    installCmd: installCmds[dep.name] || 'N/A',
  }));

  const missing = results.filter((r) => !r.found);
  const galleryDlAvailable = results.find((r) => r.name === 'gallery-dl')?.found ?? false;

  if (missing.length > 0) {
    console.log('');
    ui.title('  Missing dependencies');
    console.log('  ┌──────────────┬───────────┬─────────────────────────────────┐');
    console.log('  │  Binary      │  Status   │  Install command               │');
    console.log('  ├──────────────┼───────────┼─────────────────────────────────┤');

    for (const r of results) {
      const status = r.found ? '✔ OK     ' : '✖ Missing';
      const install = r.found ? '-' : r.installCmd;
      const name = r.name.padEnd(12);
      console.log(`  │  ${name}│  ${status}│  ${install.padEnd(31)}│`);
    }

    console.log('  └──────────────┴───────────┴─────────────────────────────────┘');
    console.log('');
  } else {
    logger.debug(TOOL_NAME, 'All dependencies found');
  }

  const requiredMissing = missing.filter((r) => r.required);
  if (requiredMissing.length > 0) {
    ui.error(
      `Required dependencies missing: ${requiredMissing.map((r) => r.name).join(', ')}. Cannot continue.`,
    );
    logger.error(TOOL_NAME, 'Required dependencies missing', {
      missing: requiredMissing.map((r) => r.name),
    });
    return { ok: false, galleryDlAvailable };
  }

  if (!galleryDlAvailable) {
    ui.warn(
      'gallery-dl not found. Instagram photos/stories and Facebook photos/albums will be unavailable.',
    );
    logger.warn(TOOL_NAME, 'gallery-dl not found — some features disabled');
  }

  return { ok: true, galleryDlAvailable };
}
