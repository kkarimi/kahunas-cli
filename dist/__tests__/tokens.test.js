"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tokens_1 = require("../tokens");
(0, vitest_1.describe)("isLikelyAuthToken", () => {
    (0, vitest_1.it)("accepts long opaque tokens", () => {
        const token = "a".repeat(120);
        (0, vitest_1.expect)((0, tokens_1.isLikelyAuthToken)(token)).toBe(true);
    });
    (0, vitest_1.it)("accepts jwt-like tokens", () => {
        (0, vitest_1.expect)((0, tokens_1.isLikelyAuthToken)("aaa.bbb.ccc")).toBe(true);
    });
    (0, vitest_1.it)("accepts base64-ish tokens", () => {
        (0, vitest_1.expect)((0, tokens_1.isLikelyAuthToken)("abcd+1234/efghijklmnopqrstuv=1234567890abcd")).toBe(true);
    });
});
(0, vitest_1.describe)("extractToken", () => {
    (0, vitest_1.it)("extracts token from json", () => {
        const token = "a".repeat(90);
        const raw = JSON.stringify({ token });
        (0, vitest_1.expect)((0, tokens_1.extractToken)(raw)).toBe(token);
    });
    (0, vitest_1.it)("returns trimmed text when json parse fails", () => {
        (0, vitest_1.expect)((0, tokens_1.extractToken)("  raw-token  ")).toBe("raw-token");
    });
});
(0, vitest_1.describe)("isLikelyLoginHtml", () => {
    (0, vitest_1.it)("detects login page html", () => {
        const html = "<html><title>Kahunas | Welcome</title>Login to your account</html>";
        (0, vitest_1.expect)((0, tokens_1.isLikelyLoginHtml)(html)).toBe(true);
    });
    (0, vitest_1.it)("ignores non-html", () => {
        (0, vitest_1.expect)((0, tokens_1.isLikelyLoginHtml)("not html")).toBe(false);
    });
});
