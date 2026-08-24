import { createRoot, hydrateRoot } from "react-dom/client";
import { version } from "../package.json";
import "../timer-theme.css";
import "../style.css";
import { PomodoroApp } from "./App.jsx";

const rootElement = document.getElementById("root");
const app = <PomodoroApp appVersion={version} />;

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
