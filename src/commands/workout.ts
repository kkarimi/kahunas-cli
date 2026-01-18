import { createServer } from "node:http";
import { isFlagEnabled } from "../args";
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
  CONFIG_PATH,
  WORKOUT_CACHE_PATH
} from "../config";
import {
  filterWorkoutEvents,
  formatWorkoutEventsOutput,
  enrichWorkoutEvents,
  findWorkoutPreviewHtmlMatch,
  resolveWorkoutEventDayIndex,
  sortWorkoutEvents,
  summarizeWorkoutProgramDays,
  type WorkoutEvent
} from "../events";
import { fetchWorkoutProgram, getWithAuth, parseJsonText, postJson } from "../http";
import { printResponse } from "../output";
import { extractUserUuidFromCheckins, isTokenExpiredResponse } from "../responses";
import { isLikelyLoginHtml } from "../tokens";
import { askQuestion } from "../utils";
import {
  buildWorkoutPlanIndex,
  extractWorkoutPlans,
  formatWorkoutSummary,
  mergeWorkoutPlans,
  pickLatestWorkout,
  type WorkoutPlan
} from "../workouts";
import { captureWorkoutsFromBrowser, loginAndPersist } from "../auth";
import { renderWorkoutPage } from "../server/workout-view";
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
  const autoLogin = true;
  let token = resolveToken(options, config);
  const ensureToken = async (): Promise<string> => {
    if (!token) {
      if (autoLogin) {
        token = await loginAndPersist(options, config, "silent");
      } else {
        throw new Error(
          "Missing auth token. Run 'kahunas workout sync' to refresh login, then try again."
        );
      }
    }
    return token;
  };
  let webLoginInFlight: Promise<void> | null = null;
  const ensureWebLogin = async (): Promise<void> => {
    if (!autoLogin) {
      return;
    }
    if (!webLoginInFlight) {
      webLoginInFlight = loginAndPersist(options, config, "silent")
        .then(() => undefined)
        .finally(() => {
          webLoginInFlight = null;
        });
    }
    await webLoginInFlight;
  };

  const baseUrl = resolveBaseUrl(options, config);
  const rawOutput = isFlagEnabled(options, "raw");
  const page = 1;
  const rpp = 12;
  const listRpp = action === "latest" ? 100 : rpp;

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

  const fetchWorkoutEventsPayload = async (): Promise<{
    text: string;
    payload: unknown;
    timezone: string;
  }> => {
    const baseWebUrl = resolveWebBaseUrl(options, config);
    const webOrigin = new URL(baseWebUrl).origin;
    const timezone =
      process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/London";
    let userUuid = resolveUserUuid(options, config);
    if (!userUuid) {
      try {
        await ensureToken();
        let checkinsResponse = await postJson("/api/v2/checkin/list", token!, baseUrl, {
          page: 1,
          rpp: 1
        });
        if (autoLogin && isTokenExpiredResponse(checkinsResponse.json)) {
          token = await loginAndPersist(options, config, "silent");
          checkinsResponse = await postJson("/api/v2/checkin/list", token, baseUrl, {
            page: 1,
            rpp: 1
          });
        }
        if (checkinsResponse.ok) {
          const extracted = extractUserUuidFromCheckins(checkinsResponse.json);
          if (extracted) {
            userUuid = extracted;
            if (userUuid !== config.userUuid) {
              writeConfig({ ...config, userUuid });
            }
          }
        }
      } catch {
        // Best-effort discovery only.
      }
    }
    if (!userUuid) {
      throw new Error(
        "Missing user uuid. Run 'kahunas checkins list' or 'kahunas workout sync' once."
      );
    }
    if (userUuid !== config.userUuid) {
      writeConfig({ ...config, userUuid });
    }

    let csrfToken = resolveCsrfToken(options, config);
    let csrfCookie = resolveCsrfCookie(options, config);
    let authCookie = resolveAuthCookie(options, config);
    let effectiveCsrfToken = csrfCookie ?? csrfToken;
    let cookieHeader =
      authCookie ??
      (effectiveCsrfToken ? `csrf_kahunas_cookie_token=${effectiveCsrfToken}` : undefined);

    if ((!csrfToken || !cookieHeader || !authCookie) && autoLogin) {
      await ensureWebLogin();
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
      throw new Error("Missing CSRF token. Run 'kahunas workout sync' and try again.");
    }
    if (!cookieHeader) {
      throw new Error("Missing cookies. Run 'kahunas workout sync' and try again.");
    }

    const url = new URL(`/coach/clients/calendar/getEvent/${userUuid}`, webOrigin);
    url.searchParams.set("timezone", timezone);

    const body = new URLSearchParams();
    body.set("csrf_kahunas_token", effectiveCsrfToken);
    body.set("filter", "");

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
      await ensureWebLogin();
      const refreshed = readConfig();
      csrfToken = resolveCsrfToken(options, refreshed);
      csrfCookie = resolveCsrfCookie(options, refreshed);
      authCookie = resolveAuthCookie(options, refreshed);
      effectiveCsrfToken = csrfCookie ?? csrfToken;
      cookieHeader =
        authCookie ??
        (effectiveCsrfToken ? `csrf_kahunas_cookie_token=${effectiveCsrfToken}` : undefined);
      if (!effectiveCsrfToken || !cookieHeader) {
        throw new Error("Login required. Run 'kahunas workout sync' and try again.");
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

    const payload = parseJsonText(text);
    return { text, payload, timezone };
  };

  const buildProgramDetails = async (
    events: WorkoutEvent[]
  ): Promise<Record<string, unknown>> => {
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

    const refreshed = readConfig();
    const csrfToken = resolveCsrfToken(options, refreshed);
    const csrfCookie = resolveCsrfCookie(options, refreshed);
    const effectiveCsrfToken = csrfCookie ?? csrfToken;

    const programDetails: Record<string, unknown> = {};
    const programIds = Array.from(
      new Set(
        events
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

    return programDetails;
  };

  const resolveSelectedDayIndex = (
    days: ReturnType<typeof summarizeWorkoutProgramDays>,
    eventDayIndex: number | undefined,
    eventDayLabel: string | undefined,
    dayParam: string | null
  ): number | undefined => {
    const parseOptionalInt = (value: string | null): number | undefined => {
      if (!value) {
        return undefined;
      }
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const normalize = (value: string): string => value.trim().toLowerCase();

    const paramIndex = parseOptionalInt(dayParam);
    if (paramIndex !== undefined && days[paramIndex]) {
      return paramIndex;
    }
    if (eventDayIndex !== undefined) {
      const matchIndex = days.findIndex((day) => day.day_index === eventDayIndex);
      if (matchIndex >= 0) {
        return matchIndex;
      }
    }
    if (eventDayLabel) {
      const normalized = normalize(eventDayLabel);
      const matchIndex = days.findIndex((day) =>
        day.day_label ? normalize(day.day_label).includes(normalized) : false
      );
      if (matchIndex >= 0) {
        return matchIndex;
      }
    }
    if (days.length > 0) {
      return 0;
    }
    return undefined;
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
    const minimal = isFlagEnabled(options, "minimal");
    const full = isFlagEnabled(options, "full");
    const debugPreview = isFlagEnabled(options, "debug-preview");
    const limit = 1;

    const { text, payload, timezone } = await fetchWorkoutEventsPayload();
    if (rawOutput) {
      console.log(text);
      return;
    }
    if (!Array.isArray(payload)) {
      console.log(text);
      return;
    }

    const filtered = filterWorkoutEvents(payload);
    const sorted = sortWorkoutEvents(filtered);
    const limited = limit > 0 ? sorted.slice(-limit) : sorted;

    if (minimal) {
      console.log(JSON.stringify(limited, null, 2));
      return;
    }

    const programDetails = await buildProgramDetails(sorted);

    if (debugPreview) {
      for (const entry of limited) {
        const record = entry as Record<string, unknown>;
        const eventId =
          typeof record.id === "string" || typeof record.id === "number" ? record.id : "unknown";
        const programUuid = typeof record.program === "string" ? record.program : undefined;
        const program = programUuid ? programDetails[programUuid] : undefined;
        const match =
          findWorkoutPreviewHtmlMatch(record) ??
          (program ? findWorkoutPreviewHtmlMatch(program) : undefined);
        const dayIndex = resolveWorkoutEventDayIndex(entry, program);
        const source = match ? match.source : "not_found";
        console.error(
          `debug-preview event=${eventId} program=${programUuid ?? "unknown"} day_index=${
            dayIndex ?? "none"
          } source=${source}`
        );
      }
    }

    if (full) {
      const enriched = enrichWorkoutEvents(limited, programDetails);
      console.log(JSON.stringify(enriched, null, 2));
      return;
    }

    const formatted = formatWorkoutEventsOutput(limited, programDetails, {
      timezone,
      program: undefined,
      workout: undefined
    });
    console.log(JSON.stringify(formatted, null, 2));
    return;
  }

  if (action === "serve") {
    const host = "127.0.0.1";
    const port = 3000;
    const limit = 1;
    const cacheTtlMs = 30_000;

    const loadSummary = async (): Promise<{
      formatted: ReturnType<typeof formatWorkoutEventsOutput>;
      days: ReturnType<typeof summarizeWorkoutProgramDays>;
      summary?: ReturnType<typeof formatWorkoutEventsOutput>["events"][number];
      timezone: string;
    }> => {
      const { text, payload, timezone } = await fetchWorkoutEventsPayload();
      if (!Array.isArray(payload)) {
        throw new Error(`Unexpected calendar response: ${text.slice(0, 200)}`);
      }
      const filtered = filterWorkoutEvents(payload);
      const sorted = sortWorkoutEvents(filtered);
      const bounded = limit > 0 ? sorted.slice(-limit) : sorted;
      const programDetails = await buildProgramDetails(sorted);
      const formatted = formatWorkoutEventsOutput(bounded, programDetails, {
        timezone,
        program: undefined,
        workout: undefined
      });
      const summary = formatted.events[0];
      const programUuid =
        summary?.program?.uuid ??
        (bounded[0] && typeof bounded[0] === "object"
          ? ((bounded[0] as Record<string, unknown>).program as string | undefined)
          : undefined);
      const program = programUuid ? programDetails[programUuid] : undefined;
      const days = summarizeWorkoutProgramDays(program);
      return { formatted, days, summary, timezone };
    };

    let cached:
      | {
          data: Awaited<ReturnType<typeof loadSummary>>;
          fetchedAt: number;
        }
      | undefined;
    let summaryInFlight: Promise<Awaited<ReturnType<typeof loadSummary>>> | null = null;

    const getSummary = async (forceRefresh: boolean): Promise<Awaited<ReturnType<typeof loadSummary>>> => {
      if (!forceRefresh && cached && Date.now() - cached.fetchedAt < cacheTtlMs) {
        return cached.data;
      }
      if (!forceRefresh && summaryInFlight) {
        return summaryInFlight;
      }
      const pending = loadSummary().finally(() => {
        summaryInFlight = null;
      });
      summaryInFlight = pending;
      const data = await pending;
      cached = { data, fetchedAt: Date.now() };
      return data;
    };

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://${host}:${port}`);
        const wantsRefresh = url.searchParams.get("refresh") === "1";

        if (url.pathname === "/api/workout") {
          const data = await getSummary(wantsRefresh);
          res.statusCode = 200;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(data.formatted, null, 2));
          return;
        }

        if (url.pathname === "/favicon.ico") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (url.pathname !== "/") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        const data = await getSummary(wantsRefresh);
        const dayParam = url.searchParams.get("day");
        const selectedDayIndex = resolveSelectedDayIndex(
          data.days,
          data.summary?.workout_day?.day_index,
          data.summary?.workout_day?.day_label,
          dayParam
        );
        const html = renderWorkoutPage({
          summary: data.summary,
          days: data.days,
          selectedDayIndex,
          timezone: data.timezone,
          apiPath: "/api/workout",
          refreshPath: "/?refresh=1",
          isLatest: limit === 1
        });
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(html);
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(error instanceof Error ? error.message : "Server error");
      }
    });

    server.listen(port, host, () => {
      console.log(`Local workout server running at http://${host}:${port}`);
      console.log(`JSON endpoint at http://${host}:${port}/api/workout`);
      console.log(`Config: ${CONFIG_PATH}`);
    });
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
