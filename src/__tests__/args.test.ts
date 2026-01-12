import { describe, expect, it } from "vitest";
import { isFlagEnabled, parseArgs, shouldAutoLogin } from "../args";

describe("parseArgs", () => {
  it("parses positionals and boolean flags", () => {
    const parsed = parseArgs(["auth", "login", "--headless"]);
    expect(parsed.positionals).toEqual(["auth", "login"]);
    expect(parsed.options).toEqual({ headless: "true" });
  });

  it("parses key-value options", () => {
    const parsed = parseArgs([
      "workout",
      "events",
      "--timezone",
      "Europe/London",
      "--program=abc"
    ]);
    expect(parsed.positionals).toEqual(["workout", "events"]);
    expect(parsed.options).toEqual({ timezone: "Europe/London", program: "abc" });
  });
});

describe("isFlagEnabled", () => {
  it("treats true-ish values as enabled", () => {
    expect(isFlagEnabled({ flag: "true" }, "flag")).toBe(true);
    expect(isFlagEnabled({ flag: "1" }, "flag")).toBe(true);
    expect(isFlagEnabled({ flag: "yes" }, "flag")).toBe(true);
    expect(isFlagEnabled({ flag: "false" }, "flag")).toBe(false);
  });
});

describe("shouldAutoLogin", () => {
  it("uses default when flags are absent", () => {
    expect(shouldAutoLogin({}, true)).toBe(true);
    expect(shouldAutoLogin({}, false)).toBe(false);
  });

  it("respects override flags", () => {
    expect(shouldAutoLogin({ "auto-login": "true" }, false)).toBe(true);
    expect(shouldAutoLogin({ "no-auto-login": "true" }, true)).toBe(false);
  });
});
