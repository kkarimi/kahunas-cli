import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isFlagEnabled } from "../args";
import type { AuthConfig, WorkoutEventsCache } from "../config";
import {
  readConfig,
  readAuthConfig,
  readWorkoutCache,
  resolveAuthCookie,
  resolveBaseUrl,
  resolveCsrfCookie,
  resolveCsrfToken,
  resolveToken,
  resolveUserUuid,
  resolveWebBaseUrl,
  writeConfig,
  writeAuthConfig,
  writeWorkoutCache,
  AUTH_PATH,
  CONFIG_PATH,
  WORKOUT_CACHE_PATH,
} from "../config";
import { fetchCalendarEvents, resolveCalendarTimezone } from "../calendar";
import {
  readCalendarCache,
  readProgramCaches,
  writeCalendarCache,
  writeProgramCache,
} from "../cache";
import {
  filterWorkoutEvents,
  formatWorkoutEventsOutput,
  annotateWorkoutEventSummaries,
  enrichWorkoutEvents,
  findWorkoutPreviewHtmlMatch,
  resolveWorkoutEventDayIndex,
  sortWorkoutEvents,
  summarizeWorkoutProgramDays,
  type WorkoutEvent,
} from "../events";
import { fetchWorkoutProgram, getWithAuth, postJson } from "../http";
import { formatHeading, logInfo, logPlain } from "../logger";
import { printResponse } from "../output";
import { extractUserUuidFromCheckins, isTokenExpiredResponse } from "../responses";
import { isLikelyLoginHtml, resolveTokenExpiry } from "../tokens";
import { askHiddenQuestion, askQuestion, debugLog } from "../utils";
import {
  buildWorkoutPlanIndex,
  extractWorkoutPlans,
  formatWorkoutSummary,
  mergeWorkoutPlans,
  pickLatestWorkout,
  type WorkoutPlan,
} from "../workouts";
import { captureWorkoutsFromBrowser, loginAndPersist } from "../auth";
import type { WorkoutPageData } from "../web/types";
import { printUsage } from "../usage";
import { formatHumanTimestamp, isIsoAfterNow } from "../datetime";

