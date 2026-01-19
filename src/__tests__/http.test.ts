import { describe, expect, it } from "vitest";
import { parseJsonText } from "../http";

describe("parseJsonText", () => {
  it("parses JSON payloads and returns undefined for invalid JSON", () => {
    expect(parseJsonText("{\"ok\":true}")).toEqual({ ok: true });
    expect(parseJsonText("not-json")).toBeUndefined();
  });
});
