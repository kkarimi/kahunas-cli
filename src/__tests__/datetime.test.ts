import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addMillisecondsIso,
  formatHumanTimestamp,
  isIsoAfterNow,
  isoFromUnixSeconds,
} from "../datetime";

describe("datetime helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats human timestamps with absolute and relative output", () => {
    const result = formatHumanTimestamp("2024-01-02T11:00:00Z");
    expect(result.startsWith("2024-01-02 11:00:00 ")).toBe(true);
    expect(result).toMatch(/\(.*ago\)$/);
  });

  it("falls back to raw input when an ISO string is invalid", () => {
    expect(formatHumanTimestamp("not-a-date")).toBe("not-a-date");
  });

  it("detects whether an ISO string is after now", () => {
    expect(isIsoAfterNow("2024-01-02T12:00:01Z")).toBe(true);
    expect(isIsoAfterNow("2024-01-02T11:59:59Z")).toBe(false);
    expect(isIsoAfterNow("not-a-date")).toBe(false);
  });

  it("formats unix seconds as ISO", () => {
    expect(isoFromUnixSeconds(0)).toBe("1970-01-01T00:00:00.000Z");
  });

  it("adds milliseconds to ISO timestamps", () => {
    expect(addMillisecondsIso("2024-01-02T12:00:00Z", 1000)).toBe("2024-01-02T12:00:01.000Z");
    expect(addMillisecondsIso("not-a-date", 1000)).toBeUndefined();
  });
});
