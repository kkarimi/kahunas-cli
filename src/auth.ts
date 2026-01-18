import type { Page } from "playwright";
import type { AuthConfig, Config } from "./config";
import { AUTH_PATH, readAuthConfig, resolveCsrfToken, resolveWebBaseUrl, writeConfig } from "./config";
import { fetchAuthToken } from "./http";
import { extractToken, isLikelyAuthToken, resolveTokenExpiry } from "./tokens";
import { debugLog, waitForEnter } from "./utils";
import { extractWorkoutPlans, type WorkoutPlan } from "./workouts";

type LoginResult = {
  token: string;
  csrfToken?: string;
  webBaseUrl: string;
  raw?: string;
  cookieHeader?: string;
  csrfCookie?: string;
};

type BrowserWorkoutCapture = {
  plans: WorkoutPlan[];
  token?: string;
  csrfToken?: string;
  webBaseUrl: string;
  cookieHeader?: string;
  csrfCookie?: string;
};

type StoredAuth = {
  login: string;
  password: string;
  loginPath?: string;
};

const LOGIN_SELECTORS = {
  username: [
    "input[name=\"email\"]",
    "input[id=\"email\"]",
    "input[type=\"email\"]",
    "input[autocomplete=\"email\"]",
    "input[autocomplete=\"username\"]",
    "input[name=\"username\"]",
    "input[id=\"username\"]",
    "input[placeholder*=\"email\" i]",
    "input[placeholder*=\"username\" i]",
    "input[type=\"text\"]"
  ],
  password: [
    "input[name=\"password\"]",
    "input[id=\"password\"]",
    "input[type=\"password\"]",
    "input[autocomplete=\"current-password\"]"
  ],
  submit: [
    "button[type=\"submit\"]",
    "input[type=\"submit\"]",
    "button:has-text(\"Log in\")",
    "button:has-text(\"Login\")",
    "button:has-text(\"Sign in\")",
    "button:has-text(\"Continue\")"
  ]
};

const PASSWORD_SELECTOR = LOGIN_SELECTORS.password.join(", ");
const WORKOUT_NAV_SELECTORS = [
  "#client-workout_plan-view-button",
  ".select-client-action[data-action=\"workout_program\"]",
  "[data-action=\"workout_program\"]"
];
const WORKOUT_NAV_QUERY_SELECTORS = [
  "#client-workout_plan-view-button",
  ".select-client-action[data-action=\"workout_program\"]",
  "[data-action=\"workout_program\"]",
  "a.nav-link",
  "button"
];

function normalizePath(pathname: string): string {
  if (pathname.startsWith("/")) {
    return pathname;
  }
  return `/${pathname}`;
}

function normalizeToken(token: string): string {
  const trimmed = token.trim();
  const withoutQuotes = trimmed.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  return withoutQuotes.replace(/^bearer\s+/i, "");
}

function resolveStoredAuth(override?: AuthConfig): StoredAuth | undefined {
  const auth = override ?? readAuthConfig();
  if (!auth) {
    return undefined;
  }
  const login = auth.username ?? auth.email;
  if (!login || !auth.password) {
    throw new Error(
      `Invalid auth.json at ${AUTH_PATH}. Expected \"username\" or \"email\" and \"password\".`
    );
  }
  return {
    login,
    password: auth.password,
    loginPath: auth.loginPath
  };
}

async function isSelectorVisible(page: Page, selector: string): Promise<boolean> {
  try {
    return await page.isVisible(selector);
  } catch {
    return false;
  }
}

async function findVisibleSelector(page: Page, selectors: string[]): Promise<string | undefined> {
  for (const selector of selectors) {
    if (await isSelectorVisible(page, selector)) {
      return selector;
    }
  }
  return undefined;
}

