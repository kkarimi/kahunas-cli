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
function printUsage() {
    console.log(`kahunas - CLI for Kahunas API\n\nUsage:\n  kahunas auth set <token> [--base-url URL] [--csrf CSRF] [--web-base-url URL] [--cookie COOKIE] [--csrf-cookie VALUE]\n  kahunas auth token [--csrf CSRF] [--cookie COOKIE] [--csrf-cookie VALUE] [--web-base-url URL] [--raw]\n  kahunas auth login [--web-base-url URL] [--headless] [--raw]\n  kahunas auth show\n  kahunas checkins list [--page N] [--rpp N] [--token TOKEN] [--base-url URL] [--raw]\n  kahunas workout program <id> [--csrf CSRF] [--token TOKEN] [--base-url URL] [--raw]\n\nEnv:\n  KAHUNAS_TOKEN=...\n  KAHUNAS_CSRF=...\n  KAHUNAS_CSRF_COOKIE=...\n  KAHUNAS_COOKIE=...\n  KAHUNAS_WEB_BASE_URL=...\n\nConfig:\n  ${CONFIG_PATH}`);
}
function waitForEnter(prompt) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(prompt, () => {
            rl.close();
            resolve();
        });
    });
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
async function requestJson(pathName, token, baseUrl, body, rawOutput) {
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
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }
    if (rawOutput) {
        console.log(text);
        return;
    }
    try {
        const data = JSON.parse(text);
        console.log(JSON.stringify(data, null, 2));
    }
    catch {
        console.log(text);
    }
}
async function requestText(pathName, token, baseUrl, rawOutput) {
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
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }
    if (rawOutput) {
        console.log(text);
        return;
    }
    try {
        const data = JSON.parse(text);
        console.log(JSON.stringify(data, null, 2));
    }
    catch {
        console.log(text);
    }
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
        const webBaseUrl = resolveWebBaseUrl(options, config);
        const headless = isFlagEnabled(options, "headless");
        const rawOutput = isFlagEnabled(options, "raw");
        const playwright = await Promise.resolve().then(() => __importStar(require("playwright")));
        const browser = await playwright.chromium.launch({ headless });
        const context = await browser.newContext();
        let observedToken;
        const recordToken = (candidate) => {
            if (!candidate) {
                return;
            }
            if (observedToken) {
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
            const csrfToken = resolveCsrfToken(options, config) ?? csrfCookie;
            if (!csrfToken) {
                throw new Error("Missing CSRF token after login. Try again or provide --csrf.");
            }
            if (!cookieHeader) {
                throw new Error("Missing cookies after login. Try again.");
            }
            if (!observedToken) {
                const { token: extractedToken, raw } = await fetchAuthToken(csrfToken, cookieHeader, webBaseUrl);
                recordToken(extractedToken);
                if (rawOutput) {
                    console.log(raw);
                    return;
                }
            }
            if (!observedToken) {
                throw new Error("Unable to extract auth token after login.");
            }
            writeConfig({
                ...config,
                token: observedToken,
                csrfToken,
                webBaseUrl
            });
            console.log(observedToken);
        }
        finally {
            await browser.close();
        }
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
    const token = resolveToken(options, config);
    if (!token) {
        throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth set <token>'.");
    }
    const baseUrl = resolveBaseUrl(options, config);
    const page = parseNumber(options.page, 1);
    const rpp = parseNumber(options.rpp, 12);
    const rawOutput = isFlagEnabled(options, "raw");
    await requestJson("/api/v2/checkin/list", token, baseUrl, { page, rpp }, rawOutput);
}
async function handleWorkout(positionals, options) {
    const action = positionals[0];
    if (!action || action === "help") {
        printUsage();
        return;
    }
    if (action !== "program") {
        throw new Error(`Unknown workout action: ${action}`);
    }
    const programId = positionals[1];
    if (!programId) {
        throw new Error("Missing workout program id.");
    }
    const config = readConfig();
    const token = resolveToken(options, config);
    if (!token) {
        throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth set <token>'.");
    }
    const baseUrl = resolveBaseUrl(options, config);
    const csrfToken = resolveCsrfToken(options, config);
    const rawOutput = isFlagEnabled(options, "raw");
    const url = new URL(`/api/v1/workoutprogram/${programId}`, baseUrl);
    if (csrfToken) {
        url.searchParams.set("csrf_kahunas_token", csrfToken);
    }
    await requestText(url.pathname + url.search, token, baseUrl, rawOutput);
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
