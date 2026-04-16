import { ui } from "../ui.js";
import { logger } from "../logger.js";
import { t } from "../i18n/index.js";
import inquirer from "inquirer";
import { spawn } from "child_process";
import puppeteer from "puppeteer";

export const meta = {
  label: `🎬 ${t("streamCatcher.menu_title")}`,
  description: t("streamCatcher.menu_desc"),
};

export async function run() {
  const TOOL_NAME = "stream-catcher";
  logger.info(TOOL_NAME, "Tool started");

  try {
    const { url } = await inquirer.prompt([
      {
        type: "input",
        name: "url",
        message: t("streamCatcher.prompt_url"),
        default: "",
      },
    ]);

    const { headless } = await inquirer.prompt([
      {
        type: "confirm",
        name: "headless",
        message: t("streamCatcher.prompt_headless"),
        default: false,
      },
    ]);

    console.log("");
    ui.info(t("streamCatcher.launching", { url }));

    const browser = await puppeteer.launch({
      headless,
      defaultViewport: null,
    });

    const page = await browser.newPage();
    let caughtVideoUrl = null;
    let isDownloading = false;

    // Promise that resolves when yt-dlp finishes
    const downloadPromise = new Promise((resolve, reject) => {
      // Function to start yt-dlp
      function startDownload(videoLink) {
        if (isDownloading) return;
        isDownloading = true;

        console.log("");
        ui.success(t("streamCatcher.downloading"));

        const ytDlpArgs = [
          "-f",
          "bestvideo+bestaudio/best",
          "--concurrent-fragments",
          "4",
          videoLink,
        ];

        logger.info(TOOL_NAME, "Starting yt-dlp", { args: ytDlpArgs });
        const downloader = spawn("yt-dlp", ytDlpArgs, {
          stdio: "inherit",
          shell: true,
        });

        downloader.on("close", (code) => {
          if (code === 0) {
            ui.success(t("streamCatcher.download_complete"));
            resolve();
          } else {
            ui.error(
              t("streamCatcher.error", {
                msg: `yt-dlp exited with code ${code}`,
              }),
            );
            reject(new Error(`yt-dlp exited with code ${code}`));
          }
        });

        downloader.on("error", (err) => {
          ui.error(t("streamCatcher.error", { msg: err.message }));
          reject(err);
        });
      }

      page.on("request", async (request) => {
        const reqUrl = request.url();
        const reqUrlLower = reqUrl.toLowerCase();

        if (
          !caughtVideoUrl &&
          (reqUrlLower.includes(".m3u8") || reqUrlLower.includes(".mp4"))
        ) {
          const isAdOrTracker = [
            "googleads",
            "doubleclick",
            "analytics",
            "facebook",
            "tracker",
            "adsystem",
          ].some((adword) => reqUrlLower.includes(adword));

          if (!isAdOrTracker && !reqUrlLower.endsWith(".ts")) {
            caughtVideoUrl = reqUrl;
            console.log("\n" + "=".repeat(60));
            ui.success(t("streamCatcher.caught", { link: caughtVideoUrl }));
            console.log("=".repeat(60) + "\n");

            startDownload(caughtVideoUrl);
          }
        }
      });
    });

    console.log("");
    ui.dim(t("streamCatcher.waiting"));
    if (!headless) {
      ui.info(`\n${t("streamCatcher.tip")}\n`);
    }

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (err) {
      // Timeout is common, don't crash just wait for the request matching
      logger.error(TOOL_NAME, "Page load error", err.message);
    }

    // Wait loop for link catching
    let timeoutHit = true;
    for (let i = 0; i < 120; i++) {
      if (isDownloading) {
        timeoutHit = false;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (timeoutHit) {
      ui.error(t("streamCatcher.timeout"));
      await browser.close();
      return;
    }

    // Wait for download to finish
    await downloadPromise;
    await browser.close();
  } catch (err) {
    if (err.message && err.message.includes("User force closed")) {
      ui.dim(t("common.cancel") || "Cancelled.");
    } else {
      logger.error(TOOL_NAME, err.message, { stack: err.stack });
      ui.error(t("streamCatcher.error", { msg: err.message }));
    }
  } finally {
    logger.info(TOOL_NAME, "Tool finished");
  }
}
