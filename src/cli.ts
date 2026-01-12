#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

const DEFAULT_BASE_URL = "https://api.kahunas.io";
const DEFAULT_WEB_BASE_URL = "https://kahunas.io";
const CONFIG_PATH = path.join(os.homedir(), ".config", "kahunas", "config.json");

type Config = {
  token?: string;
  baseUrl?: string;
  csrfToken?: string;
  webBaseUrl?: string;
  authCookie?: string;
  csrfCookie?: string;
};

type ParsedArgs = {
  positionals: string[];
  options: Record<string, string>;
};

type ApiResponse = {
  ok: boolean;
  status: number;
  text: string;
  json?: unknown;
};

type LoginResult = {
  token: string;
  csrfToken?: string;
  webBaseUrl: string;
  raw?: string;
};

type WorkoutPlan = {
  uuid?: string;
  title?: string;
  updated_at_utc?: number;
  created_at_utc?: number;
  days?: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string> = {};

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

function isFlagEnabled(options: Record<string, string>, name: string): boolean {
  const value = options[name];
  return value === "true" || value === "1" || value === "yes";
}

function shouldAutoLogin(options: Record<string, string>, defaultValue: boolean): boolean {
  if (isFlagEnabled(options, "auto-login")) {
    return true;
  }
  if (isFlagEnabled(options, "no-auto-login")) {
    return false;
  }
  return defaultValue;
}

function isLikelyAuthToken(value: string): boolean {
  if (value.length >= 80) {
    return true;
  }
  if (value.includes(".") && value.split(".").length >= 3) {
    return true;
  }
  return /[+/=]/.test(value) && value.length >= 40;
}

function findTokenInUnknown(value: unknown): string | undefined {
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

function readConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  try {
    return JSON.parse(raw) as Config;
  } catch {
    throw new Error(`Invalid JSON in ${CONFIG_PATH}.`);
  }
}

function writeConfig(config: Config): void {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function resolveToken(options: Record<string, string>, config: Config): string | undefined {
  return options.token ?? process.env.KAHUNAS_TOKEN ?? config.token;
}

function resolveCsrfToken(options: Record<string, string>, config: Config): string | undefined {
  return options.csrf ?? process.env.KAHUNAS_CSRF ?? config.csrfToken;
}

function resolveCsrfCookie(options: Record<string, string>, config: Config): string | undefined {
  return options["csrf-cookie"] ?? process.env.KAHUNAS_CSRF_COOKIE ?? config.csrfCookie;
}

function resolveAuthCookie(options: Record<string, string>, config: Config): string | undefined {
  return options.cookie ?? process.env.KAHUNAS_COOKIE ?? config.authCookie;
}

function resolveBaseUrl(options: Record<string, string>, config: Config): string {
  return options["base-url"] ?? config.baseUrl ?? DEFAULT_BASE_URL;
}

function resolveWebBaseUrl(options: Record<string, string>, config: Config): string {
  return (
    options["web-base-url"] ??
    process.env.KAHUNAS_WEB_BASE_URL ??
    config.webBaseUrl ??
    DEFAULT_WEB_BASE_URL
  );
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function parseJsonText(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function extractWorkoutPlans(payload: unknown): WorkoutPlan[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (!data || typeof data !== "object") {
    return [];
  }
  const workoutPlan = (data as Record<string, unknown>).workout_plan;
  if (!Array.isArray(workoutPlan)) {
    return [];
  }
  return workoutPlan
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const plan = entry as Record<string, unknown>;
      return {
        uuid: typeof plan.uuid === "string" ? plan.uuid : undefined,
        title: typeof plan.title === "string" ? plan.title : undefined,
        updated_at_utc: typeof plan.updated_at_utc === "number" ? plan.updated_at_utc : undefined,
        created_at_utc: typeof plan.created_at_utc === "number" ? plan.created_at_utc : undefined,
        days: typeof plan.days === "number" ? plan.days : undefined
      };
    });
}

function pickLatestWorkout(plans: WorkoutPlan[]): WorkoutPlan {
  const sorted = [...plans].sort((a, b) => {
    const aValue = a.updated_at_utc ?? a.created_at_utc ?? 0;
    const bValue = b.updated_at_utc ?? b.created_at_utc ?? 0;
    return bValue - aValue;
  });
  return sorted[0];
}

function formatWorkoutSummary(plan: WorkoutPlan): string {
  const title = plan.title ?? "Untitled";
  const uuid = plan.uuid ?? "unknown";
  const days = plan.days ? ` - ${plan.days} days` : "";
  return `${title}${days} (${uuid})`;
}

function printResponse(response: ApiResponse, rawOutput: boolean): void {
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

function isTokenExpiredResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const record = payload as Record<string, unknown>;
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

function printUsage(): void {
  console.log(`kahunas - CLI for Kahunas API\n\nUsage:\n  kahunas auth set <token> [--base-url URL] [--csrf CSRF] [--web-base-url URL] [--cookie COOKIE] [--csrf-cookie VALUE]\n  kahunas auth token [--csrf CSRF] [--cookie COOKIE] [--csrf-cookie VALUE] [--web-base-url URL] [--raw]\n  kahunas auth login [--web-base-url URL] [--headless] [--raw]\n  kahunas auth status [--token TOKEN] [--base-url URL] [--auto-login] [--headless]\n  kahunas auth show\n  kahunas checkins list [--page N] [--rpp N] [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n  kahunas workout list [--page N] [--rpp N] [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n  kahunas workout pick [--page N] [--rpp N] [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n  kahunas workout latest [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n  kahunas workout program <id> [--csrf CSRF] [--token TOKEN] [--base-url URL] [--raw] [--no-auto-login] [--headless]\n\nEnv:\n  KAHUNAS_TOKEN=...\n  KAHUNAS_CSRF=...\n  KAHUNAS_CSRF_COOKIE=...\n  KAHUNAS_COOKIE=...\n  KAHUNAS_WEB_BASE_URL=...\n\nConfig:\n  ${CONFIG_PATH}`);
}

function askQuestion(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function waitForEnter(prompt: string): Promise<void> {
  return askQuestion(prompt).then(() => undefined);
}

function extractToken(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return findTokenInUnknown(parsed);
  } catch {
    const trimmed = text.trim();
    return trimmed ? trimmed : undefined;
  }
}

async function postJson(
  pathName: string,
  token: string,
  baseUrl: string,
  body: Record<string, unknown>
): Promise<ApiResponse> {
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

async function getWithAuth(pathName: string, token: string, baseUrl: string): Promise<ApiResponse> {
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

async function fetchWorkoutProgram(
  token: string,
  baseUrl: string,
  programId: string,
  csrfToken?: string
): Promise<ApiResponse> {
  const url = new URL(`/api/v1/workoutprogram/${programId}`, baseUrl);
  if (csrfToken) {
    url.searchParams.set("csrf_kahunas_token", csrfToken);
  }
  return getWithAuth(url.pathname + url.search, token, baseUrl);
}

async function fetchAuthToken(
  csrfToken: string,
  cookieHeader: string,
  webBaseUrl: string
): Promise<{ token?: string; raw: string }> {
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

async function loginWithBrowser(
  options: Record<string, string>,
  config: Config
): Promise<LoginResult> {
  const webBaseUrl = resolveWebBaseUrl(options, config);
  const headless = isFlagEnabled(options, "headless");

  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless });
  const context = await browser.newContext();
  let observedToken: string | undefined;
  const recordToken = (candidate: string | undefined): void => {
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
    const csrfToken = resolveCsrfToken(options, config) ?? csrfCookie;

    let raw: string | undefined;
    if (!observedToken) {
      if (!csrfToken) {
        throw new Error("Missing CSRF token after login. Try again or provide --csrf.");
      }
      if (!cookieHeader) {
        throw new Error("Missing cookies after login. Try again.");
      }
      const { token: extractedToken, raw: fetchedRaw } = await fetchAuthToken(
        csrfToken,
        cookieHeader,
        webBaseUrl
      );
      recordToken(extractedToken);
      raw = fetchedRaw;
    }

    if (!observedToken) {
      throw new Error("Unable to extract auth token after login.");
    }

    return { token: observedToken, csrfToken, webBaseUrl, raw };
  } finally {
    await browser.close();
  }
}

async function loginAndPersist(
  options: Record<string, string>,
  config: Config,
  outputMode: "silent" | "token" | "raw"
): Promise<string> {
  const result = await loginWithBrowser(options, config);
  const nextConfig: Config = {
    ...config,
    token: result.token,
    webBaseUrl: result.webBaseUrl
  };
  if (result.csrfToken) {
    nextConfig.csrfToken = result.csrfToken;
  }
  writeConfig(nextConfig);
  if (outputMode !== "silent") {
    if (outputMode === "raw") {
      console.log(result.raw ?? result.token);
    } else {
      console.log(result.token);
    }
  }
  return result.token;
}

async function handleAuth(positionals: string[], options: Record<string, string>): Promise<void> {
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
    const { token: extractedToken, raw } = await fetchAuthToken(
      csrfToken,
      cookieHeader,
      webBaseUrl
    );
    const token = extractedToken && isLikelyAuthToken(extractedToken) ? extractedToken : undefined;

    if (rawOutput) {
      console.log(raw);
      return;
    }

    if (!token) {
      console.log(raw);
      return;
    }

    const nextConfig: Config = {
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
      } else {
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

async function handleCheckins(positionals: string[], options: Record<string, string>): Promise<void> {
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
    } else {
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

  printResponse(response, rawOutput);
}

async function handleWorkout(positionals: string[], options: Record<string, string>): Promise<void> {
  const action = positionals[0];
  if (!action || action === "help") {
    printUsage();
    return;
  }

  const config = readConfig();
  const autoLogin = shouldAutoLogin(options, true);
  let token = resolveToken(options, config);
  if (!token) {
    if (autoLogin) {
      token = await loginAndPersist(options, config, "silent");
    } else {
      throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth login'.");
    }
  }

  const baseUrl = resolveBaseUrl(options, config);
  const rawOutput = isFlagEnabled(options, "raw");
  const page = parseNumber(options.page, 1);
  const rpp = parseNumber(options.rpp, 12);
  const listRpp = action === "latest" && options.rpp === undefined ? 100 : rpp;

  const fetchList = async (): Promise<{ response: ApiResponse; plans: WorkoutPlan[] }> => {
    const url = new URL("/api/v1/workoutprogram", baseUrl);
    if (page) {
      url.searchParams.set("page", String(page));
    }
    if (listRpp) {
      url.searchParams.set("rpp", String(listRpp));
    }

    let response = await getWithAuth(url.pathname + url.search, token!, baseUrl);
    if (autoLogin && isTokenExpiredResponse(response.json)) {
      token = await loginAndPersist(options, config, "silent");
      response = await getWithAuth(url.pathname + url.search, token, baseUrl);
    }

    return { response, plans: extractWorkoutPlans(response.json) };
  };

  if (action === "list") {
    const { response } = await fetchList();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.text}`);
    }
    printResponse(response, rawOutput);
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
    let responseProgram = await fetchWorkoutProgram(token, baseUrl, chosen.uuid, csrfToken);
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
    let responseProgram = await fetchWorkoutProgram(token, baseUrl, chosen.uuid, csrfToken);
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

  if (action !== "program") {
    throw new Error(`Unknown workout action: ${action}`);
  }

  const programId = positionals[1];
  if (!programId) {
    throw new Error("Missing workout program id.");
  }

  const csrfToken = resolveCsrfToken(options, config);
  let responseProgram = await fetchWorkoutProgram(token, baseUrl, programId, csrfToken);
  if (autoLogin && isTokenExpiredResponse(responseProgram.json)) {
    token = await loginAndPersist(options, config, "silent");
    responseProgram = await fetchWorkoutProgram(token, baseUrl, programId, csrfToken);
  }

  if (!responseProgram.ok) {
    throw new Error(`HTTP ${responseProgram.status}: ${responseProgram.text}`);
  }

  printResponse(responseProgram, rawOutput);
}

async function main(): Promise<void> {
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
