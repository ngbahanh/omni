// src/tools/settings.js
import inquirer from 'inquirer';
import { existsSync, mkdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { ui } from '../ui.js';
import { logger } from '../logger.js';
import { loadConfig, saveConfig, clearConfig } from '../config.js';
import { initI18n, t, getCurrentLocale, getSupportedLocales } from '../i18n/index.js';
import { initTheme } from '../ui.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_NAME = 'omni-global';

const PLATFORMS = [
  { key: 'youtube', label: 'YouTube', testUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { key: 'tiktok', label: 'TikTok', testUrl: 'https://www.tiktok.com/@tiktok' },
  { key: 'instagram', label: 'Instagram', testUrl: 'https://www.instagram.com/instagram/' },
  { key: 'facebook', label: 'Facebook', testUrl: 'https://www.facebook.com/facebook' },
  { key: 'x', label: 'X (Twitter)', testUrl: 'https://x.com/x' },
];

export const meta = {
  label: '⚙ Settings',
  description: 'Configure omni settings',
};

export async function run() {
  logger.info('settings', 'Tool started');

  try {
    await settingsMenu();
  } catch (err) {
    if (err.message?.includes('User force closed')) {
      ui.dim(t('downloader.cancelled'));
    } else {
      logger.error('settings', err.message, { stack: err.stack });
      ui.error(err.message);
    }
  }

  logger.info('settings', 'Tool finished');
}

// ─── Main Settings Menu ────────────────────────────────────────

async function settingsMenu() {
  while (true) {
    console.log('');
    ui.title(`⚙ ${t('settings.title')}`);
    console.log('─'.repeat(40));

    const { section } = await inquirer.prompt([
      {
        type: 'select',
        name: 'section',
        message: t('settings.title'),
        choices: [
          { name: `🌐 ${t('settings.section_language')}`, value: 'language' },
          { name: `📁 ${t('settings.section_downloads')}`, value: 'downloads' },
          { name: `🔒 ${t('settings.section_auth')}`, value: 'auth' },
          { name: `🔧 ${t('settings.section_advanced')}`, value: 'advanced' },
          { name: `ℹ  ${t('settings.section_about')}`, value: 'about' },
          new inquirer.Separator(),
          { name: `← ${t('common.return_main')}`, value: 'exit' },
        ],
      },
    ]);

    if (section === 'exit') return;

    if (section === 'language') await sectionLanguage();
    else if (section === 'downloads') await sectionDownloads();
    else if (section === 'auth') await sectionAuth();
    else if (section === 'advanced') await sectionAdvanced();
    else if (section === 'about') await sectionAbout();
  }
}

// ─── Language Section ──────────────────────────────────────────

async function sectionLanguage() {
  const currentLang = getCurrentLocale();
  const locales = getSupportedLocales();
  const currentLabel = locales.find(l => l.code === currentLang)?.label ?? currentLang;

  console.log('');
  ui.info(t('settings.language_current', { lang: currentLabel }));
  console.log('');

  const { lang } = await inquirer.prompt([
    {
      type: 'select',
      name: 'lang',
      message: t('settings.language_change'),
      choices: [
        ...locales.map(l => ({
          name: l.code === currentLang ? `${l.label} ✔` : l.label,
          value: l.code,
        })),
        new inquirer.Separator(),
        { name: `← ${t('common.back')}`, value: '__BACK__' },
      ],
    },
  ]);

  if (lang === '__BACK__') return;

  if (lang === currentLang) {
    ui.info(t('settings.language_already'));
    return;
  }

  // Save and reload
  const config = loadConfig(CONFIG_NAME, {});
  config.language = lang;
  saveConfig(CONFIG_NAME, config);
  await initI18n();

  ui.success(t('settings.saved'));
  ui.info(t('settings.language_restart_note'));
}

// ─── Downloads Section ─────────────────────────────────────────

async function sectionDownloads() {
  const config = loadConfig(CONFIG_NAME, { outputDir: 'downloads' });

  console.log('');
  console.log(`📁 ${t('settings.output_dir')}`);
  ui.info(t('settings.output_dir_current', { path: config.outputDir }));
  console.log('');

  const { action } = await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: t('settings.output_dir'),
      choices: [
        { name: t('settings.output_dir_change'), value: 'change' },
        { name: `← ${t('common.back')}`, value: 'back' },
      ],
    },
  ]);

  if (action === 'back') return;

  const { newPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'newPath',
      message: t('settings.output_dir_change'),
      default: config.outputDir,
    },
  ]);

  const dir = newPath.trim() || config.outputDir;
  const fullPath = resolve(__dirname, '../..', dir);

  if (!existsSync(fullPath)) {
    const { create } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'create',
        message: t('settings.output_dir_invalid'),
        default: true,
      },
    ]);
    if (create) {
      mkdirSync(fullPath, { recursive: true });
    } else {
      return;
    }
  }

  config.outputDir = dir;
  saveConfig(CONFIG_NAME, config);
  ui.success(t('settings.saved'));
}

