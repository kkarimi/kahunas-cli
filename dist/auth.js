"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureWorkoutsFromBrowser = captureWorkoutsFromBrowser;
exports.loginWithBrowser = loginWithBrowser;
exports.loginAndPersist = loginAndPersist;
const args_1 = require("./args");
const config_1 = require("./config");
const http_1 = require("./http");
const tokens_1 = require("./tokens");
const utils_1 = require("./utils");
const workouts_1 = require("./workouts");
async function captureWorkoutsFromBrowser(options, config) {
    const webBaseUrl = (0, config_1.resolveWebBaseUrl)(options, config);
    const headless = (0, args_1.isFlagEnabled)(options, "headless");
    const playwright = await Promise.resolve().then(() => __importStar(require("playwright")));
    const browser = await playwright.chromium.launch({ headless });
    const context = await browser.newContext();
    const plans = [];
    const seen = new Set();
    let observedToken;
    const recordToken = (candidate) => {
        if (!candidate || observedToken) {
            return;
        }
        if ((0, tokens_1.isLikelyAuthToken)(candidate)) {
            observedToken = candidate;
        }
    };
    const recordPlans = (incoming) => {
        for (const plan of incoming) {
            if (!plan.uuid || seen.has(plan.uuid)) {
                continue;
            }
            seen.add(plan.uuid);
            plans.push(plan);
        }
    };
    context.on("request", (request) => {
        const headers = request.headers();
        recordToken(headers["auth-user-token"]);
    });
    context.on("response", async (response) => {
        const url = response.url();
        if (!url.includes("api.kahunas.io") || !/workout|program/i.test(url)) {
            return;
        }
        const contentType = response.headers()["content-type"] ?? "";
        if (!contentType.includes("application/json")) {
            return;
        }
        try {
            const data = (await response.json());
            const extracted = (0, workouts_1.extractWorkoutPlans)(data);
            if (extracted.length > 0) {
                recordPlans(extracted);
            }
        }
        catch {
            // Ignore responses that are not JSON.
        }
    });
    let csrfToken;
    let cookieHeader;
    let csrfCookie;
    try {
        const page = await context.newPage();
        const webOrigin = new URL(webBaseUrl).origin;
        await page.goto(`${webOrigin}/dashboard`, { waitUntil: "domcontentloaded" });
        await (0, utils_1.waitForEnter)("Log in, open your workouts page, then press Enter to capture...");
        const cookies = await context.cookies(webOrigin);
        cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
        csrfCookie = cookies.find((cookie) => cookie.name === "csrf_kahunas_cookie_token")?.value;
        csrfToken = csrfCookie ?? (0, config_1.resolveCsrfToken)(options, config);
        if (plans.length === 0) {
            await page.waitForTimeout(1500);
        }
    }
    finally {
        await browser.close();
    }
    return { plans, token: observedToken, csrfToken, webBaseUrl, cookieHeader, csrfCookie };
}
async function loginWithBrowser(options, config) {
    const webBaseUrl = (0, config_1.resolveWebBaseUrl)(options, config);
    const headless = (0, args_1.isFlagEnabled)(options, "headless");
    const playwright = await Promise.resolve().then(() => __importStar(require("playwright")));
    const browser = await playwright.chromium.launch({ headless });
    const context = await browser.newContext();
    let observedToken;
    const recordToken = (candidate) => {
        if (!candidate || observedToken) {
            return;
        }
        if ((0, tokens_1.isLikelyAuthToken)(candidate)) {
            observedToken = candidate;
        }
    };
    context.on("request", (request) => {
        const headers = request.headers();
        recordToken(headers["auth-user-token"]);
    });
    try {
        const page = await context.newPage();
        const webOrigin = new URL(webBaseUrl).origin;
        await page.goto(`${webOrigin}/dashboard`, { waitUntil: "domcontentloaded" });
        await (0, utils_1.waitForEnter)("Finish logging in, then press Enter to continue...");
        if (!observedToken) {
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForTimeout(1500);
        }
        if (!observedToken) {
            const storageDump = await page.evaluate(() => {
                const localEntries = Object.entries(localStorage);
                const sessionEntries = Object.entries(sessionStorage);
                return { localEntries, sessionEntries };
            });
            for (const [, value] of storageDump.localEntries) {
                recordToken((0, tokens_1.extractToken)(value));
            }
            for (const [, value] of storageDump.sessionEntries) {
                recordToken((0, tokens_1.extractToken)(value));
            }
        }
        const cookies = await context.cookies(webOrigin);
        const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
        const csrfCookie = cookies.find((cookie) => cookie.name === "csrf_kahunas_cookie_token")?.value;
        const csrfToken = csrfCookie ?? (0, config_1.resolveCsrfToken)(options, config);
        let raw;
        if (!observedToken) {
            if (!csrfToken) {
                throw new Error("Missing CSRF token after login. Try again or provide --csrf.");
            }
            if (!cookieHeader) {
                throw new Error("Missing cookies after login. Try again.");
            }
            const { token: extractedToken, raw: fetchedRaw } = await (0, http_1.fetchAuthToken)(csrfToken, cookieHeader, webBaseUrl);
            recordToken(extractedToken);
            raw = fetchedRaw;
        }
        if (!observedToken) {
            throw new Error("Unable to extract auth token after login.");
        }
        return { token: observedToken, csrfToken, webBaseUrl, raw, cookieHeader, csrfCookie };
    }
    finally {
        await browser.close();
    }
}
async function loginAndPersist(options, config, outputMode) {
    const result = await loginWithBrowser(options, config);
    const nextConfig = {
        ...config,
        token: result.token,
        webBaseUrl: result.webBaseUrl
    };
    if (result.csrfToken) {
        nextConfig.csrfToken = result.csrfToken;
    }
    if (result.cookieHeader) {
        nextConfig.authCookie = result.cookieHeader;
    }
    if (result.csrfCookie) {
        nextConfig.csrfCookie = result.csrfCookie;
    }
    (0, config_1.writeConfig)(nextConfig);
    if (outputMode !== "silent") {
        if (outputMode === "raw") {
            console.log(result.raw ?? result.token);
        }
        else {
            console.log(result.token);
        }
    }
    return result.token;
}
