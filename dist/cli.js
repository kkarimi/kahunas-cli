#!/usr/bin/env node
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
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const readline = __importStar(require("node:readline"));
const DEFAULT_BASE_URL = "https://api.kahunas.io";
const DEFAULT_WEB_BASE_URL = "https://kahunas.io";
const CONFIG_PATH = path.join(os.homedir(), ".config", "kahunas", "config.json");
const WORKOUT_CACHE_PATH = path.join(os.homedir(), ".config", "kahunas", "workouts.json");
function parseArgs(argv) {
    const positionals = [];
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith("--")) {
            positionals.push(arg);
            continue;
        }
        const trimmed = arg.slice(2);
        const [key, inlineValue] = trimmed.split("=");
        if (inlineValue !== undefined) {
            options[key] = inlineValue;
            continue;
        }
        const next = argv[index + 1];
        if (next && !next.startsWith("--")) {
            options[key] = next;
            index += 1;
            continue;
        }
        options[key] = "true";
    }
    return { positionals, options };
}
function isFlagEnabled(options, name) {
    const value = options[name];
    return value === "true" || value === "1" || value === "yes";
}
function shouldAutoLogin(options, defaultValue) {
    if (isFlagEnabled(options, "auto-login")) {
        return true;
    }
    if (isFlagEnabled(options, "no-auto-login")) {
        return false;
    }
    return defaultValue;
}
function isLikelyAuthToken(value) {
    if (value.length >= 80) {
        return true;
    }
    if (value.includes(".") && value.split(".").length >= 3) {
        return true;
    }
    return /[+/=]/.test(value) && value.length >= 40;
}
function findTokenInUnknown(value) {
    if (typeof value === "string") {
        return isLikelyAuthToken(value) ? value : undefined;
    }
    if (Array.isArray(value)) {
        for (const entry of value) {
            const token = findTokenInUnknown(entry);
            if (token) {
                return token;
            }
        }
        return undefined;
    }
    if (value && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
            if (typeof entry === "string" && key.toLowerCase().includes("token")) {
                if (isLikelyAuthToken(entry)) {
                    return entry;
                }
            }
            const token = findTokenInUnknown(entry);
            if (token) {
                return token;
            }
        }
    }
    return undefined;
}
function readConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return {};
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error(`Invalid JSON in ${CONFIG_PATH}.`);
    }
}
function writeConfig(config) {
    const dir = path.dirname(CONFIG_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}
function readWorkoutCache() {
    if (!fs.existsSync(WORKOUT_CACHE_PATH)) {
        return undefined;
    }
    const raw = fs.readFileSync(WORKOUT_CACHE_PATH, "utf-8");
    try {
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
function writeWorkoutCache(plans) {
    const dir = path.dirname(WORKOUT_CACHE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const cache = { updatedAt: new Date().toISOString(), plans };
    fs.writeFileSync(WORKOUT_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
    return cache;
}
function resolveToken(options, config) {
    return options.token ?? process.env.KAHUNAS_TOKEN ?? config.token;
}
function resolveCsrfToken(options, config) {
    return options.csrf ?? process.env.KAHUNAS_CSRF ?? config.csrfToken;
}
function resolveCsrfCookie(options, config) {
    return options["csrf-cookie"] ?? process.env.KAHUNAS_CSRF_COOKIE ?? config.csrfCookie;
}
function resolveAuthCookie(options, config) {
    return options.cookie ?? process.env.KAHUNAS_COOKIE ?? config.authCookie;
}
function resolveUserUuid(options, config) {
    return options.user ?? process.env.KAHUNAS_USER_UUID ?? config.userUuid;
}
function resolveBaseUrl(options, config) {
    return options["base-url"] ?? config.baseUrl ?? DEFAULT_BASE_URL;
}
function resolveWebBaseUrl(options, config) {
    return (options["web-base-url"] ??
        process.env.KAHUNAS_WEB_BASE_URL ??
        config.webBaseUrl ??
        DEFAULT_WEB_BASE_URL);
}
function parseNumber(value, fallback) {
    if (!value) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }
    return parsed;
}
function parseJsonText(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
function isLikelyLoginHtml(text) {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed.startsWith("<")) {
        return false;
    }
    return (trimmed.includes("login to your account") ||
        trimmed.includes("welcome back") ||
        trimmed.includes("<title>kahunas"));
}
function mapWorkoutPlan(entry) {
    const uuid = typeof entry.uuid === "string" ? entry.uuid : undefined;
    const title = typeof entry.title === "string"
        ? entry.title
        : typeof entry.name === "string"
            ? entry.name
            : undefined;
    if (!uuid || !title) {
        return undefined;
    }
    return {
        uuid,
        title,
        updated_at_utc: typeof entry.updated_at_utc === "number" ? entry.updated_at_utc : undefined,
        created_at_utc: typeof entry.created_at_utc === "number" ? entry.created_at_utc : undefined,
        days: typeof entry.days === "number" ? entry.days : undefined
    };
}
function findWorkoutPlansDeep(payload) {
    const results = [];
    const seen = new Set();
    const record = (plan) => {
        if (!plan || !plan.uuid) {
            return;
        }
        if (seen.has(plan.uuid)) {
            return;
        }
        seen.add(plan.uuid);
        results.push(plan);
    };
    const visit = (value) => {
        if (Array.isArray(value)) {
            let foundCandidate = false;
            for (const entry of value) {
                if (entry && typeof entry === "object") {
                    const plan = mapWorkoutPlan(entry);
                    if (plan) {
                        record(plan);
                        foundCandidate = true;
                    }
                }
            }
            if (foundCandidate) {
                return;
            }
            for (const entry of value) {
                visit(entry);
            }
            return;
        }
        if (value && typeof value === "object") {
            const plan = mapWorkoutPlan(value);
            if (plan) {
                record(plan);
            }
            for (const entry of Object.values(value)) {
                visit(entry);
            }
        }
    };
    visit(payload);
    return results;
}
function mergeWorkoutPlans(primary, secondary) {
    const merged = [];
    const seen = new Set();
    const pushPlan = (plan) => {
        if (!plan.uuid || seen.has(plan.uuid)) {
            return;
        }
        seen.add(plan.uuid);
        merged.push(plan);
    };
    for (const plan of primary) {
        pushPlan(plan);
    }
    for (const plan of secondary) {
        pushPlan(plan);
    }
    return merged;
}
function extractWorkoutPlans(payload) {
    if (!payload || typeof payload !== "object") {
        return [];
    }
    const record = payload;
    const data = record.data;
    if (!data || typeof data !== "object") {
        return findWorkoutPlansDeep(payload);
    }
    const dataRecord = data;
    const keys = ["workout_plan", "workout_plans", "workout_program", "workout_programs"];
    const plans = [];
    for (const key of keys) {
        const workoutPlan = dataRecord[key];
        if (Array.isArray(workoutPlan)) {
            for (const entry of workoutPlan) {
                if (entry && typeof entry === "object") {
                    const plan = mapWorkoutPlan(entry);
                    if (plan) {
                        plans.push(plan);
                    }
                }
            }
            continue;
        }
        if (workoutPlan && typeof workoutPlan === "object") {
            const plan = mapWorkoutPlan(workoutPlan);
            if (plan) {
                plans.push(plan);
            }
        }
    }
    if (plans.length > 0) {
        return plans;
    }
    return findWorkoutPlansDeep(payload);
}
function extractUserUuidFromCheckins(payload) {
    if (!payload || typeof payload !== "object") {
        return undefined;
    }
    const record = payload;
    const data = record.data;
    if (!data || typeof data !== "object") {
        return undefined;
    }
    const checkins = data.checkins;
    if (!Array.isArray(checkins) || checkins.length === 0) {
        return undefined;
    }
    const first = checkins[0];
    if (!first || typeof first !== "object") {
        return undefined;
    }
    const candidate = first.user_uuid;
    return typeof candidate === "string" ? candidate : undefined;
}
function pickLatestWorkout(plans) {
    const sorted = [...plans].sort((a, b) => {
        const aValue = a.updated_at_utc ?? a.created_at_utc ?? 0;
        const bValue = b.updated_at_utc ?? b.created_at_utc ?? 0;
        return bValue - aValue;
    });
    return sorted[0];
}
function formatWorkoutSummary(plan) {
    const title = plan.title ?? "Untitled";
    const uuid = plan.uuid ?? "unknown";
    const days = plan.days ? ` - ${plan.days} days` : "";
    return `${title}${days} (${uuid})`;
}
function buildWorkoutPlanIndex(plans) {
    const index = {};
    for (const plan of plans) {
        if (plan.uuid) {
            index[plan.uuid] = plan;
        }
    }
    return index;
}
function printResponse(response, rawOutput) {
    if (rawOutput) {
        console.log(response.text);
        return;
    }
    if (response.json !== undefined) {
        console.log(JSON.stringify(response.json, null, 2));
        return;
    }
    console.log(response.text);
}
function isTokenExpiredResponse(payload) {
    if (!payload || typeof payload !== "object") {
        return false;
    }
    const record = payload;
    if (record.token_expired === 1 || record.token_expired === true) {
        return true;
    }
    if (record.status === -3) {
        return true;
    }
    if (typeof record.message === "string" && record.message.toLowerCase().includes("login")) {
        return true;
    }
    return false;
}
function printUsage() {
    console.log(`kahunas - CLI for Kahunas API\n\nUsage:\n  kahunas auth set <token> [--base-url URL] [--csrf CSRF] [--web-base-url URL] [--cookie COOKIE] [--csrf-cookie VALUE]\n  kahunas auth token [--csrf CSRF] [--cookie COOKIE] [--csrf-cookie VALUE] [--web-base-url URL] [--raw]\n  kahunas auth login [--web-base-url URL] [--headless] [--raw]\n  kahunas auth status [--token TOKEN] [--base-url URL] [--auto-login] [--headless]\n  kahunas auth show\n  kahunas checkins list [--page N] [--rpp N] [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n  kahunas workout list [--page N] [--rpp N] [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n  kahunas workout pick [--page N] [--rpp N] [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n  kahunas workout latest [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n  kahunas workout events [--user UUID] [--timezone TZ] [--program UUID] [--workout UUID] [--minimal] [--raw] [--no-auto-login] [--headless]\n  kahunas workout sync [--headless]\n  kahunas workout program <id> [--csrf CSRF] [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n\nEnv:\n  KAHUNAS_TOKEN=...\n  KAHUNAS_CSRF=...\n  KAHUNAS_CSRF_COOKIE=...\n  KAHUNAS_COOKIE=...\n  KAHUNAS_WEB_BASE_URL=...\n  KAHUNAS_USER_UUID=...\n\nConfig:\n  ${CONFIG_PATH}`);
}
function askQuestion(prompt) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
function waitForEnter(prompt) {
    return askQuestion(prompt).then(() => undefined);
}
function extractToken(text) {
    try {
        const parsed = JSON.parse(text);
        return findTokenInUnknown(parsed);
    }
    catch {
        const trimmed = text.trim();
        return trimmed ? trimmed : undefined;
    }
}
async function postJson(pathName, token, baseUrl, body) {
    const url = new URL(pathName, baseUrl).toString();
    const response = await fetch(url, {
        method: "POST",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
            "auth-user-token": token,
            origin: "https://kahunas.io",
            referer: "https://kahunas.io/"
        },
        body: JSON.stringify(body)
    });
    const text = await response.text();
    return {
        ok: response.ok,
        status: response.status,
        text,
        json: parseJsonText(text)
    };
}
async function getWithAuth(pathName, token, baseUrl) {
    const url = new URL(pathName, baseUrl).toString();
    const response = await fetch(url, {
        method: "GET",
        headers: {
            accept: "*/*",
            "auth-user-token": token,
            origin: "https://kahunas.io",
            referer: "https://kahunas.io/"
        }
    });
    const text = await response.text();
    return {
        ok: response.ok,
        status: response.status,
        text,
        json: parseJsonText(text)
    };
}
async function fetchWorkoutProgram(token, baseUrl, programId, csrfToken) {
    const url = new URL(`/api/v1/workoutprogram/${programId}`, baseUrl);
    if (csrfToken) {
        url.searchParams.set("csrf_kahunas_token", csrfToken);
    }
    return getWithAuth(url.pathname + url.search, token, baseUrl);
}
async function captureWorkoutsFromBrowser(options, config) {
    const webBaseUrl = resolveWebBaseUrl(options, config);
    const headless = isFlagEnabled(options, "headless");
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
        if (isLikelyAuthToken(candidate)) {
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
            const extracted = extractWorkoutPlans(data);
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
        await waitForEnter("Log in, open your workouts page, then press Enter to capture...");
        const cookies = await context.cookies(webOrigin);
        cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
        csrfCookie = cookies.find((cookie) => cookie.name === "csrf_kahunas_cookie_token")?.value;
        csrfToken = csrfCookie ?? resolveCsrfToken(options, config);
        if (plans.length === 0) {
            await page.waitForTimeout(1500);
        }
    }
    finally {
        await browser.close();
    }
    return { plans, token: observedToken, csrfToken, webBaseUrl, cookieHeader, csrfCookie };
}
async function fetchAuthToken(csrfToken, cookieHeader, webBaseUrl) {
    const webOrigin = new URL(webBaseUrl).origin;
    const url = new URL("/get-token", webOrigin);
    url.searchParams.set("csrf_kahunas_token", csrfToken);
    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            accept: "*/*",
            cookie: cookieHeader,
            origin: webOrigin,
            referer: `${webOrigin}/dashboard`,
            "x-requested-with": "XMLHttpRequest"
        }
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }
    return { token: extractToken(text), raw: text };
}
async function loginWithBrowser(options, config) {
    const webBaseUrl = resolveWebBaseUrl(options, config);
    const headless = isFlagEnabled(options, "headless");
    const playwright = await Promise.resolve().then(() => __importStar(require("playwright")));
    const browser = await playwright.chromium.launch({ headless });
    const context = await browser.newContext();
    let observedToken;
    const recordToken = (candidate) => {
        if (!candidate || observedToken) {
            return;
        }
        if (isLikelyAuthToken(candidate)) {
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
        await waitForEnter("Finish logging in, then press Enter to continue...");
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
                recordToken(extractToken(value));
            }
            for (const [, value] of storageDump.sessionEntries) {
                recordToken(extractToken(value));
            }
        }
        const cookies = await context.cookies(webOrigin);
        const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
        const csrfCookie = cookies.find((cookie) => cookie.name === "csrf_kahunas_cookie_token")?.value;
        const csrfToken = csrfCookie ?? resolveCsrfToken(options, config);
        let raw;
        if (!observedToken) {
            if (!csrfToken) {
                throw new Error("Missing CSRF token after login. Try again or provide --csrf.");
            }
            if (!cookieHeader) {
                throw new Error("Missing cookies after login. Try again.");
            }
            const { token: extractedToken, raw: fetchedRaw } = await fetchAuthToken(csrfToken, cookieHeader, webBaseUrl);
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
    writeConfig(nextConfig);
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
async function handleAuth(positionals, options) {
    const action = positionals[0];
    if (!action || action === "help") {
        printUsage();
        return;
    }
    if (action === "set") {
        const token = positionals[1] ?? options.token;
        if (!token) {
            throw new Error("Missing token for auth set.");
        }
        const config = readConfig();
        const baseUrl = resolveBaseUrl(options, config);
        const csrfToken = resolveCsrfToken(options, config);
        const webBaseUrl = resolveWebBaseUrl(options, config);
        const authCookie = resolveAuthCookie(options, config);
        const csrfCookie = resolveCsrfCookie(options, config);
        writeConfig({
            ...config,
            token,
            baseUrl,
            csrfToken,
            webBaseUrl,
            authCookie,
            csrfCookie
        });
        console.log(`Saved token to ${CONFIG_PATH}`);
        return;
    }
    if (action === "token") {
        const config = readConfig();
        const csrfToken = resolveCsrfToken(options, config);
        if (!csrfToken) {
            throw new Error("Missing CSRF token. Provide --csrf or set KAHUNAS_CSRF.");
        }
        const webBaseUrl = resolveWebBaseUrl(options, config);
        const authCookie = resolveAuthCookie(options, config);
        const csrfCookie = resolveCsrfCookie(options, config);
        const cookieToken = csrfCookie ?? csrfToken;
        const cookieHeader = authCookie ?? `csrf_kahunas_cookie_token=${cookieToken}`;
        const rawOutput = isFlagEnabled(options, "raw");
        const { token: extractedToken, raw } = await fetchAuthToken(csrfToken, cookieHeader, webBaseUrl);
        const token = extractedToken && isLikelyAuthToken(extractedToken) ? extractedToken : undefined;
        if (rawOutput) {
            console.log(raw);
            return;
        }
        if (!token) {
            console.log(raw);
            return;
        }
        const nextConfig = {
            ...config,
            token,
            csrfToken,
            webBaseUrl
        };
        if (authCookie) {
            nextConfig.authCookie = authCookie;
        }
        if (csrfCookie) {
            nextConfig.csrfCookie = csrfCookie;
        }
        writeConfig(nextConfig);
        console.log(token);
        return;
    }
    if (action === "login") {
        const config = readConfig();
        const rawOutput = isFlagEnabled(options, "raw");
        const outputMode = rawOutput ? "raw" : "token";
        await loginAndPersist(options, config, outputMode);
        return;
    }
    if (action === "status") {
        const config = readConfig();
        const autoLogin = shouldAutoLogin(options, false);
        let token = resolveToken(options, config);
        if (!token) {
            if (autoLogin) {
                token = await loginAndPersist(options, config, "silent");
            }
            else {
                throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth login'.");
            }
        }
        const baseUrl = resolveBaseUrl(options, config);
        let response = await postJson("/api/v2/checkin/list", token, baseUrl, { page: 1, rpp: 1 });
        if (autoLogin && isTokenExpiredResponse(response.json)) {
            token = await loginAndPersist(options, config, "silent");
            response = await postJson("/api/v2/checkin/list", token, baseUrl, { page: 1, rpp: 1 });
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.text}`);
        }
        if (response.json === undefined) {
            console.log("unknown");
            return;
        }
        console.log(isTokenExpiredResponse(response.json) ? "expired" : "valid");
        return;
    }
    if (action === "show") {
        const config = readConfig();
        if (!config.token) {
            throw new Error("No token saved. Use 'kahunas auth set <token>' or set KAHUNAS_TOKEN.");
        }
        console.log(config.token);
        return;
    }
    throw new Error(`Unknown auth action: ${action}`);
}
async function handleCheckins(positionals, options) {
    const action = positionals[0];
    if (!action || action === "help") {
        printUsage();
        return;
    }
    if (action !== "list") {
        throw new Error(`Unknown checkins action: ${action}`);
    }
    const config = readConfig();
    const autoLogin = shouldAutoLogin(options, true);
    let token = resolveToken(options, config);
    if (!token) {
        if (autoLogin) {
            token = await loginAndPersist(options, config, "silent");
        }
        else {
            throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth login'.");
        }
    }
    const baseUrl = resolveBaseUrl(options, config);
    const page = parseNumber(options.page, 1);
    const rpp = parseNumber(options.rpp, 12);
    const rawOutput = isFlagEnabled(options, "raw");
    let response = await postJson("/api/v2/checkin/list", token, baseUrl, { page, rpp });
    if (autoLogin && isTokenExpiredResponse(response.json)) {
        token = await loginAndPersist(options, config, "silent");
        response = await postJson("/api/v2/checkin/list", token, baseUrl, { page, rpp });
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.text}`);
    }
    const userUuid = extractUserUuidFromCheckins(response.json);
    if (userUuid && userUuid !== config.userUuid) {
        writeConfig({ ...config, userUuid });
    }
    printResponse(response, rawOutput);
}
async function handleWorkout(positionals, options) {
    const action = positionals[0];
    if (!action || action === "help") {
        printUsage();
        return;
    }
    const config = readConfig();
    const autoLogin = shouldAutoLogin(options, true);
    let token = resolveToken(options, config);
    const ensureToken = async () => {
        if (!token) {
            if (autoLogin) {
                token = await loginAndPersist(options, config, "silent");
            }
            else {
                throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth login'.");
            }
        }
        return token;
    };
    const baseUrl = resolveBaseUrl(options, config);
    const rawOutput = isFlagEnabled(options, "raw");
    const page = parseNumber(options.page, 1);
    const rpp = parseNumber(options.rpp, 12);
    const listRpp = action === "latest" && options.rpp === undefined ? 100 : rpp;
    const fetchList = async () => {
        await ensureToken();
        const url = new URL("/api/v1/workoutprogram", baseUrl);
        if (page) {
            url.searchParams.set("page", String(page));
        }
        if (listRpp) {
            url.searchParams.set("rpp", String(listRpp));
        }
        let response = await getWithAuth(url.pathname + url.search, token, baseUrl);
        if (autoLogin && isTokenExpiredResponse(response.json)) {
            token = await loginAndPersist(options, config, "silent");
            response = await getWithAuth(url.pathname + url.search, token, baseUrl);
        }
        const cache = readWorkoutCache();
        const plans = extractWorkoutPlans(response.json);
        const merged = cache ? mergeWorkoutPlans(plans, cache.plans) : plans;
        return { response, plans: merged, cache };
    };
    if (action === "list") {
        const { response, plans, cache } = await fetchList();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.text}`);
        }
        if (rawOutput) {
            printResponse(response, rawOutput);
            return;
        }
        const output = {
            source: cache ? "api+cache" : "api",
            cache: cache
                ? {
                    updated_at: cache.updatedAt,
                    count: cache.plans.length,
                    path: WORKOUT_CACHE_PATH
                }
                : undefined,
            data: {
                workout_plan: plans
            }
        };
        console.log(JSON.stringify(output, null, 2));
        return;
    }
    if (action === "pick") {
        const { response, plans } = await fetchList();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.text}`);
        }
        if (plans.length === 0) {
            throw new Error("No workout programs found.");
        }
        if (!rawOutput) {
            console.log("Pick a workout program:");
            plans.forEach((plan, index) => {
                console.log(`${index + 1}) ${formatWorkoutSummary(plan)}`);
            });
        }
        const answer = await askQuestion(`Enter number (1-${plans.length}): `);
        const selection = Number.parseInt(answer, 10);
        if (Number.isNaN(selection) || selection < 1 || selection > plans.length) {
            throw new Error("Invalid selection.");
        }
        const chosen = plans[selection - 1];
        if (!chosen.uuid) {
            throw new Error("Selected workout is missing a uuid.");
        }
        const csrfToken = resolveCsrfToken(options, config);
        const ensuredToken = await ensureToken();
        let responseProgram = await fetchWorkoutProgram(ensuredToken, baseUrl, chosen.uuid, csrfToken);
        if (autoLogin && isTokenExpiredResponse(responseProgram.json)) {
            token = await loginAndPersist(options, config, "silent");
            responseProgram = await fetchWorkoutProgram(token, baseUrl, chosen.uuid, csrfToken);
        }
        if (!responseProgram.ok) {
            throw new Error(`HTTP ${responseProgram.status}: ${responseProgram.text}`);
        }
        printResponse(responseProgram, rawOutput);
        return;
    }
    if (action === "latest") {
        const { response, plans } = await fetchList();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.text}`);
        }
        if (plans.length === 0) {
            throw new Error("No workout programs found.");
        }
        const chosen = pickLatestWorkout(plans);
        if (!chosen || !chosen.uuid) {
            throw new Error("Latest workout is missing a uuid.");
        }
        const csrfToken = resolveCsrfToken(options, config);
        const ensuredToken = await ensureToken();
        let responseProgram = await fetchWorkoutProgram(ensuredToken, baseUrl, chosen.uuid, csrfToken);
        if (autoLogin && isTokenExpiredResponse(responseProgram.json)) {
            token = await loginAndPersist(options, config, "silent");
            responseProgram = await fetchWorkoutProgram(token, baseUrl, chosen.uuid, csrfToken);
        }
        if (!responseProgram.ok) {
            throw new Error(`HTTP ${responseProgram.status}: ${responseProgram.text}`);
        }
        printResponse(responseProgram, rawOutput);
        return;
    }
    if (action === "events") {
        const baseWebUrl = resolveWebBaseUrl(options, config);
        const webOrigin = new URL(baseWebUrl).origin;
        const timezone = options.timezone ??
            process.env.TZ ??
            Intl.DateTimeFormat().resolvedOptions().timeZone ??
            "Europe/London";
        let userUuid = resolveUserUuid(options, config);
        if (!userUuid) {
            throw new Error("Missing user uuid. Use --user or set KAHUNAS_USER_UUID.");
        }
        if (userUuid !== config.userUuid) {
            writeConfig({ ...config, userUuid });
        }
        const minimal = isFlagEnabled(options, "minimal");
        let csrfToken = resolveCsrfToken(options, config);
        let csrfCookie = resolveCsrfCookie(options, config);
        let authCookie = resolveAuthCookie(options, config);
        let effectiveCsrfToken = csrfCookie ?? csrfToken;
        let cookieHeader = authCookie ??
            (effectiveCsrfToken ? `csrf_kahunas_cookie_token=${effectiveCsrfToken}` : undefined);
        if ((!csrfToken || !cookieHeader || !authCookie) && autoLogin) {
            await loginAndPersist(options, config, "silent");
            const refreshed = readConfig();
            csrfToken = resolveCsrfToken(options, refreshed);
            csrfCookie = resolveCsrfCookie(options, refreshed);
            authCookie = resolveAuthCookie(options, refreshed);
            effectiveCsrfToken = csrfCookie ?? csrfToken;
            cookieHeader =
                authCookie ??
                    (effectiveCsrfToken ? `csrf_kahunas_cookie_token=${effectiveCsrfToken}` : undefined);
        }
        if (!effectiveCsrfToken) {
            throw new Error("Missing CSRF token. Run 'kahunas auth login' and try again.");
        }
        if (!cookieHeader) {
            throw new Error("Missing cookies. Run 'kahunas auth login' and try again.");
        }
        const url = new URL(`/coach/clients/calendar/getEvent/${userUuid}`, webOrigin);
        url.searchParams.set("timezone", timezone);
        const body = new URLSearchParams();
        body.set("csrf_kahunas_token", effectiveCsrfToken);
        body.set("filter", options.filter ?? "");
        let response = await fetch(url.toString(), {
            method: "POST",
            headers: {
                accept: "*/*",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                cookie: cookieHeader,
                origin: webOrigin,
                referer: `${webOrigin}/dashboard`,
                "x-requested-with": "XMLHttpRequest"
            },
            body: body.toString()
        });
        let text = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text}`);
        }
        if (autoLogin && isLikelyLoginHtml(text)) {
            await loginAndPersist(options, config, "silent");
            const refreshed = readConfig();
            csrfToken = resolveCsrfToken(options, refreshed);
            csrfCookie = resolveCsrfCookie(options, refreshed);
            authCookie = resolveAuthCookie(options, refreshed);
            effectiveCsrfToken = csrfCookie ?? csrfToken;
            cookieHeader =
                authCookie ??
                    (effectiveCsrfToken ? `csrf_kahunas_cookie_token=${effectiveCsrfToken}` : undefined);
            if (!effectiveCsrfToken || !cookieHeader) {
                throw new Error("Login required. Run 'kahunas auth login' and try again.");
            }
            const retry = await fetch(url.toString(), {
                method: "POST",
                headers: {
                    accept: "*/*",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    cookie: cookieHeader,
                    origin: webOrigin,
                    referer: `${webOrigin}/dashboard`,
                    "x-requested-with": "XMLHttpRequest"
                },
                body: body.toString()
            });
            text = await retry.text();
            if (!retry.ok) {
                throw new Error(`HTTP ${retry.status}: ${text}`);
            }
        }
        if (rawOutput) {
            console.log(text);
            return;
        }
        const payload = parseJsonText(text);
        if (!Array.isArray(payload)) {
            console.log(text);
            return;
        }
        const programFilter = options.program;
        const workoutFilter = options.workout;
        const filtered = payload.filter((entry) => {
            if (!entry || typeof entry !== "object") {
                return false;
            }
            const record = entry;
            if (programFilter && record.program !== programFilter) {
                return false;
            }
            if (workoutFilter && record.workout !== workoutFilter) {
                return false;
            }
            return true;
        });
        const sorted = [...filtered].sort((a, b) => {
            const aStart = typeof a.start === "string" ? Date.parse(a.start.replace(" ", "T")) : 0;
            const bStart = typeof b.start === "string" ? Date.parse(b.start.replace(" ", "T")) : 0;
            return aStart - bStart;
        });
        if (minimal) {
            console.log(JSON.stringify(sorted, null, 2));
            return;
        }
        let programIndex;
        const cache = readWorkoutCache();
        let plans = cache?.plans ?? [];
        try {
            await ensureToken();
            const url = new URL("/api/v1/workoutprogram", baseUrl);
            url.searchParams.set("page", "1");
            url.searchParams.set("rpp", "100");
            let response = await getWithAuth(url.pathname + url.search, token, baseUrl);
            if (autoLogin && isTokenExpiredResponse(response.json)) {
                token = await loginAndPersist(options, config, "silent");
                response = await getWithAuth(url.pathname + url.search, token, baseUrl);
            }
            if (response.ok) {
                const fromApi = extractWorkoutPlans(response.json);
                plans = mergeWorkoutPlans(fromApi, plans);
            }
        }
        catch {
            // Best-effort enrichment only.
        }
        if (plans.length > 0) {
            programIndex = buildWorkoutPlanIndex(plans);
        }
        const programDetails = {};
        const programIds = Array.from(new Set(sorted
            .map((entry) => {
            if (!entry || typeof entry !== "object") {
                return undefined;
            }
            const record = entry;
            return typeof record.program === "string" ? record.program : undefined;
        })
            .filter((value) => Boolean(value))));
        for (const programId of programIds) {
            try {
                await ensureToken();
                let response = await fetchWorkoutProgram(token, baseUrl, programId, effectiveCsrfToken);
                if (autoLogin && isTokenExpiredResponse(response.json)) {
                    token = await loginAndPersist(options, config, "silent");
                    response = await fetchWorkoutProgram(token, baseUrl, programId, effectiveCsrfToken);
                }
                if (response.ok && response.json && typeof response.json === "object") {
                    const payload = response.json;
                    const data = payload.data;
                    if (data && typeof data === "object") {
                        const plan = data.workout_plan;
                        if (plan) {
                            programDetails[programId] = plan;
                            continue;
                        }
                    }
                    programDetails[programId] = payload;
                    continue;
                }
            }
            catch {
                // Ignore fetch failures and fall back to cached index.
            }
            programDetails[programId] = programIndex?.[programId] ?? null;
        }
        const enriched = sorted.map((entry) => {
            if (!entry || typeof entry !== "object") {
                return entry;
            }
            const record = entry;
            const programUuid = typeof record.program === "string" ? record.program : undefined;
            const program = programUuid ? programDetails[programUuid] : undefined;
            return {
                ...record,
                program_details: program ?? null
            };
        });
        console.log(JSON.stringify(enriched, null, 2));
        return;
    }
    if (action === "sync") {
        const captured = await captureWorkoutsFromBrowser(options, config);
        const nextConfig = { ...config };
        if (captured.token) {
            nextConfig.token = captured.token;
        }
        if (captured.csrfToken) {
            nextConfig.csrfToken = captured.csrfToken;
        }
        if (captured.webBaseUrl) {
            nextConfig.webBaseUrl = captured.webBaseUrl;
        }
        if (captured.cookieHeader) {
            nextConfig.authCookie = captured.cookieHeader;
        }
        if (captured.csrfCookie) {
            nextConfig.csrfCookie = captured.csrfCookie;
        }
        writeConfig(nextConfig);
        const cache = writeWorkoutCache(captured.plans);
        console.log(JSON.stringify({
            message: "Workout programs synced",
            cache: {
                updated_at: cache.updatedAt,
                count: cache.plans.length,
                path: WORKOUT_CACHE_PATH
            }
        }, null, 2));
        return;
    }
    if (action !== "program") {
        throw new Error(`Unknown workout action: ${action}`);
    }
    const programId = positionals[1];
    if (!programId) {
        throw new Error("Missing workout program id.");
    }
    const ensuredToken = await ensureToken();
    const csrfToken = resolveCsrfToken(options, config);
    let responseProgram = await fetchWorkoutProgram(ensuredToken, baseUrl, programId, csrfToken);
    if (autoLogin && isTokenExpiredResponse(responseProgram.json)) {
        token = await loginAndPersist(options, config, "silent");
        responseProgram = await fetchWorkoutProgram(token, baseUrl, programId, csrfToken);
    }
    if (!responseProgram.ok) {
        throw new Error(`HTTP ${responseProgram.status}: ${responseProgram.text}`);
    }
    printResponse(responseProgram, rawOutput);
}
async function main() {
    const { positionals, options } = parseArgs(process.argv.slice(2));
    if (positionals.length === 0 || isFlagEnabled(options, "help")) {
        printUsage();
        return;
    }
    const command = positionals[0];
    const rest = positionals.slice(1);
    switch (command) {
        case "auth":
            await handleAuth(rest, options);
            return;
        case "checkins":
            await handleCheckins(rest, options);
            return;
        case "workout":
            await handleWorkout(rest, options);
            return;
        case "help":
            printUsage();
            return;
        default:
            throw new Error(`Unknown command: ${command}`);
    }
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
});