// ─── Auth Section ──────────────────────────────────────────────

async function sectionAuth() {
  const config = loadConfig(CONFIG_NAME, {
    cookiesPaths: { youtube: null, tiktok: null, instagram: null, facebook: null, x: null },
    cookiesStatus: { youtube: 'none', tiktok: 'none', instagram: 'none', facebook: 'none', x: 'none' },
  });

  // Display status table
  console.log('');
  ui.title(`🔒 ${t('settings.auth_title')}`);
  console.log('');
  console.log(`  ${t('settings.auth_platform').padEnd(14)} ${t('settings.auth_status').padEnd(18)} ${t('settings.auth_action')}`);
  console.log('  ' + '─'.repeat(55));

  for (const p of PLATFORMS) {
    const status = config.cookiesStatus?.[p.key] ?? 'none';
    let statusText, actionText;

    if (status === 'none') {
      statusText = t('settings.auth_none');
      actionText = `[${t('settings.auth_set')}]`;
    } else if (status === 'ok') {
      statusText = t('settings.auth_ok');
      actionText = `[${t('settings.auth_update')}] [${t('settings.auth_remove')}]`;
    } else {
      statusText = t('settings.auth_expired');
      actionText = `[${t('settings.auth_update')}] [${t('settings.auth_remove')}]`;
    }

    console.log(`  ${p.label.padEnd(14)} ${statusText.padEnd(18)} ${actionText}`);
  }

  console.log('');

  // Platform selection
  const { platform } = await inquirer.prompt([
    {
      type: 'select',
      name: 'platform',
      message: t('settings.auth_platform'),
      choices: [
        ...PLATFORMS.map(p => ({ name: p.label, value: p.key })),
        new inquirer.Separator(),
        { name: `← ${t('common.back')}`, value: '__BACK__' },
      ],
    },
  ]);

  if (platform === '__BACK__') return;

  await managePlatformAuth(platform, config);
}