export async function handleWorkout(
  positionals: string[],
  options: Record<string, string>,
): Promise<void> {
  const action = positionals[0];
  if (!action || action === "help") {
    printUsage();
    return;
  }

  const config = readConfig();
  const debug = config.debug === true;
  const autoLogin = true;
  let token = resolveToken(options, config);
  const ensureToken = async (): Promise<string> => {
    if (!token) {
      if (autoLogin) {
        token = await loginAndPersist(options, config, "silent");
      } else {
        throw new Error(
          "Missing auth token. Run 'kahunas workout sync' to refresh login, then try again.",
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
    const timezone = resolveCalendarTimezone();
    let userUuid = resolveUserUuid(options, config);
    if (!userUuid) {
      try {
        await ensureToken();
        let checkinsResponse = await postJson("/api/v2/checkin/list", token!, baseUrl, {
          page: 1,
          rpp: 1,
        });
        if (autoLogin && isTokenExpiredResponse(checkinsResponse.json)) {
          token = await loginAndPersist(options, config, "silent");
          checkinsResponse = await postJson("/api/v2/checkin/list", token, baseUrl, {
            page: 1,
            rpp: 1,
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
        "Missing user uuid. Run 'kahunas checkins list' or 'kahunas workout sync' once.",
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

    let text: string;
    let payload: unknown;
    try {
      const result = await fetchCalendarEvents({
        userUuid,
        csrfToken: effectiveCsrfToken,
        cookieHeader,
        webBaseUrl: baseWebUrl,
        timezone,
      });
      text = result.text;
      payload = result.payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
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
      const retry = await fetchCalendarEvents({
        userUuid,
        csrfToken: effectiveCsrfToken,
        cookieHeader,
        webBaseUrl: baseWebUrl,
        timezone,
      });
      text = retry.text;
      payload = retry.payload;
    }

    return { text, payload, timezone };
  };

  const buildProgramDetails = async (events: WorkoutEvent[]): Promise<Record<string, unknown>> => {
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
          .filter((value): value is string => Boolean(value)),
      ),
    );

    for (const programId of programIds) {
      try {
        await ensureToken();
        let responseProgram = await fetchWorkoutProgram(
          token!,
          baseUrl,
          programId,
          effectiveCsrfToken,
        );
        if (autoLogin && isTokenExpiredResponse(responseProgram.json)) {
          token = await loginAndPersist(options, config, "silent");
          responseProgram = await fetchWorkoutProgram(
            token,
            baseUrl,
            programId,
            effectiveCsrfToken,
          );
        }
        if (
          responseProgram.ok &&
          responseProgram.json &&
          typeof responseProgram.json === "object"
        ) {
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

  const normalizeDayLabel = (value: string): string => value.trim().toLowerCase();

  const parseDayIndexFromTitle = (value: string | undefined): number | undefined => {
    if (!value) {
      return undefined;
    }
    const dayMatch = value.match(/\bday\s*(\d+)/i);
    if (dayMatch) {
      const parsed = Number.parseInt(dayMatch[1], 10);
      return Number.isFinite(parsed) ? parsed - 1 : undefined;
    }
    const trailingMatch = value.match(/(\d+)\s*$/);
    if (trailingMatch) {
      const parsed = Number.parseInt(trailingMatch[1], 10);
      return Number.isFinite(parsed) ? parsed - 1 : undefined;
    }
    return undefined;
  };

  const deriveFocusLabel = (
    title: string | undefined,
    fallback: string | undefined,
  ): string | undefined => {
    const raw = (title ?? fallback ?? "").trim();
    if (!raw) {
      return undefined;
    }
    let cleaned = raw.replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(/^day\s*\d+\s*[:\-]\s*/i, "");
    cleaned = cleaned.replace(/^workout\s*[:\-]\s*/i, "Workout ");
    cleaned = cleaned.replace(/\s+\d+\s*$/, "");
    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
    return cleaned || raw;
  };

  const resolveDayIndexForSummary = (
    days: ReturnType<typeof summarizeWorkoutProgramDays>,
    dayIndex: number | undefined,
    dayLabel: string | undefined,
  ): number | undefined => {
    if (dayIndex !== undefined) {
      const matchIndex = days.findIndex((day) => day.day_index === dayIndex);
      if (matchIndex >= 0) {
        return matchIndex;
      }
      if (days[dayIndex]) {
        return dayIndex;
      }
    }
    if (dayLabel) {
      const normalized = normalizeDayLabel(dayLabel);
      const matches = days.flatMap((day, index) => {
        if (!day.day_label) {
          return [];
        }
        const dayNormalized = normalizeDayLabel(day.day_label);
        if (dayNormalized.includes(normalized) || normalized.includes(dayNormalized)) {
          return [index];
        }
        return [];
      });
      if (matches.length === 1) {
        return matches[0];
      }
    }
    return undefined;
  };

  const hasExercises = (
    entry: ReturnType<typeof annotateWorkoutEventSummaries>[number],
  ): boolean => {
    const sections = entry.workout_day?.sections;
    if (!sections?.length) {
      return false;
    }
    for (const section of sections) {
      for (const group of section.groups) {
        if (group.exercises.length > 0) {
          return true;
        }
      }
    }
    return false;
  };

  const summarizeSessionFocuses = (
    events: ReturnType<typeof annotateWorkoutEventSummaries>,
  ): ReturnType<typeof summarizeWorkoutProgramDays> => {
    const focusMap = new Map<
      string,
      {
        label: string;
        summary: ReturnType<typeof annotateWorkoutEventSummaries>[number];
        latestTime: number;
        minIndex?: number;
      }
    >();
    for (const entry of events) {
      const day = entry.workout_day ?? {
        day_index: undefined,
        day_label: undefined,
        total_volume_sets: [],
        sections: [],
      };
      const summary =
        entry.workout_day !== null ? entry : { ...entry, workout_day: day };
      const label = deriveFocusLabel(
        typeof entry.event.title === "string" ? entry.event.title : undefined,
        day.day_label,
      );
      if (!label) {
        continue;
      }
      const key = normalizeDayLabel(label);
      const time = entry.event.start ? Date.parse(entry.event.start.replace(" ", "T")) : 0;
      const indexHint = parseDayIndexFromTitle(entry.event.title as string | undefined);
      const existing = focusMap.get(key);
      if (!existing || time > existing.latestTime) {
        focusMap.set(key, {
          label,
          summary,
          latestTime: time,
          minIndex: existing?.minIndex ?? indexHint,
        });
        continue;
      }
      if (indexHint !== undefined) {
        const currentMin = existing.minIndex;
        if (currentMin === undefined || indexHint < currentMin) {
          existing.minIndex = indexHint;
        }
      }
    }
    if (focusMap.size === 0) {
      return [];
    }
    const sorted = [...focusMap.values()].sort((a, b) => {
      if (a.minIndex !== undefined && b.minIndex !== undefined && a.minIndex !== b.minIndex) {
        return a.minIndex - b.minIndex;
      }
      return a.label.localeCompare(b.label);
    });
    return sorted.map((entry) => ({
      ...entry.summary.workout_day!,
      day_index: undefined,
      day_label: entry.label,
    }));
  };

  const startWorkoutServer = async (): Promise<void> => {
    const host = "127.0.0.1";
    const port = 3000;
    const limit = 0;
    const cacheTtlMs = 30_000;

    const loadSummary = async (
      forceRefresh: boolean,
    ): Promise<{
      formatted: ReturnType<typeof formatWorkoutEventsOutput>;
      programDetails: Record<string, unknown>;
      timezone: string;
    }> => {
      const cachedCalendar = !forceRefresh ? readCalendarCache() : null;
      let payload: unknown = cachedCalendar?.payload;
      let timezone = cachedCalendar?.timezone ?? resolveCalendarTimezone();

      if (!cachedCalendar) {
        const { payload: fetchedPayload, timezone: fetchedTimezone } =
          await fetchWorkoutEventsPayload();
        payload = fetchedPayload;
        timezone = fetchedTimezone;
        if (Array.isArray(payload)) {
          writeCalendarCache(payload, { timezone, userUuid: config.userUuid });
        }
      }

      if (!Array.isArray(payload)) {
        throw new Error("Unexpected calendar response.");
      }

      const filtered = filterWorkoutEvents(payload);
      const sorted = sortWorkoutEvents(filtered);
      const bounded = limit > 0 ? sorted.slice(-limit) : sorted;
      const programIds = Array.from(
        new Set(
          bounded
            .map((entry) => {
              if (!entry || typeof entry !== "object") {
                return undefined;
              }
              const record = entry as Record<string, unknown>;
              return typeof record.program === "string" ? record.program : undefined;
            })
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const programDetails =
        cachedCalendar && !forceRefresh
          ? readProgramCaches(programIds)
          : await buildProgramDetails(bounded);
      if (!cachedCalendar || forceRefresh) {
        for (const programId of programIds) {
          const payload = programDetails[programId];
          if (payload && typeof payload === "object") {
            writeProgramCache(programId, payload);
          }
        }
      }
      const formatted = formatWorkoutEventsOutput(bounded, programDetails, {
        timezone,
        program: undefined,
        workout: undefined,
      });
      return { formatted, programDetails, timezone };
    };

    let cached:
      | {
          data: Awaited<ReturnType<typeof loadSummary>>;
          fetchedAt: number;
        }
      | undefined;
    let summaryInFlight: Promise<Awaited<ReturnType<typeof loadSummary>>> | null = null;

    const getSummary = async (
      forceRefresh: boolean,
    ): Promise<Awaited<ReturnType<typeof loadSummary>>> => {
      if (!forceRefresh && cached && Date.now() - cached.fetchedAt < cacheTtlMs) {
        return cached.data;
      }
      if (!forceRefresh && summaryInFlight) {
        return summaryInFlight;
      }
      const pending = loadSummary(forceRefresh).finally(() => {
        summaryInFlight = null;
      });
      summaryInFlight = pending;
      const data = await pending;
      cached = { data, fetchedAt: Date.now() };
      return data;
    };

    const resolveWebRoot = (): string => {
      const distRoot = path.join(__dirname, "web");
      if (existsSync(distRoot)) {
        return distRoot;
      }
      return path.join(__dirname, "..", "src", "web");
    };

    const resolveDayParamIndex = (
      dayParam: string | null,
      days: ReturnType<typeof summarizeWorkoutProgramDays>,
    ): number | undefined => {
      if (!dayParam) {
        return undefined;
      }
      const parsed = Number.parseInt(dayParam, 10);
      if (!Number.isFinite(parsed)) {
        return undefined;
      }
      return days[parsed] ? parsed : undefined;
    };

    const pickLatestSummaryForDay = (
      events: ReturnType<typeof annotateWorkoutEventSummaries>,
      days: ReturnType<typeof summarizeWorkoutProgramDays>,
      dayIndex: number,
    ): ReturnType<typeof annotateWorkoutEventSummaries>[number] | undefined => {
      let fallback: ReturnType<typeof annotateWorkoutEventSummaries>[number] | undefined;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const entry = events[i];
        if (!entry) {
          continue;
        }
        const focusLabel = deriveFocusLabel(
          typeof entry.event.title === "string" ? entry.event.title : undefined,
          entry.workout_day?.day_label,
        );
        const resolved = resolveDayIndexForSummary(
          days,
          entry.workout_day?.day_index,
          focusLabel ?? entry.workout_day?.day_label,
        );
        if (resolved === dayIndex) {
          if (hasExercises(entry)) {
            return entry;
          }
          if (!fallback) {
            fallback = entry;
          }
        }
      }
      return fallback;
    };

    const buildPageData = async (url: URL, wantsRefresh: boolean): Promise<WorkoutPageData> => {
      const data = await getSummary(wantsRefresh);
      const dayParam = url.searchParams.get("day");
      const eventParam = url.searchParams.get("event");
      const annotatedEvents = annotateWorkoutEventSummaries(data.formatted.events);
      const latestSummary = annotatedEvents[annotatedEvents.length - 1];
      const eventSummary = eventParam
        ? annotatedEvents.find(
            (entry) => entry.event.id !== undefined && String(entry.event.id) === eventParam,
          )
        : undefined;
      const baseSummary = eventSummary ?? latestSummary;
      const programUuid = baseSummary?.program?.uuid;
      const program = programUuid ? data.programDetails[programUuid] : undefined;
      const programEvents = annotatedEvents;
      const programDays = summarizeWorkoutProgramDays(program);
      const focusDays = summarizeSessionFocuses(programEvents);
      const days = focusDays.length > 0 ? focusDays : programDays;
      const dayParamIndex = resolveDayParamIndex(dayParam, days);
      const selectedSummary =
        eventSummary ??
        (dayParamIndex !== undefined
          ? pickLatestSummaryForDay(programEvents, days, dayParamIndex)
          : undefined) ??
        latestSummary;
      const dayDateMap = buildDayDateMap(programEvents, days);
      const sessions = programEvents
        .filter(
          (entry) =>
            entry.event.id !== undefined &&
            typeof entry.event.start === "string",
        )
        .map((entry) => {
          const focusLabel = deriveFocusLabel(
            typeof entry.event.title === "string" ? entry.event.title : undefined,
            entry.workout_day?.day_label,
          );
          const dayIndex = resolveDayIndexForSummary(
            days,
            entry.workout_day?.day_index,
            focusLabel ?? entry.workout_day?.day_label,
          );
          const dayLabel =
            dayIndex !== undefined
              ? days[dayIndex]?.day_label
              : focusLabel ?? entry.workout_day?.day_label;
          return {
            id: entry.event.id!,
            title: entry.event.title,
            start: entry.event.start,
            program: entry.program?.title ?? null,
            programUuid: entry.program?.uuid,
            dayIndex,
            dayLabel,
          };
        })
        .sort((a, b) => {
          const aTime = a.start ? Date.parse(a.start.replace(" ", "T")) : 0;
          const bTime = b.start ? Date.parse(b.start.replace(" ", "T")) : 0;
          return bTime - aTime;
        });
      const summaryDayIndex = resolveDayIndexForSummary(
        days,
        selectedSummary?.workout_day?.day_index,
        deriveFocusLabel(
          typeof selectedSummary?.event.title === "string"
            ? selectedSummary.event.title
            : undefined,
          selectedSummary?.workout_day?.day_label,
        ) ?? selectedSummary?.workout_day?.day_label,
      );
      const selectedDayIndex = resolveSelectedDayIndex(
        days,
        selectedSummary?.workout_day?.day_index,
        deriveFocusLabel(
          typeof selectedSummary?.event.title === "string"
            ? selectedSummary.event.title
            : undefined,
          selectedSummary?.workout_day?.day_label,
        ) ?? selectedSummary?.workout_day?.day_label,
        dayParam,
      );
      return {
        summary: selectedSummary,
        days,
        dayDateMap,
        sessions,
        summaryDayIndex,
        selectedDayIndex,
        timezone: data.timezone,
        apiPath: "/api/workout",
        refreshPath: "/?refresh=1",
        isLatest: selectedSummary === latestSummary,
        selectedEventId: selectedSummary?.event.id,
        eventSelected: Boolean(eventParam),
      };
    };

    const loadModule = async <T>(specifier: string): Promise<T> => {
      const importer = new Function("m", "return import(m)") as (m: string) => Promise<T>;
      return importer(specifier);
    };
    const { createServer: createViteServer } = await loadModule<typeof import("vite")>("vite");
    const { default: solidPlugin } =
      await loadModule<typeof import("vite-plugin-solid")>("vite-plugin-solid");
    const webRoot = resolveWebRoot();
    const template = await readFile(path.join(webRoot, "index.html"), "utf8");
    const vite = await createViteServer({
      root: webRoot,
      appType: "custom",
      server: {
        middlewareMode: true,
        fs: { allow: [path.join(webRoot, "..")] },
      },
      plugins: [solidPlugin()],
    });

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://${host}:${port}`);
        const wantsRefresh = url.searchParams.get("refresh") === "1";

        if (url.pathname === "/api/workout") {
          const data = await getSummary(wantsRefresh);
          const annotated = {
            ...data.formatted,
            events: annotateWorkoutEventSummaries(data.formatted.events),
          };
          res.statusCode = 200;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(annotated, null, 2));
          return;
        }

        if (url.pathname === "/favicon.ico") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (url.pathname === "/") {
          const pageData = await buildPageData(url, wantsRefresh);
          const payload = JSON.stringify(pageData).replace(/</g, "\\u003c");
          let html = template.replace("<!--workout-data-->", payload);
          html = await vite.transformIndexHtml(url.pathname + url.search, html);
          res.statusCode = 200;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(html);
          return;
        }

        vite.middlewares(req, res, (error: unknown) => {
          if (error) {
            throw error;
          }
        });
      } catch (error) {
        if (error instanceof Error) {
          vite.ssrFixStacktrace?.(error);
        }
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(error instanceof Error ? error.message : "Server error");
      }
    });

    server.listen(port, host, () => {
      const cache = readWorkoutCache();
      const freshConfig = readConfig();
      const lastSync = cache?.updatedAt ? formatHumanTimestamp(cache.updatedAt) : "none";
      const tokenExpiry = freshConfig.tokenExpiresAt
        ? formatHumanTimestamp(freshConfig.tokenExpiresAt)
        : "unknown";
      const tokenUpdatedAt = freshConfig.tokenUpdatedAt
        ? formatHumanTimestamp(freshConfig.tokenUpdatedAt)
        : "unknown";
      logInfo(`Local workout server running at http://${host}:${port}`);
      logInfo(`JSON endpoint at http://${host}:${port}/api/workout`);
      logInfo(`Config: ${CONFIG_PATH}`);
      logInfo(`Session cache: ${WORKOUT_CACHE_PATH}`);
      logInfo(`Last workout sync: ${lastSync}`);
      logInfo(`Token expiry: ${tokenExpiry}`);
      if (tokenExpiry === "unknown" && tokenUpdatedAt !== "unknown") {
        logInfo(`Token updated at: ${tokenUpdatedAt}`);
      }
    });
  };

  const buildDayDateMap = (
    events: ReturnType<typeof annotateWorkoutEventSummaries>,
    days: ReturnType<typeof summarizeWorkoutProgramDays>,
  ): Record<string, string> => {
    const map: Record<string, { time: number; label: string }> = {};

    for (const entry of events) {
      const day = entry.workout_day;
      const focusLabel = deriveFocusLabel(
        typeof entry.event.title === "string" ? entry.event.title : undefined,
        day?.day_label,
      );
      const resolvedIndex = resolveDayIndexForSummary(
        days,
        day?.day_index,
        focusLabel ?? day?.day_label,
      );
      if (resolvedIndex === undefined || !day?.sections?.length) {
        continue;
      }
      const latest = getLatestExerciseDateForDay(day);
      if (!latest) {
        continue;
      }
      const current = map[String(resolvedIndex)];
      if (!current || latest.time > current.time) {
        map[String(resolvedIndex)] = latest;
      }
    }
    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(map)) {
      output[key] = value.label;
    }
    return output;
  };

  const getLatestExerciseDateForDay = (
    day: NonNullable<ReturnType<typeof annotateWorkoutEventSummaries>[number]["workout_day"]>,
  ): { time: number; label: string } | null => {
    let latest: { time: number; label: string } | null = null;
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          const label = exercise.performed_on ?? exercise.performed_at;
          if (!label) {
            continue;
          }
          const parsed = Date.parse(label);
          if (!Number.isFinite(parsed)) {
            continue;
          }
          if (!latest || parsed > latest.time) {
            latest = { time: parsed, label };
          }
        }
      }
    }
    return latest;
  };

  const resolveSelectedDayIndex = (
    days: ReturnType<typeof summarizeWorkoutProgramDays>,
    eventDayIndex: number | undefined,
    eventDayLabel: string | undefined,
    dayParam: string | null,
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
        day.day_label ? normalize(day.day_label).includes(normalized) : false,
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
            path: WORKOUT_CACHE_PATH,
          }
        : undefined,
      data: {
        workout_plan: plans,
      },
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
      logPlain(formatHeading("Pick a workout program:"));
      plans.forEach((plan, index) => {
        logPlain(`${index + 1}) ${formatWorkoutSummary(plan)}`);
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
    const debugPreview = isFlagEnabled(options, "debug-preview") || debug;
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
        debugLog(
          true,
          `preview event=${eventId} program=${programUuid ?? "unknown"} day_index=${
            dayIndex ?? "none"
          } source=${source}`,
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
      workout: undefined,
    });
    console.log(JSON.stringify(formatted, null, 2));
    return;
  }

  if (action === "serve") {
    await startWorkoutServer();
    return;
  }

  if (action === "sync") {
    const authConfig = readAuthConfig();
    const hasAuthConfig =
      !!authConfig && !!authConfig.password && (!!authConfig.email || !!authConfig.username);
    const tokenUpdatedAt = config.tokenUpdatedAt ?? undefined;
    const tokenExpiry = token && tokenUpdatedAt ? resolveTokenExpiry(token, tokenUpdatedAt) : null;
    const hasValidToken = !!tokenExpiry && isIsoAfterNow(tokenExpiry);
    let pendingAuth: AuthConfig | undefined;

    if (!hasValidToken && !hasAuthConfig) {
      if (!process.stdin.isTTY) {
        throw new Error(
          "Missing auth credentials. Create ~/.config/kahunas/auth.json or run 'kahunas sync' in a terminal.",
        );
      }
      const login = await askQuestion("Email or username: ", process.stderr);
      if (!login) {
        throw new Error("Missing email/username for login.");
      }
      const password = await askHiddenQuestion("Password: ", process.stderr);
      if (!password) {
        throw new Error("Missing password for login.");
      }
      const isEmail = login.includes("@");
      pendingAuth = {
        email: isEmail ? login : undefined,
        username: isEmail ? undefined : login,
        password,
      };
    }

    const captured = await captureWorkoutsFromBrowser(options, config, pendingAuth);
    let nextConfig = { ...config };
    if (captured.token) {
      nextConfig.token = captured.token;
      const tokenUpdatedAt = new Date().toISOString();
      nextConfig.tokenUpdatedAt = tokenUpdatedAt;
      nextConfig.tokenExpiresAt = resolveTokenExpiry(captured.token, tokenUpdatedAt) ?? null;
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
    token = nextConfig.token ?? token;

    let userUuid = resolveUserUuid(options, nextConfig);
    if (!userUuid && token) {
      try {
        let checkinsResponse = await postJson("/api/v2/checkin/list", token, baseUrl, {
          page: 1,
          rpp: 1,
        });
        if (autoLogin && isTokenExpiredResponse(checkinsResponse.json)) {
          token = await loginAndPersist(options, config, "silent");
          checkinsResponse = await postJson("/api/v2/checkin/list", token, baseUrl, {
            page: 1,
            rpp: 1,
          });
        }
        if (checkinsResponse.ok) {
          const extracted = extractUserUuidFromCheckins(checkinsResponse.json);
          if (extracted) {
            userUuid = extracted;
          }
        }
      } catch {
        // Best-effort discovery only.
      }
    }
    if (userUuid && userUuid !== nextConfig.userUuid) {
      nextConfig = { ...nextConfig, userUuid };
    }

    writeConfig(nextConfig);

    let eventsCache: WorkoutEventsCache | null = null;
    if (userUuid) {
      const csrfToken = nextConfig.csrfCookie ?? nextConfig.csrfToken;
      const cookieHeader = nextConfig.authCookie;
      if (csrfToken && cookieHeader) {
        try {
          const calendarTimezone = resolveCalendarTimezone();
          const { payload, timezone } = await fetchCalendarEvents({
            userUuid,
            csrfToken,
            cookieHeader,
            webBaseUrl: resolveWebBaseUrl(options, nextConfig),
            timezone: calendarTimezone,
          });
          writeCalendarCache(payload, { timezone, userUuid });
          if (Array.isArray(payload)) {
            const filtered = filterWorkoutEvents(payload);
            const sorted = sortWorkoutEvents(filtered);
            const programDetails =
              sorted.length > 0 && token ? await buildProgramDetails(sorted) : {};
            for (const [programId, program] of Object.entries(programDetails)) {
              if (program && typeof program === "object") {
                writeProgramCache(programId, program);
              }
            }
            const formatted = formatWorkoutEventsOutput(sorted, programDetails, {
              timezone,
              program: undefined,
              workout: undefined,
            });
            const annotated = {
              ...formatted,
              events: annotateWorkoutEventSummaries(formatted.events),
            };
            eventsCache = { updatedAt: new Date().toISOString(), ...annotated };
          }
        } catch {
          // Best-effort calendar capture only.
        }
      }
    }

    const cache = writeWorkoutCache(captured.plans, eventsCache);
    const payload = {
      message: "Workout programs synced",
      cache: {
        updated_at: cache.updatedAt,
        count: cache.plans.length,
        path: WORKOUT_CACHE_PATH,
        data: cache,
      },
    };
    const shouldEmitJson = rawOutput || !process.stdout.isTTY;
    if (shouldEmitJson) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      logPlain(formatSyncSummary(cache, eventsCache, WORKOUT_CACHE_PATH));
    }
    const shouldLogCredentialStatus = process.stdout.isTTY && !rawOutput;
    if (pendingAuth && captured.token) {
      writeAuthConfig(pendingAuth);
      if (shouldLogCredentialStatus) {
        console.error(`Saved credentials to ${AUTH_PATH}`);
      }
    } else if (pendingAuth && shouldLogCredentialStatus) {
      console.error("Login was not detected; credentials were not saved.");
    }
    if (process.stdin.isTTY) {
      const answer = await askQuestion("Start the preview server now? (y/N): ", process.stderr);
      if (answer.toLowerCase().startsWith("y")) {
        await startWorkoutServer();
      }
    }
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

function formatSyncSummary(
  cache: { plans: WorkoutPlan[] },
  eventsCache: WorkoutEventsCache | null,
  cachePath: string,
): string {
  const programCount = cache.plans.length;
  const programLabel = programCount === 1 ? "program" : "programs";
  let summary = `Synced ${programCount} ${programLabel}`;
  const sessionCount = eventsCache?.events?.length;
  if (sessionCount !== undefined) {
    const sessionLabel = sessionCount === 1 ? "session" : "sessions";
    summary += `, ${sessionCount} ${sessionLabel}`;
    const latestStart = eventsCache?.events?.[sessionCount - 1]?.event?.start;
    const latestDate = latestStart ? resolveDateLabel(latestStart) : undefined;
    if (latestDate) {
      summary += ` (latest ${latestDate})`;
    }
  }
  summary += `. Stored at ${cachePath}.`;
  return summary;
}

function resolveDateLabel(value: string): string | undefined {
  const match = value.match(/^(\\d{4}-\\d{2}-\\d{2})/);
  return match ? match[1] : undefined;
}
