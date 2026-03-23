// src/tools/_template.js
// Copy this file to create a new tool: cp _template.js my-tool.js

import { ui } from "../ui.js";
import { logger } from "../logger.js";
import { loadConfig, saveConfig } from "../config.js";
import inquirer from "inquirer";

const TOOL_NAME = "my-tool"; // must match filename (without .js)

// Required: metadata used by the menu loader
export const meta = {
  label: "My Tool", // shown in the menu
  description: "Does something cool", // shown as hint
};

// Required: main function called when tool is selected
export async function run() {
  logger.info(TOOL_NAME, "Tool started");
  ui.title("My Tool");

  // Load config with defaults (add any persistent fields here)
  const config = loadConfig(TOOL_NAME, { lastUsed: null });

  try {
    const { name } = await inquirer.prompt([
      { type: "input", name: "name", message: "Enter your name:" },
    ]);

    // Save anything you want to remember between sessions
    saveConfig(TOOL_NAME, { ...config, lastUsed: new Date().toISOString() });

    logger.info(TOOL_NAME, "Tool finished", { name });
    ui.success(`Hello, ${name}!`);
  } catch (err) {
    logger.error(TOOL_NAME, err.message, { stack: err.stack });
    ui.error("Something went wrong: " + err.message);
  }
}
