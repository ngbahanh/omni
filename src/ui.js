import chalk from "chalk";
import { loadConfig } from "./config.js";

// ─── Theme System ──────────────────────────────────────────────

const themes = {
  default: {
    primary: "blueBright",
    success: "green",
    error: "red",
    warn: "yellow",
    dim: "dim",
    title: "bold",
  },
  minimal: {
    primary: "white",
    success: "white",
    error: "white",
    warn: "white",
    dim: "dim",
    title: "bold",
  },
  vibrant: {
    primary: "magentaBright",
    success: "cyanBright",
    error: "redBright",
    warn: "yellowBright",
    dim: "dim",
    title: "bold",
  },
};

let activeTheme = themes.default;

export async function initTheme() {
  const config = loadConfig("omni-global", { theme: "default" });
  const themeName = config.theme ?? "default";
  activeTheme = themes[themeName] ?? themes.default;
}

function applyColor(colorName, text) {
  // Handle chained modifiers like "bold"
  let fn = chalk;
  for (const part of colorName.split(".")) {
    fn = fn[part];
  }
  return fn ? fn(text) : text;
}

// ─── UI Helpers ────────────────────────────────────────────────

export const ui = {
  success: (msg) => console.log(applyColor(activeTheme.success, "✔ " + msg)),
  error: (msg) => console.log(applyColor(activeTheme.error, "✖ " + msg)),
  info: (msg) => console.log(applyColor(activeTheme.primary, "ℹ " + msg)),
  warn: (msg) => console.log(applyColor(activeTheme.warn, "⚠ " + msg)),
  title: (msg) => console.log(chalk.bold(applyColor(activeTheme.primary, msg))),
  dim: (msg) => console.log(chalk.dim(msg)),
  dimText: (text) => chalk.dim(text), // returns string (does not print)
  separator: (char = "─", len = 45) =>
    console.log(chalk.dim("  " + char.repeat(len))),

  // Enhanced error display — use for categorized/friendly errors
  errorBox: (icon, message) => {
    console.log(applyColor(activeTheme.error, `  ${icon} ${message}`));
  },
  errorDetail: (text, isLast = true) => {
    const connector = isLast ? "└─" : "├─";
    console.log(chalk.dim(`    ${connector} ${text}`));
  },
  tip: (message) => {
    console.log(applyColor(activeTheme.warn, `  💡 ${message}`));
  },
};

export function banner() {
  console.log(
    applyColor(
      activeTheme.primary,
      chalk.bold(`
  ██████  ███    ███ ███    ██ ██ 
 ██    ██ ████  ████ ████   ██ ██ 
 ██    ██ ██ ████ ██ ██ ██  ██ ██ 
 ██    ██ ██  ██  ██ ██  ██ ██ ██ 
  ██████  ██      ██ ██   ████ ██ 
  `),
    ),
  );
  console.log(chalk.dim("  Multi-Tool CLI — type Ctrl+C to exit\n"));
}
