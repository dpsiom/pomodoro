import { useEffect, useRef, useState } from "react";
import { SHOW_TECH_PANEL } from "./config.js";
import {
  DEFAULTS,
  MODES,
  formatTime,
  secondsForMode,
  validateNumber,
} from "./timer.js";

const STORAGE_KEY = "pomodoro_settings_v1";

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      focusMinutes: validateNumber(parsed.focusMinutes, 1, 180, DEFAULTS.focusMinutes),
      shortBreakMinutes: validateNumber(
        parsed.shortBreakMinutes,
        1,
        60,
        DEFAULTS.shortBreakMinutes,
      ),
      longBreakMinutes: validateNumber(
        parsed.longBreakMinutes,
        1,
        120,
        DEFAULTS.longBreakMinutes,
      ),
      sessionsPerCycle: validateNumber(
        parsed.sessionsPerCycle,
        1,
        12,
        DEFAULTS.sessionsPerCycle,
      ),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const gain = context.createGain();
    const oscillator = context.createOscillator();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.setValueAtTime(880, context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.03, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0003, context.currentTime + 0.45);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
  } catch (error) {
    console.warn("Unable to play chime", error);
  }
}

function showNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch (error) {
    console.warn("Notification failed", error);
  }
}

export function PomodoroApp({ appVersion }) {
  const [settings, setSettings] = useState({ ...DEFAULTS });
  const [formSettings, setFormSettings] = useState({ ...DEFAULTS });
  const [mode, setMode] = useState(MODES.FOCUS);
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULTS.focusMinutes * 60);
  const [totalSeconds, setTotalSeconds] = useState(DEFAULTS.focusMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedFocusSessions, setCompletedFocusSessions] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [wakeLockStatus, setWakeLockStatus] = useState("Status: waiting for timer");

  const intervalRef = useRef(null);
  const wakeLockRef = useRef(null);
  const endTimeRef = useRef(null);

  const cycleIndex = (completedFocusSessions % settings.sessionsPerCycle) + 1;
  const statusText = (() => {
    if (mode === MODES.FOCUS) {
      return isRunning ? "Focus session in progress" : "Ready to focus";
    }
    if (mode === MODES.SHORT_BREAK) {
      return isRunning ? "Short break running" : "Short break";
    }
    return isRunning ? "Long break running" : "Long break";
  })();
  const ringProgress = totalSeconds
    ? Math.min(Math.max(remainingSeconds / totalSeconds, 0), 1)
    : 0;
  const ringProgressDegrees = ringProgress * 360;
  const ringProgressMidDegrees = ringProgress * 220;

  useEffect(() => {
    const savedSettings = loadSettings();
    setSettings(savedSettings);
    setFormSettings(savedSettings);
    setTotalSeconds(secondsForMode(savedSettings, MODES.FOCUS));
    setRemainingSeconds(secondsForMode(savedSettings, MODES.FOCUS));
    if (typeof Notification !== "undefined") {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      setWakeLockStatus("Status: not supported; use iOS Auto-Lock settings");
      return;
    }
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setWakeLockStatus("Status: keeping screen awake while timer runs");
      wakeLockRef.current.addEventListener("release", () => {
        setWakeLockStatus("Status: released; will re-apply when timer runs");
      });
    } catch (error) {
      setWakeLockStatus("Status: unable to keep screen awake; check device settings");
      console.error("Wake lock request failed", error);
    }
  }

  async function ensureWakeLock() {
    if (isRunning && !wakeLockRef.current) await requestWakeLock();
  }

  async function releaseWakeLock() {
    if (!wakeLockRef.current) return;
    try {
      await wakeLockRef.current.release();
    } catch {
      // A released wake lock does not require further action.
    }
    wakeLockRef.current = null;
    if (!isRunning) setWakeLockStatus("Status: waiting for timer");
  }

  function resetForMode(nextMode, nextSettings = settings, options = {}) {
    const { restartRunning = false } = options;
    const seconds = secondsForMode(nextSettings, nextMode);
    setMode(nextMode);
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    endTimeRef.current = restartRunning ? Date.now() + seconds * 1000 : null;
  }

  function handleSessionComplete() {
    playChime();
    if (mode === MODES.FOCUS) {
      const nextCompletedSessions = completedFocusSessions + 1;
      const isLongBreak = nextCompletedSessions % settings.sessionsPerCycle === 0;
      const nextMode = isLongBreak ? MODES.LONG_BREAK : MODES.SHORT_BREAK;
      setCompletedFocusSessions(nextCompletedSessions);
      showNotification(
        isLongBreak ? "Long break time" : "Short break time",
        isLongBreak
          ? "Great work – enjoy a longer reset."
          : "Stand up, stretch, grab some water.",
      );
      resetForMode(nextMode);
    } else {
      showNotification("Back to focus", "Ready for your next pomodoro?");
      resetForMode(MODES.FOCUS);
    }
    setIsRunning(false);
  }

  function syncRemainingTime() {
    if (!endTimeRef.current) return;
    const nextRemainingSeconds = Math.max(
      0,
      Math.ceil((endTimeRef.current - Date.now()) / 1000),
    );
    if (nextRemainingSeconds <= 0) {
      endTimeRef.current = null;
      setRemainingSeconds(0);
      handleSessionComplete();
      return;
    }
    setRemainingSeconds(nextRemainingSeconds);
  }

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        syncRemainingTime();
        ensureWakeLock();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  });

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      releaseWakeLock();
      return undefined;
    }

    if (!endTimeRef.current) {
      endTimeRef.current = Date.now() + remainingSeconds * 1000;
    }
    intervalRef.current = setInterval(syncRemainingTime, 1000);
    syncRemainingTime();
    ensureWakeLock();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isRunning, mode, settings]);

  function handleStartPause() {
    if (isRunning) {
      syncRemainingTime();
      endTimeRef.current = null;
      setIsRunning(false);
      return;
    }
    endTimeRef.current = Date.now() + remainingSeconds * 1000;
    setIsRunning(true);
  }

  function handleReset() {
    setIsRunning(false);
    resetForMode(mode);
  }

  function handleModeClick(nextMode) {
    if (mode === nextMode) return;
    setIsRunning(false);
    resetForMode(nextMode);
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const nextSettings = {
      focusMinutes: validateNumber(form.focusMinutes.value, 1, 180, DEFAULTS.focusMinutes),
      shortBreakMinutes: validateNumber(
        form.shortBreakMinutes.value,
        1,
        60,
        DEFAULTS.shortBreakMinutes,
      ),
      longBreakMinutes: validateNumber(
        form.longBreakMinutes.value,
        1,
        120,
        DEFAULTS.longBreakMinutes,
      ),
      sessionsPerCycle: validateNumber(
        form.sessionsPerCycle.value,
        1,
        12,
        DEFAULTS.sessionsPerCycle,
      ),
    };
    setSettings(nextSettings);
    setFormSettings(nextSettings);
    saveSettings(nextSettings);
    resetForMode(mode, nextSettings, { restartRunning: isRunning });
  }

  function handleResetSettings() {
    const defaultSettings = { ...DEFAULTS };
    setSettings(defaultSettings);
    setFormSettings(defaultSettings);
    saveSettings(defaultSettings);
    resetForMode(mode, defaultSettings, { restartRunning: isRunning });
  }

  function notificationStatusText() {
    if (typeof Notification === "undefined") {
      return "Permission: not supported in this browser";
    }
    if (notificationPermission === "default") return "Permission: not requested";
    return `Permission: ${notificationPermission}`;
  }

  async function handleEnableNotifications() {
    if (typeof Notification === "undefined") return;
    try {
      setNotificationPermission(await Notification.requestPermission());
    } catch (error) {
      console.warn("Notification permission request failed", error);
    }
  }

  const modeTabs = [
    [MODES.FOCUS, "Focus"],
    [MODES.SHORT_BREAK, "Short break"],
    [MODES.LONG_BREAK, "Long break"],
  ];

  return (
    <div className="app-shell">
      <main className="app-main">
        <section className="app-screen hero-screen" aria-labelledby="page-title">
          <header className="app-header">
            <div className="brand">
              <div className="brand-icon" aria-hidden="true">
                <span className="brand-leaf" />
              </div>
              <div className="brand-text">
                <h1 id="page-title">Pomodoro Focus Timer</h1>
                <p>Customisable focus and break sessions</p>
              </div>
            </div>
          </header>

          <section
            id="timer-panel"
            className="timer-card hero-timer-card"
            role="tabpanel"
            aria-labelledby={`${mode}-tab`}
            aria-label="Pomodoro timer controls"
          >
            <div className="mode-tabs" role="tablist" aria-label="Timer modes">
              {modeTabs.map(([timerMode, label]) => (
                <button
                  key={timerMode}
                  id={`${timerMode}-tab`}
                  type="button"
                  className={`mode-tab ${mode === timerMode ? "active" : ""}`}
                  role="tab"
                  aria-controls="timer-panel"
                  aria-selected={mode === timerMode}
                  tabIndex={mode === timerMode ? 0 : -1}
                  onClick={() => handleModeClick(timerMode)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="timer-visual">
              <div className="timer-circle">
                <div
                  className="timer-face"
                  style={{
                    "--timer-ring-progress": `${ringProgressDegrees}deg`,
                    "--timer-ring-progress-mid": `${ringProgressMidDegrees}deg`,
                  }}
                >
                  <div className="timer-ring-track" aria-hidden="true" />
                  <div className="timer-ring-progress" aria-hidden="true" />
                  <div className="timer-time" aria-live="polite">
                    <span>{formatTime(remainingSeconds)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="timer-meta">
              <p id="cycle-label">Pomodoro {cycleIndex} / {settings.sessionsPerCycle}</p>
              <p id="status-label">{statusText}</p>
            </div>

            <div className="timer-controls">
              <button
                type="button"
                id="start-pause-btn"
                className="primary"
                onClick={handleStartPause}
              >
                {isRunning ? "Pause" : "Start"}
              </button>
              <button type="button" id="reset-btn" className="ghost" onClick={handleReset}>
                Reset
              </button>
            </div>
          </section>

          <div className="scroll-prompt" aria-hidden="true">
            <span>Scroll for session settings</span>
          </div>
        </section>

        <section className="app-screen settings-screen" aria-labelledby="settings-title">
          <div className="settings-stack">
            <section className="panel settings-panel">
              <div className="panel-header">
                <h2 id="settings-title">Session settings</h2>
                <p>Adjust lengths to match your study style. Settings are saved on this device.</p>
              </div>
              <form id="settings-form" className="settings-grid" onSubmit={handleSettingsSubmit}>
                <TimerField
                  id="focus-minutes"
                  name="focusMinutes"
                  label="Focus length (minutes)"
                  min="1"
                  max="180"
                  value={formSettings.focusMinutes}
                  onChange={(value) => setFormSettings({ ...formSettings, focusMinutes: value })}
                />
                <TimerField
                  id="short-break-minutes"
                  name="shortBreakMinutes"
                  label="Short break (minutes)"
                  min="1"
                  max="60"
                  value={formSettings.shortBreakMinutes}
                  onChange={(value) => setFormSettings({ ...formSettings, shortBreakMinutes: value })}
                />
                <TimerField
                  id="long-break-minutes"
                  name="longBreakMinutes"
                  label="Long break (minutes)"
                  min="1"
                  max="120"
                  value={formSettings.longBreakMinutes}
                  onChange={(value) => setFormSettings({ ...formSettings, longBreakMinutes: value })}
                />
                <TimerField
                  id="sessions-per-cycle"
                  name="sessionsPerCycle"
                  label="Pomodoros before long break"
                  min="1"
                  max="12"
                  value={formSettings.sessionsPerCycle}
                  onChange={(value) => setFormSettings({ ...formSettings, sessionsPerCycle: value })}
                />
                <div className="field field-full">
                  <button type="submit" className="secondary">Save settings</button>
                  <button
                    type="button"
                    id="reset-settings-btn"
                    className="link-button"
                    onClick={handleResetSettings}
                  >
                    Reset to defaults
                  </button>
                </div>
              </form>
            </section>

            {SHOW_TECH_PANEL && (
              <section className="panel tech-panel" aria-labelledby="technology-title">
                <div className="panel-header">
                  <h2 id="technology-title">Notifications &amp; screen</h2>
                  <p>
                    Sound and browser notifications fire when a session finishes. Screen wake
                    works on supported browsers.
                  </p>
                </div>
                <div className="tech-grid">
                  <div className="tech-item">
                    <h3>Sound</h3>
                    <p>A short chime plays at the end of each session.</p>
                    <button type="button" className="ghost small" onClick={playChime}>
                      Test chime
                    </button>
                  </div>
                  <div className="tech-item">
                    <h3>Browser notifications</h3>
                    <p>{notificationStatusText()}</p>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={handleEnableNotifications}
                      disabled={
                        typeof Notification === "undefined" ||
                        notificationPermission === "granted"
                      }
                    >
                      {notificationPermission === "granted" ? "Enabled" : "Enable notifications"}
                    </button>
                  </div>
                  <div className="tech-item">
                    <h3>Keep screen awake</h3>
                    <p>{wakeLockStatus}</p>
                    <p className="tech-note">
                      If an iPad still locks, set Auto-Lock to Never in iOS settings.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>

          <footer className="app-footer">
            <p>
              Pomodoro timer by{" "}
              <a href="https://github.com/dpsiom" target="_blank" rel="noreferrer">
                dpsiom
              </a>
            </p>
            <small className="app-version" aria-label={`Application version ${appVersion}`}>
              v{appVersion}
            </small>
          </footer>
        </section>
      </main>
    </div>
  );
}

function TimerField({ id, name, label, min, max, value, onChange }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
