import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { printResponse } from "../output";

describe("printResponse", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  afterEach(() => {
    logSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  it("prints raw output when requested", () => {
    printResponse({ ok: true, status: 200, text: "raw" }, true);
    expect(logSpy).toHaveBeenCalledWith("raw");
  });

  it("prints JSON when available and raw output is disabled", () => {
    printResponse({ ok: true, status: 200, text: "ignored", json: { ok: true } }, false);
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ ok: true }, null, 2));
  });

  it("prints text when JSON is unavailable", () => {
    printResponse({ ok: false, status: 500, text: "error" }, false);
    expect(logSpy).toHaveBeenCalledWith("error");
  });
});
