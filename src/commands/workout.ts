import { isFlagEnabled, shouldAutoLogin } from "../args";
import {
  readConfig,
  readWorkoutCache,
  resolveAuthCookie,
  resolveBaseUrl,
  resolveCsrfCookie,
  resolveCsrfToken,
  resolveToken,
  resolveUserUuid,
  resolveWebBaseUrl,
  writeConfig,
  writeWorkoutCache,
  WORKOUT_CACHE_PATH
} from "../config";
import { filterWorkoutEvents, enrichWorkoutEvents, sortWorkoutEvents } from "../events";
import { fetchWorkoutProgram, getWithAuth, parseJsonText } from "../http";
import { printResponse } from "../output";
import { isTokenExpiredResponse } from "../responses";
import { isLikelyLoginHtml } from "../tokens";
import { askQuestion, parseNumber } from "../utils";
import {
  buildWorkoutPlanIndex,
  extractWorkoutPlans,
  formatWorkoutSummary,
  mergeWorkoutPlans,
  pickLatestWorkout,
  type WorkoutPlan
} from "../workouts";
import { captureWorkoutsFromBrowser, loginAndPersist } from "../auth";
import { printUsage } from "../usage";

export async function handleWorkout(
  positionals: string[],
  options: Record<string, string>
): Promise<void> {
  const action = positionals[0];
  if (!action || action === "help") {
    printUsage();
    return;
  }

  const config = readConfig();
  const autoLogin = shouldAutoLogin(options, true);
  let token = resolveToken(options, config);
  const ensureToken = async (): Promise<string> => {
    if (!token) {
      if (autoLogin) {
        token = await loginAndPersist(options, config, "silent");
      } else {
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

  const fetchList = async (): Promise<{
    response: { ok: boolean; status: number; text: string; json?: unknown };
    plans: WorkoutPlan[];
    cache?: { updatedAt: string; plans: WorkoutPlan[] };
  }> => {
    await ensureToken();
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
    const timezone =
      options.timezone ??
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
    let cookieHeader =
      authCookie ??
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

    const filtered = filterWorkoutEvents(payload, options.program, options.workout);
    const sorted = sortWorkoutEvents(filtered);

    if (minimal) {
      console.log(JSON.stringify(sorted, null, 2));
      return;
    }

    let programIndex: Record<string, WorkoutPlan> | undefined;
    const cache = readWorkoutCache();
    let plans = cache?.plans ?? [];
    try {
      await ensureToken();
      const listUrl = new URL("/api/v1/workoutprogram", baseUrl);
      listUrl.searchParams.set("page", "1");
      listUrl.searchParams.set("rpp", "100");
      let listResponse = await getWithAuth(listUrl.pathname + listUrl.search, token!, baseUrl);
      if (autoLogin && isTokenExpiredResponse(listResponse.json)) {
        token = await loginAndPersist(options, config, "silent");
        listResponse = await getWithAuth(listUrl.pathname + listUrl.search, token, baseUrl);
      }
      if (listResponse.ok) {
        const fromApi = extractWorkoutPlans(listResponse.json);
        plans = mergeWorkoutPlans(fromApi, plans);
      }
    } catch {
      // Best-effort enrichment only.
    }
    if (plans.length > 0) {
      programIndex = buildWorkoutPlanIndex(plans);
    }

    const programDetails: Record<string, unknown> = {};
    const programIds = Array.from(
      new Set(
        sorted
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return undefined;
            }
            const record = entry as Record<string, unknown>;
            return typeof record.program === "string" ? record.program : undefined;
          })
          .filter((value): value is string => Boolean(value))
      )
    );

    for (const programId of programIds) {
      try {
        await ensureToken();
        let responseProgram = await fetchWorkoutProgram(
          token!,
          baseUrl,
          programId,
          effectiveCsrfToken
        );
        if (autoLogin && isTokenExpiredResponse(responseProgram.json)) {
          token = await loginAndPersist(options, config, "silent");
          responseProgram = await fetchWorkoutProgram(
            token,
            baseUrl,
            programId,
            effectiveCsrfToken
          );
        }
        if (responseProgram.ok && responseProgram.json && typeof responseProgram.json === "object") {
          const programPayload = responseProgram.json as Record<string, unknown>;
          const data = programPayload.data;
          if (data && typeof data === "object") {
            const plan = (data as Record<string, unknown>).workout_plan;
            if (plan) {
              programDetails[programId] = plan;
              continue;
            }
          }
          programDetails[programId] = programPayload;
          continue;
        }
      } catch {
        // Ignore fetch failures and fall back to cached index.
      }
      programDetails[programId] = programIndex?.[programId] ?? null;
    }

    const enriched = enrichWorkoutEvents(sorted, programDetails);
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
    console.log(
      JSON.stringify(
        {
          message: "Workout programs synced",
          cache: {
            updated_at: cache.updatedAt,
            count: cache.plans.length,
            path: WORKOUT_CACHE_PATH
          }
        },
        null,
        2
      )
    );
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
