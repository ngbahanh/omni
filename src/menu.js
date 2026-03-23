import inquirer from "inquirer";
import { ui } from "./ui.js";
import { t } from "./i18n/index.js";
import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadTools() {
  const toolsDir = resolve(__dirname, "tools");
  const files = readdirSync(toolsDir).filter(
    (f) => f.endsWith(".js") && !f.startsWith("_"),
  );

  const tools = [];
  for (const file of files) {
    try {
      const mod = await import(`./tools/${file}`);
      tools.push({
        name: mod.meta?.label ?? file.replace(".js", ""),
        value: mod.run,
        description: mod.meta?.description ?? "",
      });
    } catch (err) {
      console.error(`  ⚠ Failed to load tool: ${file} — ${err.message}`);
    }
  }

  return tools;
}

export async function showMenu() {
  const tools = await loadTools();

  const { action } = await inquirer.prompt([
    {
      type: "select",
      name: "action",
      message: t("menu.title"),
      choices: [
        ...tools.map((tool) => ({
          name: `${tool.name}  ${chalk_dim(tool.description)}`,
          value: tool.value,
        })),
        new inquirer.Separator(),
        { name: t("menu.exit"), value: null },
      ],
    },
  ]);

  if (action) {
    await action();
    await showMenu(); // loop back
  } else {
    ui.dim("Goodbye.");
    process.exit(0);
  }
}

function chalk_dim(str) {
  return str ? `\x1b[2m${str}\x1b[0m` : "";
}
