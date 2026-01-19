import { describe, expect, it } from "vitest";
import { extractToken, isLikelyAuthToken, isLikelyLoginHtml } from "../tokens";

describe("isLikelyAuthToken", () => {
  it("accepts long opaque tokens", () => {
    const token = "a".repeat(120);
    expect(isLikelyAuthToken(token)).toBe(true);
  });

  it("accepts jwt-like tokens", () => {
    expect(isLikelyAuthToken("aaa.bbb.ccc")).toBe(true);
  });

  it("accepts base64-ish tokens", () => {
    expect(isLikelyAuthToken("abcd+1234/efghijklmnopqrstuv=1234567890abcd")).toBe(true);
  });
});

describe("extractToken", () => {
  it("extracts token from json", () => {
    const token = "a".repeat(90);
    const raw = JSON.stringify({ token });
    expect(extractToken(raw)).toBe(token);
  });

  it("returns trimmed text when json parse fails", () => {
    expect(extractToken("  raw-token  ")).toBe("raw-token");
  });
});

describe("isLikelyLoginHtml", () => {
  it("detects login page html", () => {
    const html = "<html><title>Kahunas | Welcome</title>Login to your account</html>";
    expect(isLikelyLoginHtml(html)).toBe(true);
  });

  it("ignores non-html", () => {
    expect(isLikelyLoginHtml("not html")).toBe(false);
  });
});