async function managePlatformAuth(platformKey, config) {
  const platform = PLATFORMS.find(p => p.key === platformKey);
  const status = config.cookiesStatus?.[platformKey] ?? 'none';
  const hasAuth = status !== 'none';

  const choices = [];
  if (!hasAuth) {
    choices.push({ name: t('settings.auth_set'), value: 'set' });
  } else {
    choices.push({ name: t('settings.auth_update'), value: 'update' });
    choices.push({ name: t('settings.auth_remove'), value: 'remove' });
  }
  choices.push({ name: t('settings.auth_guide'), value: 'guide' });
  choices.push(new inquirer.Separator());
  choices.push({ name: `← ${t('common.back')}`, value: 'back' });

  const { action } = await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: platform.label,
      choices,
    },
  ]);

  if (action === 'back') return;

  if (action === 'guide') {
    console.log('');
    ui.info(t('settings.auth_how_to', { platform: platform.label }));
    console.log('');
    // Stay in platform menu
    return managePlatformAuth(platformKey, config);
  }

  if (action === 'remove') {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `${t('settings.auth_remove')} ${platform.label}?`,
        default: false,
      },
    ]);
    if (confirm) {
      config.cookiesPaths[platformKey] = null;
      config.cookiesStatus[platformKey] = 'none';
      saveConfig(CONFIG_NAME, config);
      ui.success(t('settings.auth_cookies_removed', { platform: platform.label }));
    }
    return;
  }

  // Set or Update
  ui.info(t('settings.auth_how_to', { platform: platform.label }));

  const { cookiesPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'cookiesPath',
      message: t('settings.auth_cookies_path'),
    },
  ]);

  const resolvedPath = resolve(cookiesPath.trim());
  if (!existsSync(resolvedPath)) {
    ui.error(t('settings.auth_cookies_invalid', { path: resolvedPath }));
    return;
  }

  // Test cookies
  let testOk = false;
  try {
    ui.info(t('settings.about_deps'));
    execSync(`yt-dlp --cookies "${resolvedPath}" --simulate "${platform.testUrl}"`, {
      timeout: 30000,
      stdio: 'pipe',
    });
    testOk = true;
  } catch {
    testOk = false;
  }

  if (testOk) {
    config.cookiesPaths[platformKey] = resolvedPath;
    config.cookiesStatus[platformKey] = 'ok';
    saveConfig(CONFIG_NAME, config);
    ui.success(t('settings.auth_cookies_saved', { platform: platform.label }));
  } else {
    const { saveAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'saveAnyway',
        message: t('settings.auth_cookies_invalid_confirm'),
        default: false,
      },
    ]);
    if (saveAnyway) {
      config.cookiesPaths[platformKey] = resolvedPath;
      config.cookiesStatus[platformKey] = 'expired';
      saveConfig(CONFIG_NAME, config);
      ui.success(t('settings.auth_cookies_saved', { platform: platform.label }));
    }
  }
}

// ─── Advanced Section ──────────────────────────────────────────

