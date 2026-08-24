import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const preview = spawn(
  npmCommand,
  ["run", "preview", "--", "--host", "127.0.0.1"],
  {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  },
);

preview.stdout.pipe(process.stdout);
preview.stderr.pipe(process.stderr);

async function waitForPreview() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4173/");
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the Vite preview server");
}

let chrome;
try {
  await waitForPreview();
  chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const result = await lighthouse("http://127.0.0.1:4173/", {
    port: chrome.port,
    output: ["json", "html"],
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  });

  if (!result) throw new Error("Lighthouse did not return a result");
  const scores = Object.fromEntries(
    Object.entries(result.lhr.categories).map(([name, category]) => [
      name,
      Math.round(category.score * 100),
    ]),
  );
  const minimums = {
    performance: 90,
    accessibility: 95,
    "best-practices": 95,
    seo: 100,
  };

  await mkdir(".lighthouseci/reports", { recursive: true });
  await writeFile(".lighthouseci/reports/index.report.json", result.report[0]);
  await writeFile(".lighthouseci/reports/index.report.html", result.report[1]);
  console.log("Lighthouse scores:", scores);

  for (const [category, minimum] of Object.entries(minimums)) {
    if (scores[category] < minimum) {
      throw new Error(`${category} score ${scores[category]} is below ${minimum}`);
    }
  }
} finally {
  if (chrome) await chrome.kill();
  if (process.platform === "win32") {
    preview.kill("SIGTERM");
  } else {
    process.kill(-preview.pid, "SIGTERM");
  }
}
