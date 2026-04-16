// src/tools/folder-generator.js
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import inquirer from "inquirer";
import { parse } from "csv-parse/sync";
import { ui } from "../ui.js";
import { logger } from "../logger.js";
import { loadConfig, saveConfig } from "../config.js";
import { t } from "../i18n/index.js";

const execAsync = promisify(exec);
const TOOL_NAME = "folder-generator";

export const meta = {
  label: `📁 ${t("folderGenerator.menu_title")}`,
  description: t("folderGenerator.menu_desc"),
};

async function setCreationTime(filePath, date) {
  try {
    const formattedDate = date.toISOString();
    // Use powershell to modify creation time on Windows
    await execAsync(
      `powershell.exe -Command "(Get-Item '${filePath.replace(
        /'/g,
        "''",
      )}').CreationTime = '${formattedDate}'"`,
    );
  } catch (err) {
    logger.debug(TOOL_NAME, "Failed to set CreationTime", {
      err: err.message,
    });
  }
}

async function copyRecursiveAndFormat(
  src,
  destParent,
  record,
  separator,
  targetTime,
) {
  let name = path.basename(src);
  for (const [key, value] of Object.entries(record)) {
    let finalValue = value ? String(value) : "";
    if (separator && finalValue.includes(separator)) {
      finalValue = finalValue.split(separator)[0].trim();
    }
    // Escape regex characters just in case
    const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\{${safeKey}\\}`, "g");
    name = name.replace(regex, finalValue);
  }

  // Clean invalid filename characters for Windows
  name = name.replace(/[<>:"/\\|?*]+/g, " ").trim();
  const destPath = path.join(destParent, name);

  const stats = await fs.promises.stat(src);
  if (stats.isDirectory()) {
    await fs.promises.mkdir(destPath, { recursive: true });
    const children = await fs.promises.readdir(src);
    for (const child of children) {
      await copyRecursiveAndFormat(
        path.join(src, child),
        destPath,
        record,
        separator,
        targetTime,
      );
    }
  } else {
    // Copy the file
    await fs.promises.copyFile(src, destPath);
  }

  // Set time if required
  if (targetTime) {
    try {
      await fs.promises.utimes(destPath, targetTime, targetTime); // atime, mtime
      await setCreationTime(destPath, targetTime); // birthtime
    } catch (err) {
      logger.debug(TOOL_NAME, `Failed to update times for ${destPath}`, {
        err: err.message,
      });
    }
  }

  return destPath;
}

export async function run() {
  logger.info(TOOL_NAME, "Tool started");
  ui.title(t("folderGenerator.menu_title"));

  const config = loadConfig(TOOL_NAME, {
    lastCsvPath: "",
    lastTemplatePath: "",
    lastTargetPath: "",
    lastSeparator: "|",
    lastTimeColumn: "publishedAt",
  });

  try {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "csvPath",
        message: t("folderGenerator.csv_prompt"),
        default: config.lastCsvPath,
        validate: (input) =>
          fs.existsSync(input) ? true : t("folderGenerator.csv_invalid"),
      },
      {
        type: "input",
        name: "templatePath",
        message: t("folderGenerator.template_prompt"),
        default: config.lastTemplatePath,
        validate: (input) => {
          if (!fs.existsSync(input))
            {return t("folderGenerator.template_invalid");}
          if (!fs.statSync(input).isDirectory()) {
            return t("folderGenerator.template_not_dir");
          }
          return true;
        },
      },
      {
        type: "input",
        name: "targetPath",
        message: t("folderGenerator.target_prompt"),
        default: config.lastTargetPath,
        validate: (input) => {
          if (!fs.existsSync(input)) {
            try {
              fs.mkdirSync(input, { recursive: true });
              return true;
            } catch {
              return t("folderGenerator.target_invalid");
            }
          }
          return true;
        },
      },
      {
        type: "input",
        name: "separator",
        message: t("folderGenerator.separator_prompt"),
        default: config.lastSeparator,
      },
      {
        type: "list",
        name: "sortOrder",
        message: t("folderGenerator.sort_prompt"),
        choices: [
          { name: t("folderGenerator.sort_original"), value: "original" },
          { name: t("folderGenerator.sort_asc"), value: "asc" },
          { name: t("folderGenerator.sort_desc"), value: "desc" },
        ],
      },
    ]);

    let timeColumn = config.lastTimeColumn;
    if (answers.sortOrder !== "original") {
      const timeAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "timeColumn",
          message: t("folderGenerator.time_col_sort_prompt"),
          default: config.lastTimeColumn,
        },
      ]);
      timeColumn = timeAnswers.timeColumn;
    }

    const timeFeature = await inquirer.prompt([
      {
        type: "confirm",
        name: "setTime",
        message: t("folderGenerator.fake_time_confirm"),
        default: false,
      },
    ]);

    if (timeFeature.setTime && answers.sortOrder === "original") {
      const fallbackAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "timeColumn",
          message: t("folderGenerator.time_col_fake_prompt"),
          default: timeColumn,
        },
      ]);
      timeColumn = fallbackAnswers.timeColumn;
    }

    const setTime = timeFeature.setTime;
    const { csvPath, templatePath, targetPath, separator, sortOrder } = answers;

    // Save config
    saveConfig(TOOL_NAME, {
      ...config,
      lastCsvPath: csvPath,
      lastTemplatePath: templatePath,
      lastTargetPath: targetPath,
      lastSeparator: separator,
      lastTimeColumn: timeColumn,
    });

    const csvContent = await fs.promises.readFile(csvPath, "utf-8");
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    if (records.length === 0) {
      ui.error(t("folderGenerator.csv_empty"));
      return;
    }

    if (sortOrder !== "original" && timeColumn) {
      records.sort((a, b) => {
        const timeA = new Date(a[timeColumn] || 0).getTime() || 0;
        const timeB = new Date(b[timeColumn] || 0).getTime() || 0;
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
      });
    }

    ui.info(t("folderGenerator.starting", { count: records.length }));
    let index = 1;

    for (const record of records) {
      // Create properties for format
      const recordData = { ...record };

      // Number properties
      recordData.num = String(index);
      recordData.num2 = String(index).padStart(2, "0");
      recordData.num3 = String(index).padStart(3, "0");
      recordData.num4 = String(index).padStart(4, "0");

      let targetTime = null;
      if (setTime && record[timeColumn]) {
        const t = new Date(record[timeColumn]);
        if (!isNaN(t.getTime())) {
          targetTime = t;
        }
      }

      await copyRecursiveAndFormat(
        templatePath,
        targetPath,
        recordData,
        separator,
        targetTime,
      );

      ui.success(t("folderGenerator.created", { index: recordData.num3 }));
      index++;
    }

    logger.info(TOOL_NAME, "Tool finished");
    ui.success(t("folderGenerator.success"));
  } catch (err) {
    logger.error(TOOL_NAME, err.message, { stack: err.stack });
    ui.error(t("folderGenerator.error", { err: err.message }));
  }
}