async function sectionAdvanced() {
  const config = loadConfig(CONFIG_NAME, {
    sleepInterval: [1, 3],
    maxRetries: 3,
    fileTemplate: '%(upload_date)s - %(title)s [%(id)s].%(ext)s',
  });

  while (true) {
    const { option } = await inquirer.prompt([
      {
        type: 'select',
        name: 'option',
        message: t('settings.section_advanced'),
        choices: [
          { name: `${t('settings.advanced_sleep')}  [${config.sleepInterval[0]}, ${config.sleepInterval[1]}]s`, value: 'sleep' },
          { name: `${t('settings.advanced_retries')}  ${config.maxRetries}`, value: 'retries' },
          { name: `${t('settings.advanced_template')}`, value: 'template' },
          new inquirer.Separator(),
          { name: `⚠ ${t('settings.advanced_reset')}`, value: 'reset' },
          { name: `← ${t('common.back')}`, value: 'back' },
        ],
      },
    ]);

    if (option === 'back') return;

    if (option === 'sleep') {
      ui.dim(t('settings.advanced_sleep_hint'));
      const { min } = await inquirer.prompt([
        { type: 'input', name: 'min', message: t('settings.advanced_sleep_min'), default: String(config.sleepInterval[0]) },
      ]);
      const { max } = await inquirer.prompt([
        { type: 'input', name: 'max', message: t('settings.advanced_sleep_max'), default: String(config.sleepInterval[1]) },
      ]);
      const minVal = Math.max(0, parseInt(min) || 0);
      const maxVal = Math.min(30, Math.max(minVal, parseInt(max) || minVal));
      config.sleepInterval = [minVal, maxVal];
      saveConfig(CONFIG_NAME, config);
      ui.success(t('settings.saved'));
    }

    if (option === 'retries') {
      const { retries } = await inquirer.prompt([
        { type: 'input', name: 'retries', message: t('settings.advanced_retries_prompt'), default: String(config.maxRetries) },
      ]);
      const val = Math.min(10, Math.max(1, parseInt(retries) || 3));
      config.maxRetries = val;
      saveConfig(CONFIG_NAME, config);
      ui.success(t('settings.saved'));
    }

    if (option === 'template') {
      const { template } = await inquirer.prompt([
        {
          type: 'select',
          name: 'template',
          message: t('settings.advanced_template'),
          choices: [
            { name: '%(upload_date)s - %(title)s [%(id)s].%(ext)s', value: '%(upload_date)s - %(title)s [%(id)s].%(ext)s' },
            { name: '%(title)s [%(id)s].%(ext)s', value: '%(title)s [%(id)s].%(ext)s' },
            { name: '%(playlist_index)s - %(title)s.%(ext)s', value: '%(playlist_index)s - %(title)s.%(ext)s' },
            { name: `✏ ${t('settings.advanced_template_custom')}`, value: '__CUSTOM__' },
          ],
        },
      ]);

      let finalTemplate = template;
      if (template === '__CUSTOM__') {
        const { custom } = await inquirer.prompt([
          { type: 'input', name: 'custom', message: t('settings.advanced_template'), default: config.fileTemplate },
        ]);
        finalTemplate = custom.trim() || config.fileTemplate;
      }
      config.fileTemplate = finalTemplate;
      saveConfig(CONFIG_NAME, config);
      ui.success(t('settings.saved'));
    }

    if (option === 'reset') {
      const { confirm } = await inquirer.prompt([
        { type: 'confirm', name: 'confirm', message: t('settings.advanced_reset_confirm'), default: false },
      ]);
      if (confirm) {
        clearConfig(CONFIG_NAME);
        ui.success(t('settings.advanced_reset_done'));
        return; // exit settings — next run will trigger first-run
      }
    }
  }
}

// ─── About Section ─────────────────────────────────────────────

async function sectionAbout() {
  const pkg = await import('../../package.json', { with: { type: 'json' } }).then(m => m.default).catch(() => ({ version: '?.?.?' }));

  console.log('');
  console.log('  ┌────────────────────────────────────────────┐');
  console.log(`  │  ${t('settings.about_version', { version: pkg.version }).padEnd(42)}│`);
  console.log(`  │  ${t('settings.about_node', { version: process.version }).padEnd(42)}│`);
  console.log('  ├────────────────────────────────────────────┤');
  console.log(`  │  ${t('settings.about_deps').padEnd(42)}│`);

  // Check dependencies
  const deps = [
    { name: 'yt-dlp', cmd: 'yt-dlp --version' },
    { name: 'gallery-dl', cmd: 'gallery-dl --version' },
    { name: 'ffmpeg', cmd: 'ffmpeg -version' },
  ];

  for (const dep of deps) {
    try {
      const output = execSync(dep.cmd, { timeout: 5000, stdio: 'pipe' }).toString().trim();
      const version = dep.name === 'ffmpeg'
        ? output.split('\n')[0].match(/version\s+([\S]+)/)?.[1] ?? '?'
        : output.split('\n')[0].trim();
      console.log(`  │  ${t('settings.about_dep_ok', { name: dep.name, version }).padEnd(42)}│`);
    } catch {
      console.log(`  │  ${t('settings.about_dep_missing', { name: dep.name }).padEnd(42)}│`);
    }
  }

  console.log('  ├────────────────────────────────────────────┤');
  console.log(`  │  ${t('settings.about_config_path')}: .agents/config/omni-global.json`.padEnd(44) + '│');
  console.log(`  │  ${t('settings.about_logs_path')}: .agents/logs/omni.log`.padEnd(44) + '│');
  console.log('  └────────────────────────────────────────────┘');
  console.log('');

  await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: '',
      choices: [{ name: `← ${t('common.back')}`, value: 'back' }],
    },
  ]);
}
