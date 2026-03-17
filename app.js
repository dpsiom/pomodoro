const { useState, useEffect, useRef } = React;

const SHOW_TECH_PANEL =
  (window.POMODORO_UI && window.POMODORO_UI.showTechPanel) || false;

const DEFAULTS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 30,
  sessionsPerCycle: 4,
};

const STORAGE_KEY = "pomodoro_settings_v1";

const MODES = {
  FOCUS: "focus",
  SHORT_BREAK: "short_break",
  LONG_BREAK: "long_break",
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function secondsForMode(settings, mode) {
  switch (mode) {
    case MODES.FOCUS:
      return settings.focusMinutes * 60;
    case MODES.SHORT_BREAK:
      return settings.shortBreakMinutes * 60;
    case MODES.LONG_BREAK:
      return settings.longBreakMinutes * 60;
    default:
      return settings.focusMinutes * 60;
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const gain = ctx.createGain();

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    // Softer, lower two-note chime
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.18);

    // Increased overall volume while still avoiding clipping
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0003, ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn("Unable to play chime", e);
  }
}

function showNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch (e) {
    console.warn("Notification failed", e);
  }
}

function validateNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return Math.round(n);
}

function PomodoroApp() {
  const [settings, setSettings] = useState(() => loadSettings());
  const [mode, setMode] = useState(MODES.FOCUS);
  const [remainingSeconds, setRemainingSeconds] = useState(
    () => settings.focusMinutes * 60
  );
  const [totalSeconds, setTotalSeconds] = useState(
    () => settings.focusMinutes * 60
  );
  const [isRunning, setIsRunning] = useState(false);
  const [completedFocusSessions, setCompletedFocusSessions] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState(
    () => (typeof Notification !== "undefined" ? Notification.permission : "default")
  );
  const [wakeLockStatus, setWakeLockStatus] = useState(
    "Status: waiting for timer"
  );

  const intervalRef = useRef(null);
  const wakeLockRef = useRef(null);

  const cycleIndex =
    (completedFocusSessions % settings.sessionsPerCycle) + 1;

  const statusText = (() => {
    if (mode === MODES.FOCUS) {
      return isRunning ? "Focus session in progress" : "Ready to focus";
    }
    if (mode === MODES.SHORT_BREAK) {
      return isRunning ? "Short break running" : "Short break";
    }
    return isRunning ? "Long break running" : "Long break";
  })();

  const ringProgress = (() => {
    if (!totalSeconds) return 0;
    const progress = remainingSeconds / totalSeconds;
    return Math.min(Math.max(progress, 0), 1);
  })();
  const ringProgressDegrees = ringProgress * 360;
  const ringProgressMidDegrees = ringProgress * 220;

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      setWakeLockStatus(
        "Status: not supported; use iOS Auto-Lock settings"
      );
      return;
    }
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setWakeLockStatus(
        "Status: keeping screen awake while timer runs"
      );
      wakeLockRef.current.addEventListener("release", () => {
        setWakeLockStatus(
          "Status: released; will re-apply when timer runs"
        );
      });
    } catch (err) {
      setWakeLockStatus(
        "Status: unable to keep screen awake; check device settings"
      );
      console.error("Wake lock request failed", err);
    }
  }

  async function ensureWakeLock() {
    if (!isRunning) return;
    if (!wakeLockRef.current) {
      await requestWakeLock();
    }
  }

  async function releaseWakeLock() {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
      if (!isRunning) {
        setWakeLockStatus("Status: waiting for timer");
      }
    }
  }

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        ensureWakeLock();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      releaseWakeLock();
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          handleSessionComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    ensureWakeLock();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  function resetForMode(nextMode, nextSettings = settings) {
    const secs = secondsForMode(nextSettings, nextMode);
    setMode(nextMode);
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
  }

  function handleSessionComplete() {
    playChime();

    let nextMode = MODES.FOCUS;

    if (mode === MODES.FOCUS) {
      setCompletedFocusSessions((prev) => {
        const next = prev + 1;
        const isLongBreak = next % settings.sessionsPerCycle === 0;
        nextMode = isLongBreak ? MODES.LONG_BREAK : MODES.SHORT_BREAK;
        showNotification(
          isLongBreak ? "Long break time" : "Short break time",
          isLongBreak
            ? "Great work – enjoy a longer reset."
            : "Stand up, stretch, grab some water."
        );
        resetForMode(nextMode);
        setIsRunning(false);
        return next;
      });
      return;
    }

    nextMode = MODES.FOCUS;
    showNotification("Back to focus", "Ready for your next pomodoro?");
    resetForMode(nextMode);
    setIsRunning(false);
  }

  function handleStartPause() {
    setIsRunning((prev) => !prev);
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
    const form = event.target;
    const focusMinutes = validateNumber(
      form.focusMinutes.value,
      1,
      180,
      DEFAULTS.focusMinutes
    );
    const shortBreakMinutes = validateNumber(
      form.shortBreakMinutes.value,
      1,
      60,
      DEFAULTS.shortBreakMinutes
    );
    const longBreakMinutes = validateNumber(
      form.longBreakMinutes.value,
      1,
      120,
      DEFAULTS.longBreakMinutes
    );
    const sessionsPerCycle = validateNumber(
      form.sessionsPerCycle.value,
      1,
      12,
      DEFAULTS.sessionsPerCycle
    );

    const nextSettings = {
      focusMinutes,
      shortBreakMinutes,
      longBreakMinutes,
      sessionsPerCycle,
    };
    setSettings(nextSettings);
    saveSettings(nextSettings);
    resetForMode(mode, nextSettings);
  }

  function handleResetSettings() {
    const base = { ...DEFAULTS };
    setSettings(base);
    saveSettings(base);
    resetForMode(mode, base);
  }

  function updateNotificationStatusText() {
    if (!("Notification" in window)) {
      return "Permission: not supported in this browser";
    }
    if (notificationPermission === "default") {
      return "Permission: not requested";
    }
    return `Permission: ${notificationPermission}`;
  }

  async function handleEnableNotifications() {
    if (!("Notification" in window)) return;
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    } catch (e) {
      console.warn("Notification permission request failed", e);
    }
  }

  function handleTestSound() {
    playChime();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <span className="brand-leaf"></span>
          </div>
          <div className="brand-text">
            <h1>Pomodoro Focus</h1>
            <p>Stay in flow with custom sessions</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section
          className="timer-card"
          aria-label="Pomodoro timer"
        >
          <div className="mode-tabs" role="tablist" aria-label="Timer modes">
            <button
              className={`mode-tab ${mode === MODES.FOCUS ? "active" : ""
                }`}
              role="tab"
              aria-selected={mode === MODES.FOCUS}
              onClick={() => handleModeClick(MODES.FOCUS)}
            >
              Focus
            </button>
            <button
              className={`mode-tab ${mode === MODES.SHORT_BREAK ? "active" : ""
                }`}
              role="tab"
              aria-selected={mode === MODES.SHORT_BREAK}
              onClick={() => handleModeClick(MODES.SHORT_BREAK)}
            >
              Short break
            </button>
            <button
              className={`mode-tab ${mode === MODES.LONG_BREAK ? "active" : ""
                }`}
              role="tab"
              aria-selected={mode === MODES.LONG_BREAK}
              onClick={() => handleModeClick(MODES.LONG_BREAK)}
            >
              Long break
            </button>
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
                <div className="timer-ring-track" aria-hidden="true"></div>
                <div className="timer-ring-progress" aria-hidden="true"></div>
                <div className="timer-time" aria-live="polite">
                  <span>{formatTime(remainingSeconds)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="timer-meta">
            <p id="cycle-label">
              {settings.sessionsPerCycle > 0
                ? `Pomodoro ${cycleIndex} / ${settings.sessionsPerCycle}`
                : `Pomodoro ${cycleIndex}`}
            </p>
            <p id="status-label">{statusText}</p>
          </div>

          <div className="timer-controls">
            <button
              id="start-pause-btn"
              className="primary"
              onClick={handleStartPause}
            >
              {isRunning ? "Pause" : "Start"}
            </button>
            <button
              id="reset-btn"
              className="ghost"
              onClick={handleReset}
            >
              Reset
            </button>
          </div>
        </section>

        <section className="panel settings-panel" aria-label="Timer settings">
          <div className="panel-header">
            <h2>Session settings</h2>
            <p>
              Adjust lengths to match your study style. Settings are saved on
              this device.
            </p>
          </div>
          <form
            id="settings-form"
            className="settings-grid"
            onSubmit={handleSettingsSubmit}
          >
            <div className="field">
              <label htmlFor="focus-minutes">Focus length (minutes)</label>
              <input
                id="focus-minutes"
                name="focusMinutes"
                type="number"
                min="1"
                max="180"
                inputMode="numeric"
                defaultValue={settings.focusMinutes}
              />
            </div>
            <div className="field">
              <label htmlFor="short-break-minutes">
                Short break (minutes)
              </label>
              <input
                id="short-break-minutes"
                name="shortBreakMinutes"
                type="number"
                min="1"
                max="60"
                inputMode="numeric"
                defaultValue={settings.shortBreakMinutes}
              />
            </div>
            <div className="field">
              <label htmlFor="long-break-minutes">
                Long break (minutes)
              </label>
              <input
                id="long-break-minutes"
                name="longBreakMinutes"
                type="number"
                min="1"
                max="120"
                inputMode="numeric"
                defaultValue={settings.longBreakMinutes}
              />
            </div>
            <div className="field">
              <label htmlFor="sessions-per-cycle">
                Pomodoros before long break
              </label>
              <input
                id="sessions-per-cycle"
                name="sessionsPerCycle"
                type="number"
                min="1"
                max="12"
                inputMode="numeric"
                defaultValue={settings.sessionsPerCycle}
              />
            </div>
            <div className="field field-full">
              <button type="submit" className="secondary">
                Save settings
              </button>
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
          <section
            className="panel tech-panel"
            aria-label="Notifications and screen wake"
          >
            <div className="panel-header">
              <h2>Notifications &amp; screen</h2>
              <p>
                Sound and browser notifications fire when a session finishes.
                Screen wake works on supported browsers (including newer iPads).
              </p>
            </div>
            <div className="tech-grid">
              <div className="tech-item">
                <h3>Sound</h3>
                <p>We&apos;ll play a short chime at the end of each session.</p>
                <button
                  id="test-sound-btn"
                  className="ghost small"
                  onClick={handleTestSound}
                >
                  Test chime
                </button>
              </div>

              <div className="tech-item">
                <h3>Browser notifications</h3>
                <p id="notification-status">
                  {updateNotificationStatusText()}
                </p>
                <button
                  id="enable-notifications-btn"
                  className="ghost small"
                  onClick={handleEnableNotifications}
                  disabled={
                    typeof Notification === "undefined" ||
                    notificationPermission === "granted"
                  }
                >
                  {notificationPermission === "granted"
                    ? "Enabled"
                    : "Enable notifications"}
                </button>
              </div>

              <div className="tech-item">
                <h3>Keep screen awake</h3>
                <p id="wake-lock-status">{wakeLockStatus}</p>
                <p className="tech-note">
                  When the timer runs, we try to keep your screen on. If your
                  iPad still locks, set Auto-Lock to Never in iOS settings.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <p>
          Pomodoro timer by{" "}
          <a
            href="https://github.com/dpsiom"
            target="_blank"
            rel="noreferrer"
          >
            dpsiom
          </a>
        </p>
      </footer>
    </div>
  );
}

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);
root.render(<PomodoroApp />);
