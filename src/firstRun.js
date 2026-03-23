// src/firstRun.js
import inquirer from "inquirer";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadConfig, saveConfig } from "./config.js";
import { initI18n, t, getSupportedLocales } from "./i18n/index.js";
import { ui, initTheme } from "./ui.js";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_NAME = "omni-global";

export async function isFirstRun() {
  const config = loadConfig(CONFIG_NAME, {});
  return !config.setupCompleted;
}

export async function runFirstRunSetup() {
  logger.info("first-run", "First-run setup started");

  let step = 1;
  const settings = {
    language: "en",
    outputDir: "downloads",
    theme: "default",
  };

  while (step <= 4) {
    if (step === 1) {
      const result = await stepLanguage();
      settings.language = result;
      // Save language immediately and reload i18n + theme
      saveConfig(CONFIG_NAME, {
        ...loadConfig(CONFIG_NAME, {}),
        language: settings.language,
      });
      await initI18n();
      step = 2;
    } else if (step === 2) {
      const result = await stepOutputDir();
      if (result === "__BACK__") {
        step = 1;
        continue;
      }
      settings.outputDir = result;
      step = 3;
    } else if (step === 3) {
      const result = await stepTheme();
      if (result === "__BACK__") {
        step = 2;
        continue;
      }
      settings.theme = result;
      step = 4;
    } else if (step === 4) {
      const result = await stepConfirm(settings);
      if (result === "__BACK__") {
        step = 3;
        continue;
      }
      if (result === "save") {
        // Save all settings
        const config = loadConfig(CONFIG_NAME, {});
        saveConfig(CONFIG_NAME, {
          ...config,
          setupCompleted: true,
          setupDate: new Date().toISOString(),
          language: settings.language,
          outputDir: settings.outputDir,
          theme: settings.theme,
          sleepInterval: [1, 3],
          maxRetries: 3,
          fileTemplate: "%(upload_date)s - %(title)s [%(id)s].%(ext)s",
          cookiesPaths: {
            youtube: null,
            tiktok: null,
            instagram: null,
            facebook: null,
            x: null,
          },
          cookiesStatus: {
            youtube: "none",
            tiktok: "none",
            instagram: "none",
            facebook: "none",
            x: "none",
          },
        });

        // Reload theme
        await initTheme();

        console.log("");
        ui.success(t("first_run.finish"));
        console.log("");

        // Brief pause
        await new Promise((r) => setTimeout(r, 1500));
        step = 5; // exit loop
      }
    }
  }

  logger.info("first-run", "First-run setup completed", settings);
}

// ─── Step 1: Language (bilingual, no t()) ──────────────────────

async function stepLanguage() {
  console.log("");
  console.log("  ─────────────────────────────────────────");
  console.log("  Welcome to omni! / Chào mừng đến với omni!");
  console.log("  ─────────────────────────────────────────");
  console.log("  Step 1 / Bước 1 of/trong 4");
  console.log("");

  const locales = getSupportedLocales();
  const { language } = await inquirer.prompt([
    {
      type: "select",
      name: "language",
      message: "Choose your language / Chọn ngôn ngữ của bạn:",
      choices: locales.map((l) => ({ name: l.label, value: l.code })),
    },
  ]);

  return language;
}

// ─── Step 2: Output directory ──────────────────────────────────

async function stepOutputDir() {
  console.log("");
  console.log(`  ${t("first_run.step", { current: 2, total: 4 })}`);
  console.log("");

  const { outputDir } = await inquirer.prompt([
    {
      type: "input",
      name: "outputDir",
      message: `📁 ${t("first_run.output_question")}`,
      default: "downloads",
      suffix: `\n  ${ui.dimText(t("first_run.output_hint"))}`,
    },
  ]);

  const dir = outputDir.trim() || "downloads";
  const fullPath = resolve(__dirname, "..", dir);

  if (!existsSync(fullPath)) {
    const { create } = await inquirer.prompt([
      {
        type: "confirm",
        name: "create",
        message: t("settings.output_dir_invalid"),
        default: true,
      },
    ]);

    if (create) {
      mkdirSync(fullPath, { recursive: true });
    } else {
      return stepOutputDir(); // ask again
    }
  }

  // Show back option
  const { nav } = await inquirer.prompt([
    {
      type: "select",
      name: "nav",
      message: t("first_run.step", { current: 2, total: 4 }),
      choices: [
        { name: `✔ ${dir}  — ${t("common.confirm")}`, value: "next" },
        { name: `← ${t("common.back")}`, value: "back" },
      ],
    },
  ]);

  return nav === "back" ? "__BACK__" : dir;
}

// ─── Step 3: Theme ─────────────────────────────────────────────

async function stepTheme() {
  console.log("");
  console.log(`  ${t("first_run.step", { current: 3, total: 4 })}`);
  console.log("");

  const { theme } = await inquirer.prompt([
    {
      type: "select",
      name: "theme",
      message: `🎨 ${t("first_run.theme_question")}`,
      choices: [
        {
          name: `${t("first_run.theme_default")}  [\x1b[34m████\x1b[0m]`,
          value: "default",
        },
        { name: `${t("first_run.theme_minimal")}  [    ]`, value: "minimal" },
        {
          name: `${t("first_run.theme_vibrant")}  [\x1b[35m█\x1b[36m█\x1b[33m█\x1b[31m█\x1b[0m]`,
          value: "vibrant",
        },
        new inquirer.Separator(),
        { name: `← ${t("common.back")}`, value: "__BACK__" },
      ],
    },
  ]);

  return theme;
}

// ─── Step 4: Confirm ───────────────────────────────────────────

async function stepConfirm(settings) {
  const locales = getSupportedLocales();
  const langLabel =
    locales.find((l) => l.code === settings.language)?.label ??
    settings.language;
  const themeLabels = {
    default: t("first_run.theme_default"),
    minimal: t("first_run.theme_minimal"),
    vibrant: t("first_run.theme_vibrant"),
  };

  console.log("");
  console.log(`  ${t("first_run.step", { current: 4, total: 4 })}`);
  console.log("");
  console.log("  ┌──────────────────────────────────────┐");
  console.log(`  │  ${t("first_run.confirm_title").padEnd(36)}│`);
  console.log("  ├──────────────────────────────────────┤");
  console.log(
    `  │  ${t("first_run.confirm_language")}: ${langLabel}`.padEnd(40) + "│",
  );
  console.log(
    `  │  ${t("first_run.confirm_output")}: ${settings.outputDir}`.padEnd(40) +
      "│",
  );
  console.log(
    `  │  ${t("first_run.confirm_theme")}: ${themeLabels[settings.theme]}`.padEnd(
      40,
    ) + "│",
  );
  console.log("  └──────────────────────────────────────┘");
  console.log("");

  const { action } = await inquirer.prompt([
    {
      type: "select",
      name: "action",
      message: t("first_run.confirm_question"),
      choices: [
        { name: `✔ ${t("common.save")}`, value: "save" },
        { name: `← ${t("common.back")}`, value: "__BACK__" },
      ],
    },
  ]);

  return action;
}
