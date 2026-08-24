import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  MODES,
  formatTime,
  secondsForMode,
  validateNumber,
} from "../src/timer.js";

describe("formatTime", () => {
  it.each([
    [0, "00:00"],
    [5, "00:05"],
    [59, "00:59"],
    [60, "01:00"],
    [1500, "25:00"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected);
  });
});

describe("secondsForMode", () => {
  it("maps every timer mode to its configured duration", () => {
    expect(secondsForMode(DEFAULTS, MODES.FOCUS)).toBe(1500);
    expect(secondsForMode(DEFAULTS, MODES.SHORT_BREAK)).toBe(300);
    expect(secondsForMode(DEFAULTS, MODES.LONG_BREAK)).toBe(1800);
  });

  it("falls back to focus duration for an unknown mode", () => {
    expect(secondsForMode(DEFAULTS, "unknown")).toBe(1500);
  });
});

describe("validateNumber", () => {
  it("rounds finite values and clamps boundaries", () => {
    expect(validateNumber("12.6", 1, 20, 5)).toBe(13);
    expect(validateNumber(-1, 1, 20, 5)).toBe(1);
    expect(validateNumber(21, 1, 20, 5)).toBe(20);
  });

  it("uses the fallback for non-numeric values", () => {
    expect(validateNumber("not-a-number", 1, 20, 5)).toBe(5);
  });
});
