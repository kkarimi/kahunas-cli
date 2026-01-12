"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const args_1 = require("../args");
(0, vitest_1.describe)("parseArgs", () => {
    (0, vitest_1.it)("parses positionals and boolean flags", () => {
        const parsed = (0, args_1.parseArgs)(["auth", "login", "--headless"]);
        (0, vitest_1.expect)(parsed.positionals).toEqual(["auth", "login"]);
        (0, vitest_1.expect)(parsed.options).toEqual({ headless: "true" });
    });
    (0, vitest_1.it)("parses key-value options", () => {
        const parsed = (0, args_1.parseArgs)([
            "workout",
            "events",
            "--timezone",
            "Europe/London",
            "--program=abc"
        ]);
        (0, vitest_1.expect)(parsed.positionals).toEqual(["workout", "events"]);
        (0, vitest_1.expect)(parsed.options).toEqual({ timezone: "Europe/London", program: "abc" });
    });
});
(0, vitest_1.describe)("isFlagEnabled", () => {
    (0, vitest_1.it)("treats true-ish values as enabled", () => {
        (0, vitest_1.expect)((0, args_1.isFlagEnabled)({ flag: "true" }, "flag")).toBe(true);
        (0, vitest_1.expect)((0, args_1.isFlagEnabled)({ flag: "1" }, "flag")).toBe(true);
        (0, vitest_1.expect)((0, args_1.isFlagEnabled)({ flag: "yes" }, "flag")).toBe(true);
        (0, vitest_1.expect)((0, args_1.isFlagEnabled)({ flag: "false" }, "flag")).toBe(false);
    });
});
(0, vitest_1.describe)("shouldAutoLogin", () => {
    (0, vitest_1.it)("uses default when flags are absent", () => {
        (0, vitest_1.expect)((0, args_1.shouldAutoLogin)({}, true)).toBe(true);
        (0, vitest_1.expect)((0, args_1.shouldAutoLogin)({}, false)).toBe(false);
    });
    (0, vitest_1.it)("respects override flags", () => {
        (0, vitest_1.expect)((0, args_1.shouldAutoLogin)({ "auto-login": "true" }, false)).toBe(true);
        (0, vitest_1.expect)((0, args_1.shouldAutoLogin)({ "no-auto-login": "true" }, true)).toBe(false);
    });
});
