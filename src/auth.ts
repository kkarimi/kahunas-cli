import { isFlagEnabled } from "./args";
import type { Config } from "./config";
import { resolveCsrfToken, resolveWebBaseUrl, writeConfig } from "./config";
import { fetchAuthToken } from "./http";
import { extractToken, isLikelyAuthToken } from "./tokens";
import { waitForEnter } from "./utils";
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

export async function captureWorkoutsFromBrowser(
  options: Record<string, string>,
  config: Config
): Promise<BrowserWorkoutCapture> {
  const webBaseUrl = resolveWebBaseUrl(options, config);
  const headless = isFlagEnabled(options, "headless");

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
    if (isLikelyAuthToken(candidate)) {
      observedToken = candidate;
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
    await page.goto(`${webOrigin}/dashboard`, { waitUntil: "domcontentloaded" });

    await waitForEnter("Log in, open your workouts page, then press Enter to capture...");

    const cookies = await context.cookies(webOrigin);
    cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    csrfCookie = cookies.find((cookie) => cookie.name === "csrf_kahunas_cookie_token")?.value;
    csrfToken = csrfCookie ?? resolveCsrfToken(options, config);

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
    const csrfToken = csrfCookie ?? resolveCsrfToken(options, config);

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
  const nextConfig: Config = {
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
    } else {
      console.log(result.token);
    }
  }
  return result.token;
}
