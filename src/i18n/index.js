// src/i18n/index.js
import { loadConfig } from '../config.js';

let currentLocale = 'en';
let strings = {};

export async function initI18n() {
  const config = loadConfig('omni-global', { language: 'en' });
  currentLocale = config.language ?? 'en';
  const mod = await import(`./locales/${currentLocale}.js`);
  strings = mod.default;
}

// t('key') or t('key', { name: 'Nam' }) for interpolation
export function t(key, vars = {}) {
  const parts = key.split('.');
  let val = strings;
  for (const p of parts) {
    val = val?.[p];
    if (val === undefined) return key; // fallback: return key if not found
  }
  if (typeof val !== 'string') return key;
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export function getCurrentLocale() { return currentLocale; }

export function getSupportedLocales() {
  return [
    { code: 'en', label: 'English' },
    { code: 'vi', label: 'Tiếng Việt' },
  ];
}
