import { describe, expect, it } from "vitest";
import { isFlagEnabled, parseArgs } from "../args";

describe("parseArgs", () => {
  it("parses positionals and boolean flags", () => {
    const parsed = parseArgs(["workout", "events", "--debug-preview"]);
    expect(parsed.positionals).toEqual(["workout", "events"]);
    expect(parsed.options).toEqual({ "debug-preview": "true" });
  });

  it("parses key-value options", () => {
    const parsed = parseArgs(["workout", "events", "--note", "hello", "--tag=fast"]);
    expect(parsed.positionals).toEqual(["workout", "events"]);
    expect(parsed.options).toEqual({ note: "hello", tag: "fast" });
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
