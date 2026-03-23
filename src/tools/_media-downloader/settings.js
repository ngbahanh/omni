// src/tools/_media-downloader/settings.js
// Settings sub-menu for media-downloader

import inquirer from 'inquirer';
import { ui } from '../../ui.js';
import { logger } from '../../logger.js';
import { loadConfig, saveConfig } from '../../config.js';
import { t } from '../../i18n/index.js';
import { TOOL_NAME, DEFAULT_CONFIG } from './constants.js';

/**
 * Show settings menu and let user modify config values.
 */
export async function showSettingsMenu() {
  const config = loadConfig(TOOL_NAME, DEFAULT_CONFIG);

  const { setting } = await inquirer.prompt([
    {
      type: 'select',
      name: 'setting',
      message: t('downloader.md_settings'),
      choices: [
        { name: t('downloader.md_output_dir', { path: config.outputDir }), value: 'outputDir' },
        { name: t('downloader.md_quality', { quality: config.defaultQuality }), value: 'defaultQuality' },
        { name: t('downloader.md_audio_format', { format: config.defaultAudioFormat }), value: 'defaultAudioFormat' },
        { name: t('downloader.md_sub_langs', { langs: (config.defaultSubLangs || []).join(', ') }), value: 'defaultSubLangs' },
        { name: t('downloader.md_sleep', { min: (config.sleepInterval || [1, 3])[0], max: (config.sleepInterval || [1, 3])[1] }), value: 'sleepInterval' },
        { name: t('downloader.md_retries', { n: config.maxRetries }), value: 'maxRetries' },
        { name: t('downloader.md_template', { template: config.fileTemplate }), value: 'fileTemplate' },
        new inquirer.Separator(),
        { name: t('downloader.md_reset'), value: 'reset' },
        { name: t('common.back'), value: 'back' },
      ],
    },
  ]);

  if (setting === 'back') return;

  if (setting === 'reset') {
    saveConfig(TOOL_NAME, { ...DEFAULT_CONFIG, history: config.history, cookiesPaths: config.cookiesPaths });
    ui.success(t('downloader.md_reset_done'));
    logger.info(TOOL_NAME, 'Settings reset to defaults');
    return;
  }

  if (setting === 'outputDir') {
    const { value } = await inquirer.prompt([
      { type: 'input', name: 'value', message: t('downloader.md_output_dir', { path: '' }).replace(': ', ':'), default: config.outputDir },
    ]);
    config.outputDir = value.trim() || config.outputDir;
  }

  if (setting === 'defaultQuality') {
    const { value } = await inquirer.prompt([
      {
        type: 'select',
        name: 'value',
        message: t('downloader.md_quality_prompt'),
        choices: [
          { name: t('downloader.md_quality_best'), value: 'best' },
          { name: '1080p', value: '1080' },
          { name: '720p', value: '720' },
          { name: '480p', value: '480' },
        ],
      },
    ]);
    config.defaultQuality = value;
  }

  if (setting === 'defaultAudioFormat') {
    const { value } = await inquirer.prompt([
      {
        type: 'select',
        name: 'value',
        message: t('downloader.md_audio_format', { format: '' }).replace(': ', ':'),
        choices: ['mp3', 'aac', 'flac', 'wav', 'opus'],
      },
    ]);
    config.defaultAudioFormat = value;
  }

  if (setting === 'defaultSubLangs') {
    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: t('downloader.md_sub_langs_prompt'),
        default: (config.defaultSubLangs || []).join(', '),
      },
    ]);
    config.defaultSubLangs = value.split(',').map((s) => s.trim()).filter(Boolean);
  }

  if (setting === 'sleepInterval') {
    const { min } = await inquirer.prompt([
      { type: 'input', name: 'min', message: t('settings.advanced_sleep_min'), default: String(config.sleepInterval?.[0] || 1) },
    ]);
    const { max } = await inquirer.prompt([
      { type: 'input', name: 'max', message: t('settings.advanced_sleep_max'), default: String(config.sleepInterval?.[1] || 3) },
    ]);
    config.sleepInterval = [parseInt(min, 10) || 1, parseInt(max, 10) || 3];
  }

  if (setting === 'maxRetries') {
    const { value } = await inquirer.prompt([
      { type: 'input', name: 'value', message: t('settings.advanced_retries_prompt'), default: String(config.maxRetries) },
    ]);
    config.maxRetries = parseInt(value, 10) || 3;
  }

  if (setting === 'fileTemplate') {
    const { value } = await inquirer.prompt([
      { type: 'input', name: 'value', message: t('downloader.md_template', { template: '' }).replace(': ', ':'), default: config.fileTemplate },
    ]);
    config.fileTemplate = value.trim() || config.fileTemplate;
  }

  saveConfig(TOOL_NAME, config);
  ui.success(t('common.saved'));
  logger.info(TOOL_NAME, 'Settings updated', { setting, value: config[setting] });
}
