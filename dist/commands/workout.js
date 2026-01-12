"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWorkout = handleWorkout;
const args_1 = require("../args");
const config_1 = require("../config");
const events_1 = require("../events");
const http_1 = require("../http");
const output_1 = require("../output");
const responses_1 = require("../responses");
const tokens_1 = require("../tokens");
const utils_1 = require("../utils");
const workouts_1 = require("../workouts");
const auth_1 = require("../auth");
const usage_1 = require("../usage");
async function handleWorkout(positionals, options) {
    const action = positionals[0];
    if (!action || action === "help") {
        (0, usage_1.printUsage)();
        return;
    }
    const config = (0, config_1.readConfig)();
    const autoLogin = (0, args_1.shouldAutoLogin)(options, true);
    let token = (0, config_1.resolveToken)(options, config);
    const ensureToken = async () => {
        if (!token) {
            if (autoLogin) {
                token = await (0, auth_1.loginAndPersist)(options, config, "silent");
            }
            else {
                throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth login'.");
            }
        }
        return token;
    };
    const baseUrl = (0, config_1.resolveBaseUrl)(options, config);
    const rawOutput = (0, args_1.isFlagEnabled)(options, "raw");
    const page = (0, utils_1.parseNumber)(options.page, 1);
    const rpp = (0, utils_1.parseNumber)(options.rpp, 12);
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
        let response = await (0, http_1.getWithAuth)(url.pathname + url.search, token, baseUrl);
        if (autoLogin && (0, responses_1.isTokenExpiredResponse)(response.json)) {
            token = await (0, auth_1.loginAndPersist)(options, config, "silent");
            response = await (0, http_1.getWithAuth)(url.pathname + url.search, token, baseUrl);
        }
        const cache = (0, config_1.readWorkoutCache)();
        const plans = (0, workouts_1.extractWorkoutPlans)(response.json);
        const merged = cache ? (0, workouts_1.mergeWorkoutPlans)(plans, cache.plans) : plans;
        return { response, plans: merged, cache };
    };
    if (action === "list") {
        const { response, plans, cache } = await fetchList();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.text}`);
        }
        if (rawOutput) {
            (0, output_1.printResponse)(response, rawOutput);
            return;
        }
        const output = {
            source: cache ? "api+cache" : "api",
            cache: cache
                ? {
                    updated_at: cache.updatedAt,
                    count: cache.plans.length,
                    path: config_1.WORKOUT_CACHE_PATH
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
                console.log(`${index + 1}) ${(0, workouts_1.formatWorkoutSummary)(plan)}`);
            });
        }
        const answer = await (0, utils_1.askQuestion)(`Enter number (1-${plans.length}): `);
        const selection = Number.parseInt(answer, 10);
        if (Number.isNaN(selection) || selection < 1 || selection > plans.length) {
            throw new Error("Invalid selection.");
        }
        const chosen = plans[selection - 1];
        if (!chosen.uuid) {
            throw new Error("Selected workout is missing a uuid.");
        }
        const csrfToken = (0, config_1.resolveCsrfToken)(options, config);
        const ensuredToken = await ensureToken();
        let responseProgram = await (0, http_1.fetchWorkoutProgram)(ensuredToken, baseUrl, chosen.uuid, csrfToken);
        if (autoLogin && (0, responses_1.isTokenExpiredResponse)(responseProgram.json)) {
            token = await (0, auth_1.loginAndPersist)(options, config, "silent");
            responseProgram = await (0, http_1.fetchWorkoutProgram)(token, baseUrl, chosen.uuid, csrfToken);
        }
        if (!responseProgram.ok) {
            throw new Error(`HTTP ${responseProgram.status}: ${responseProgram.text}`);
        }
        (0, output_1.printResponse)(responseProgram, rawOutput);
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
        const chosen = (0, workouts_1.pickLatestWorkout)(plans);
        if (!chosen || !chosen.uuid) {
            throw new Error("Latest workout is missing a uuid.");
        }
        const csrfToken = (0, config_1.resolveCsrfToken)(options, config);
        const ensuredToken = await ensureToken();
        let responseProgram = await (0, http_1.fetchWorkoutProgram)(ensuredToken, baseUrl, chosen.uuid, csrfToken);
        if (autoLogin && (0, responses_1.isTokenExpiredResponse)(responseProgram.json)) {
            token = await (0, auth_1.loginAndPersist)(options, config, "silent");
            responseProgram = await (0, http_1.fetchWorkoutProgram)(token, baseUrl, chosen.uuid, csrfToken);
        }
        if (!responseProgram.ok) {
            throw new Error(`HTTP ${responseProgram.status}: ${responseProgram.text}`);
        }
        (0, output_1.printResponse)(responseProgram, rawOutput);
        return;
    }
    if (action === "events") {
        const baseWebUrl = (0, config_1.resolveWebBaseUrl)(options, config);
        const webOrigin = new URL(baseWebUrl).origin;
        const timezone = options.timezone ??
            process.env.TZ ??
            Intl.DateTimeFormat().resolvedOptions().timeZone ??
            "Europe/London";
        let userUuid = (0, config_1.resolveUserUuid)(options, config);
        if (!userUuid) {
            throw new Error("Missing user uuid. Use --user or set KAHUNAS_USER_UUID.");
        }
        if (userUuid !== config.userUuid) {
            (0, config_1.writeConfig)({ ...config, userUuid });
        }
        const minimal = (0, args_1.isFlagEnabled)(options, "minimal");
        let csrfToken = (0, config_1.resolveCsrfToken)(options, config);
        let csrfCookie = (0, config_1.resolveCsrfCookie)(options, config);
        let authCookie = (0, config_1.resolveAuthCookie)(options, config);
        let effectiveCsrfToken = csrfCookie ?? csrfToken;
        let cookieHeader = authCookie ??
            (effectiveCsrfToken ? `csrf_kahunas_cookie_token=${effectiveCsrfToken}` : undefined);
        if ((!csrfToken || !cookieHeader || !authCookie) && autoLogin) {
            await (0, auth_1.loginAndPersist)(options, config, "silent");
            const refreshed = (0, config_1.readConfig)();
            csrfToken = (0, config_1.resolveCsrfToken)(options, refreshed);
            csrfCookie = (0, config_1.resolveCsrfCookie)(options, refreshed);
            authCookie = (0, config_1.resolveAuthCookie)(options, refreshed);
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
        if (autoLogin && (0, tokens_1.isLikelyLoginHtml)(text)) {
            await (0, auth_1.loginAndPersist)(options, config, "silent");
            const refreshed = (0, config_1.readConfig)();
            csrfToken = (0, config_1.resolveCsrfToken)(options, refreshed);
            csrfCookie = (0, config_1.resolveCsrfCookie)(options, refreshed);
            authCookie = (0, config_1.resolveAuthCookie)(options, refreshed);
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
        const payload = (0, http_1.parseJsonText)(text);
        if (!Array.isArray(payload)) {
            console.log(text);
            return;
        }
        const filtered = (0, events_1.filterWorkoutEvents)(payload, options.program, options.workout);
        const sorted = (0, events_1.sortWorkoutEvents)(filtered);
        if (minimal) {
            console.log(JSON.stringify(sorted, null, 2));
            return;
        }
        let programIndex;
        const cache = (0, config_1.readWorkoutCache)();
        let plans = cache?.plans ?? [];
        try {
            await ensureToken();
            const listUrl = new URL("/api/v1/workoutprogram", baseUrl);
            listUrl.searchParams.set("page", "1");
            listUrl.searchParams.set("rpp", "100");
            let listResponse = await (0, http_1.getWithAuth)(listUrl.pathname + listUrl.search, token, baseUrl);
            if (autoLogin && (0, responses_1.isTokenExpiredResponse)(listResponse.json)) {
                token = await (0, auth_1.loginAndPersist)(options, config, "silent");
                listResponse = await (0, http_1.getWithAuth)(listUrl.pathname + listUrl.search, token, baseUrl);
            }
            if (listResponse.ok) {
                const fromApi = (0, workouts_1.extractWorkoutPlans)(listResponse.json);
                plans = (0, workouts_1.mergeWorkoutPlans)(fromApi, plans);
            }
        }
        catch {
            // Best-effort enrichment only.
        }
        if (plans.length > 0) {
            programIndex = (0, workouts_1.buildWorkoutPlanIndex)(plans);
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
                let responseProgram = await (0, http_1.fetchWorkoutProgram)(token, baseUrl, programId, effectiveCsrfToken);
                if (autoLogin && (0, responses_1.isTokenExpiredResponse)(responseProgram.json)) {
                    token = await (0, auth_1.loginAndPersist)(options, config, "silent");
                    responseProgram = await (0, http_1.fetchWorkoutProgram)(token, baseUrl, programId, effectiveCsrfToken);
                }
                if (responseProgram.ok && responseProgram.json && typeof responseProgram.json === "object") {
                    const programPayload = responseProgram.json;
                    const data = programPayload.data;
                    if (data && typeof data === "object") {
                        const plan = data.workout_plan;
                        if (plan) {
                            programDetails[programId] = plan;
                            continue;
                        }
                    }
                    programDetails[programId] = programPayload;
                    continue;
                }
            }
            catch {
                // Ignore fetch failures and fall back to cached index.
            }
            programDetails[programId] = programIndex?.[programId] ?? null;
        }
        const enriched = (0, events_1.enrichWorkoutEvents)(sorted, programDetails);
        console.log(JSON.stringify(enriched, null, 2));
        return;
    }
    if (action === "sync") {
        const captured = await (0, auth_1.captureWorkoutsFromBrowser)(options, config);
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
        (0, config_1.writeConfig)(nextConfig);
        const cache = (0, config_1.writeWorkoutCache)(captured.plans);
        console.log(JSON.stringify({
            message: "Workout programs synced",
            cache: {
                updated_at: cache.updatedAt,
                count: cache.plans.length,
                path: config_1.WORKOUT_CACHE_PATH
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
    const csrfToken = (0, config_1.resolveCsrfToken)(options, config);
    let responseProgram = await (0, http_1.fetchWorkoutProgram)(ensuredToken, baseUrl, programId, csrfToken);
    if (autoLogin && (0, responses_1.isTokenExpiredResponse)(responseProgram.json)) {
        token = await (0, auth_1.loginAndPersist)(options, config, "silent");
        responseProgram = await (0, http_1.fetchWorkoutProgram)(token, baseUrl, programId, csrfToken);
    }
    if (!responseProgram.ok) {
        throw new Error(`HTTP ${responseProgram.status}: ${responseProgram.text}`);
    }
    (0, output_1.printResponse)(responseProgram, rawOutput);
}
