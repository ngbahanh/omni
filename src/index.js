#!/usr/bin/env node
import { initI18n } from "./i18n/index.js";
import { isFirstRun, runFirstRunSetup } from "./firstRun.js";
import { initTheme, banner } from "./ui.js";
import { showMenu } from "./menu.js";

async function main() {
  await initI18n();    // 1. load language from config (default 'en')
  await initTheme();   // 2. load theme from config (default 'default')
  banner();            // 3. display banner with loaded theme

  if (await isFirstRun()) {
    await runFirstRunSetup();
    await initI18n();  // 4. reload i18n after user chose language
    await initTheme(); // 5. reload theme after user chose theme
  }

  await showMenu();    // 6. enter main menu
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
