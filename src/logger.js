// src/logger.js
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, "../.agents/logs");
const MAIN_LOG = resolve(LOG_DIR, "omni.log");
const ERR_LOG = resolve(LOG_DIR, "errors.log");

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function write(file, level, tool, message, data) {
  ensureLogDir();
  const entry = JSON.stringify({
    ts: timestamp(),
    level,
    tool,
    message,
    ...(data ? { data } : {}),
  });
  appendFileSync(file, entry + "\n", "utf-8");
}

export const logger = {
  info: (tool, message, data) => write(MAIN_LOG, "INFO", tool, message, data),
  warn: (tool, message, data) => write(MAIN_LOG, "WARN", tool, message, data),
  error: (tool, message, data) => {
    write(MAIN_LOG, "ERROR", tool, message, data);
    write(ERR_LOG, "ERROR", tool, message, data);
  },
  debug: (tool, message, data) => {
    if (process.env.OMNI_DEBUG === "1") {
      write(MAIN_LOG, "DEBUG", tool, message, data);
    }
  },
};