async function waitForAnyVisibleSelector(
  page: Page,
  selectors: string[],
  timeoutMs: number
): Promise<boolean> {
  const combined = selectors.join(", ");
  try {
    await page.waitForSelector(combined, { state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function waitForAnySelectorMatch(
  page: Page,
  selectors: string[],
  timeoutMs: number
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const selector of selectors) {
      if (await page.$(selector)) {
        return true;
      }
    }
    await page.waitForTimeout(300);
  }
  return false;
}

async function waitForPasswordFieldGone(page: Page, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!(await isSelectorVisible(page, PASSWORD_SELECTOR))) {
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function attemptAutoLogin(
  page: Page,
  auth: StoredAuth,
  debug: boolean
): Promise<boolean> {
  const hasLoginForm = await waitForAnyVisibleSelector(page, LOGIN_SELECTORS.password, 5000);
  if (!hasLoginForm) {
    debugLog(debug, "Login form not detected; skipping auto-login.");
    return false;
  }

  const usernameSelector = await findVisibleSelector(page, LOGIN_SELECTORS.username);
  const passwordSelector = await findVisibleSelector(page, LOGIN_SELECTORS.password);
  if (!passwordSelector) {
    return false;
  }

  if (usernameSelector) {
    await page.fill(usernameSelector, auth.login);
  }
  await page.fill(passwordSelector, auth.password);

  const submitSelector = await findVisibleSelector(page, LOGIN_SELECTORS.submit);
  if (submitSelector) {
    await page.click(submitSelector);
  } else {
    await page.press(passwordSelector, "Enter");
  }

  await page.waitForTimeout(1500);
  debugLog(debug, "Submitted login form.");
  return true;
}

async function waitForPlans(plans: WorkoutPlan[], timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (plans.length > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return plans.length > 0;
}

async function clickWorkoutNav(page: Page, debug: boolean): Promise<boolean> {
  for (const selector of WORKOUT_NAV_SELECTORS) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }
    try {
      await locator.scrollIntoViewIfNeeded();
    } catch {
      // Best-effort only.
    }
    try {
      await locator.click({ timeout: 2000, force: true });
      debugLog(debug, `Clicked workout nav selector: ${selector}`);
      return true;
    } catch {
      // Try next selector.
    }
  }

  try {
    return await page.evaluate((selectors) => {
      const resolveCandidates = (sel: string): HTMLElement[] =>
        Array.from(document.querySelectorAll(sel)).filter(
          (node): node is HTMLElement => node instanceof HTMLElement
        );
      const candidates = selectors.flatMap(resolveCandidates);
      const byAction = candidates.find(
        (node) => node.dataset.action === "workout_program"
      );
      const byText = candidates.find((node) =>
        /workout/i.test(node.textContent ?? "")
      );
      const target = byAction ?? byText;
      if (!target) {
        return false;
      }
      target.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
      );
      target.click();
      return true;
    }, WORKOUT_NAV_QUERY_SELECTORS);
  } catch {
    return false;
  }
}

async function triggerWorkoutCapture(
  page: Page,
  webOrigin: string,
  plans: WorkoutPlan[],
  debug: boolean
): Promise<boolean> {
  if (plans.length > 0) {
    return true;
  }
  const hasWorkoutNav = await waitForAnySelectorMatch(page, WORKOUT_NAV_SELECTORS, 12000);
  if (!hasWorkoutNav) {
    debugLog(debug, "Workout nav not detected.");
    return false;
  }
  const clicked = await clickWorkoutNav(page, debug);
  if (!clicked) {
    debugLog(debug, "Workout nav click failed.");
  }
  await page.waitForTimeout(1000);
  await waitForPlans(plans, 8000);
  debugLog(debug, `Workout capture plans=${plans.length}`);
  return plans.length > 0;
}

export async function captureWorkoutsFromBrowser(
  options: Record<string, string>,
  config: Config,
  authOverride?: AuthConfig
): Promise<BrowserWorkoutCapture> {
  const webBaseUrl = resolveWebBaseUrl(options, config);
  const headless = config.headless ?? true;
  const debug = config.debug === true;
  const storedAuth = resolveStoredAuth(authOverride);

  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless });
  const context = await browser.newContext();
  const plans: WorkoutPlan[] = [];
  const seen = new Set<string>();
  let observedToken: string | undefined;

  const recordToken = (candidate: string | undefined): void => {
    if (!candidate || observedToken) {
      return;
    }
    const normalized = normalizeToken(candidate);
    if (isLikelyAuthToken(normalized)) {
      observedToken = normalized;
    }
  };

  const recordPlans = (incoming: WorkoutPlan[]): void => {
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
      const data = (await response.json()) as unknown;
      const extracted = extractWorkoutPlans(data);
      if (extracted.length > 0) {
        recordPlans(extracted);
      }
    } catch {
      // Ignore responses that are not JSON.
    }
  });

  let csrfToken: string | undefined;
  let cookieHeader: string | undefined;
  let csrfCookie: string | undefined;

  try {
    const page = await context.newPage();
    const webOrigin = new URL(webBaseUrl).origin;
    const startPath = storedAuth?.loginPath ? normalizePath(storedAuth.loginPath) : "/dashboard";
    await page.goto(new URL(startPath, webOrigin).toString(), { waitUntil: "domcontentloaded" });
    debugLog(debug, `Opened ${startPath}`);

    if (storedAuth) {
      debugLog(debug, "auth.json detected; attempting auto-login.");
      const attempted = await attemptAutoLogin(page, storedAuth, debug);
      if (attempted) {
        await waitForPasswordFieldGone(page, 15000);
      }
      const captured = await triggerWorkoutCapture(page, webOrigin, plans, debug);
      if (!captured) {
        await waitForEnter("Log in, open your workouts page, then press Enter to capture...");
      }
    } else {
      await waitForEnter("Log in, open your workouts page, then press Enter to capture...");
    }

    const cookies = await context.cookies(webOrigin);
    cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    csrfCookie = cookies.find((cookie) => cookie.name === "csrf_kahunas_cookie_token")?.value;
    csrfToken = csrfCookie ?? resolveCsrfToken(options, config);

    if (!observedToken && csrfToken && cookieHeader) {
      try {
        const { token: fetchedToken } = await fetchAuthToken(csrfToken, cookieHeader, webBaseUrl);
        recordToken(fetchedToken);
        debugLog(debug, "Fetched auth token via /get-token.");
      } catch (error) {
        debugLog(
          debug,
          `Failed to fetch auth token via /get-token: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    }

    if (plans.length === 0) {
      await page.waitForTimeout(1500);
    }
  } finally {
    await browser.close();
  }

  return { plans, token: observedToken, csrfToken, webBaseUrl, cookieHeader, csrfCookie };
}

export async function loginWithBrowser(
  options: Record<string, string>,
  config: Config
): Promise<LoginResult> {
  const webBaseUrl = resolveWebBaseUrl(options, config);
  const headless = config.headless ?? true;
  const debug = config.debug === true;
  const storedAuth = resolveStoredAuth();

  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless });
  const context = await browser.newContext();
  let observedToken: string | undefined;
  const recordToken = (candidate: string | undefined): void => {
    if (!candidate || observedToken) {
      return;
    }
    const normalized = normalizeToken(candidate);
    if (isLikelyAuthToken(normalized)) {
      observedToken = normalized;
    }
  };

  context.on("request", (request) => {
    const headers = request.headers();
    recordToken(headers["auth-user-token"]);
  });

  try {
    const page = await context.newPage();
    const webOrigin = new URL(webBaseUrl).origin;
    const startPath = storedAuth?.loginPath ? normalizePath(storedAuth.loginPath) : "/dashboard";
    await page.goto(new URL(startPath, webOrigin).toString(), { waitUntil: "domcontentloaded" });
    debugLog(debug, `Opened ${startPath}`);

    if (storedAuth) {
      debugLog(debug, "auth.json detected; attempting auto-login.");
      const attempted = await attemptAutoLogin(page, storedAuth, debug);
      if (attempted) {
        const settled = await waitForPasswordFieldGone(page, 15000);
        if (!settled) {
          await waitForEnter("Finish logging in, then press Enter to continue...");
        }
      }
    } else {
      await waitForEnter("Finish logging in, then press Enter to continue...");
    }

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

    let raw: string | undefined;
    if (!observedToken) {
      if (!csrfToken) {
        throw new Error("Missing CSRF token after login. Try again or run 'kahunas workout sync'.");
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

    return { token: observedToken, csrfToken, webBaseUrl, raw, cookieHeader, csrfCookie };
  } finally {
    await browser.close();
  }
}

export async function loginAndPersist(
  options: Record<string, string>,
  config: Config,
  outputMode: "silent" | "token" | "raw"
): Promise<string> {
  const result = await loginWithBrowser(options, config);
  const tokenUpdatedAt = new Date().toISOString();
  const tokenExpiresAt = resolveTokenExpiry(result.token, tokenUpdatedAt) ?? null;
  const nextConfig: Config = {
    ...config,
    token: result.token,
    webBaseUrl: result.webBaseUrl,
    tokenUpdatedAt,
    tokenExpiresAt
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
    } else {
      console.log(result.token);
    }
  }
  return result.token;
}
