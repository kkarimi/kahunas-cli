import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { debugLog, parseNumber } from "../utils";

describe("utils helpers", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  afterEach(() => {
    errorSpy.mockClear();
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  it("parses numbers with fallback", () => {
    expect(parseNumber(undefined, 5)).toBe(5);
    expect(parseNumber("10", 5)).toBe(10);
    expect(parseNumber("nope", 5)).toBe(5);
  });

  it("only logs debug messages when enabled", () => {
    debugLog(false, "hidden");
    expect(errorSpy).not.toHaveBeenCalled();
    debugLog(true, "visible");
    expect(errorSpy).toHaveBeenCalled();
  });
});
