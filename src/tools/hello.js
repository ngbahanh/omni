// src/tools/hello.js
import { ui } from "../ui.js";
import { logger } from "../logger.js";
import { loadConfig, saveConfig } from "../config.js";
import inquirer from "inquirer";

export const meta = {
  label: "Hello World",
  description: "Greets you by name — remembers your name",
};

export async function run() {
  logger.info("hello", "Tool started");
  ui.title("Hello World");

  try {
    // Load saved config, with defaults
    const config = loadConfig("hello", { userName: null });

    let name = config.userName;

    if (!name) {
      const answer = await inquirer.prompt([
        { type: "input", name: "name", message: "What is your name?" },
      ]);
      name = answer.name;
      saveConfig("hello", { userName: name }); // persist for next time
      ui.info("Name saved for future sessions.");
    } else {
      ui.dim(`Welcome back, ${name}! (saved from last session)`);
    }

    logger.info("hello", "User greeted", { name });
    ui.success(`Hello, ${name}!`);
  } catch (err) {
    logger.error("hello", err.message, { stack: err.stack });
    ui.error("Something went wrong: " + err.message);
  }
}
