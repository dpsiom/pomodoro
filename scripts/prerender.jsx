import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { version } from "../package.json";
import { PomodoroApp } from "../src/App.jsx";

const outputPath = resolve("dist/index.html");
const rootMarker = '<div id="root"></div>';
const documentHtml = await readFile(outputPath, "utf8");

if (!documentHtml.includes(rootMarker)) {
  throw new Error("Unable to find the Vite root marker while pre-rendering index.html");
}

const appHtml = renderToString(<PomodoroApp appVersion={version} />);
const prerenderedHtml = documentHtml.replace(
  rootMarker,
  `<div id="root">${appHtml}</div>`,
);

if ((prerenderedHtml.match(/<h1\b/g) || []).length !== 1) {
  throw new Error("The production HTML must contain exactly one H1");
}

await writeFile(outputPath, prerenderedHtml);
