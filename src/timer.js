export const DEFAULTS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 30,
  sessionsPerCycle: 4,
});

export const MODES = Object.freeze({
  FOCUS: "focus",
  SHORT_BREAK: "short_break",
  LONG_BREAK: "long_break",
});

export function secondsForMode(settings, mode) {
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

export function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function validateNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number < min) return min;
  if (number > max) return max;
  return Math.round(number);
}
