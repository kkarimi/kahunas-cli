import { describe, expect, it } from "vitest";
import { extractUserUuidFromCheckins, isTokenExpiredResponse } from "../responses";

describe("responses helpers", () => {
  it("detects token expiration responses", () => {
    expect(isTokenExpiredResponse({ token_expired: 1 })).toBe(true);
    expect(isTokenExpiredResponse({ token_expired: true })).toBe(true);
    expect(isTokenExpiredResponse({ status: -3 })).toBe(true);
    expect(isTokenExpiredResponse({ message: "Please LOGIN again" })).toBe(true);
    expect(isTokenExpiredResponse({ message: "ok" })).toBe(false);
    expect(isTokenExpiredResponse(null)).toBe(false);
  });

  it("extracts a user uuid from checkins payloads", () => {
    const payload = { data: { checkins: [{ user_uuid: "user-123" }] } };
    expect(extractUserUuidFromCheckins(payload)).toBe("user-123");
    expect(extractUserUuidFromCheckins({ data: { checkins: [] } })).toBeUndefined();
    expect(extractUserUuidFromCheckins({ data: {} })).toBeUndefined();
  });
});
