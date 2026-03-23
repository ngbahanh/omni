// src/tools/_media-downloader/advanced-options.js
// Advanced download options: limit, date filter, keyword, file template

import inquirer from "inquirer";
import { t } from "../../i18n/index.js";

/**
 * Prompt user for advanced download options.
 * @param {object} config - current config
 * @returns {{ flags: string[], template: string | null }}
 */
export async function promptAdvancedOptions(config) {
  const { choice } = await inquirer.prompt([
    {
      type: "select",
      name: "choice",
      message: t("downloader.advanced_title"),
      choices: [
        { name: t("downloader.advanced_none"), value: "none" },
        { name: t("downloader.advanced_limit"), value: "limit" },
        { name: t("downloader.advanced_date"), value: "date" },
        { name: t("downloader.advanced_keyword"), value: "keyword" },
        { name: t("downloader.advanced_file_template"), value: "template" },
      ],
    },
  ]);

  const flags = [];
  let template = config.fileTemplate || null;

  if (choice === "none") {
    return { flags, template };
  }

  if (choice === "limit") {
    const { count } = await inquirer.prompt([
      {
        type: "input",
        name: "count",
        message: t("downloader.advanced_limit_prompt"),
        validate: (input) => {
          if (!input.trim()) return true;
          const n = parseInt(input, 10);
          if (isNaN(n) || n <= 0) {
            return t("downloader.advanced_limit_positive");
          }
          return true;
        },
      },
    ]);
    if (count.trim()) {
      flags.push("--playlist-end", count.trim());
    }
  }

  if (choice === "date") {
    const { dateAfter } = await inquirer.prompt([
      {
        type: "input",
        name: "dateAfter",
        message: t("downloader.advanced_date_start"),
        validate: (input) => {
          if (!input.trim()) return true;
          if (!/^\d{8}$/.test(input.trim())) return "Format: YYYYMMDD";
          return true;
        },
      },
    ]);
    const { dateBefore } = await inquirer.prompt([
      {
        type: "input",
        name: "dateBefore",
        message: t("downloader.advanced_date_end"),
        validate: (input) => {
          if (!input.trim()) return true;
          if (!/^\d{8}$/.test(input.trim())) return "Format: YYYYMMDD";
          return true;
        },
      },
    ]);
    if (dateAfter.trim()) flags.push("--dateafter", dateAfter.trim());
    if (dateBefore.trim()) flags.push("--datebefore", dateBefore.trim());
  }

  if (choice === "keyword") {
    const { keyword } = await inquirer.prompt([
      {
        type: "input",
        name: "keyword",
        message: t("downloader.advanced_keyword_prompt"),
      },
    ]);
    if (keyword.trim()) {
      flags.push("--match-filter", `title~=${keyword.trim()}`);
    }
  }

  if (choice === "template") {
    const { preset } = await inquirer.prompt([
      {
        type: "select",
        name: "preset",
        message: t("downloader.advanced_template_select"),
        choices: [
          {
            name: t("downloader.advanced_template_default"),
            value: "%(title)s [%(id)s].%(ext)s",
          },
          {
            name: t("downloader.advanced_template_date"),
            value: "%(upload_date)s - %(title)s.%(ext)s",
          },
          {
            name: t("downloader.advanced_template_index"),
            value: "%(playlist_index)s - %(title)s.%(ext)s",
          },
          {
            name: t("downloader.advanced_template_enter"),
            value: "__custom__",
          },
        ],
      },
    ]);
    if (preset === "__custom__") {
      const { custom } = await inquirer.prompt([
        {
          type: "input",
          name: "custom",
          message: t("downloader.advanced_template_enter"),
        },
      ]);
      template = custom.trim() || template;
    } else {
      template = preset;
    }
  }

  return { flags, template };
}
