"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAuth = handleAuth;
const args_1 = require("../args");
const config_1 = require("../config");
const http_1 = require("../http");
const responses_1 = require("../responses");
const tokens_1 = require("../tokens");
const auth_1 = require("../auth");
const usage_1 = require("../usage");
async function handleAuth(positionals, options) {
    const action = positionals[0];
    if (!action || action === "help") {
        (0, usage_1.printUsage)();
        return;
    }
    if (action === "set") {
        const token = positionals[1] ?? options.token;
        if (!token) {
            throw new Error("Missing token for auth set.");
        }
        const config = (0, config_1.readConfig)();
        const baseUrl = (0, config_1.resolveBaseUrl)(options, config);
        const csrfToken = (0, config_1.resolveCsrfToken)(options, config);
        const webBaseUrl = (0, config_1.resolveWebBaseUrl)(options, config);
        const authCookie = (0, config_1.resolveAuthCookie)(options, config);
        const csrfCookie = (0, config_1.resolveCsrfCookie)(options, config);
        (0, config_1.writeConfig)({
            ...config,
            token,
            baseUrl,
            csrfToken,
            webBaseUrl,
            authCookie,
            csrfCookie
        });
        console.log(`Saved token to ${config_1.CONFIG_PATH}`);
        return;
    }
    if (action === "token") {
        const config = (0, config_1.readConfig)();
        const csrfToken = (0, config_1.resolveCsrfToken)(options, config);
        if (!csrfToken) {
            throw new Error("Missing CSRF token. Provide --csrf or set KAHUNAS_CSRF.");
        }
        const webBaseUrl = (0, config_1.resolveWebBaseUrl)(options, config);
        const authCookie = (0, config_1.resolveAuthCookie)(options, config);
        const csrfCookie = (0, config_1.resolveCsrfCookie)(options, config);
        const cookieToken = csrfCookie ?? csrfToken;
        const cookieHeader = authCookie ?? `csrf_kahunas_cookie_token=${cookieToken}`;
        const rawOutput = (0, args_1.isFlagEnabled)(options, "raw");
        const { token: extractedToken, raw } = await (0, http_1.fetchAuthToken)(csrfToken, cookieHeader, webBaseUrl);
        const token = extractedToken && (0, tokens_1.isLikelyAuthToken)(extractedToken) ? extractedToken : undefined;
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
        (0, config_1.writeConfig)(nextConfig);
        console.log(token);
        return;
    }
    if (action === "login") {
        const config = (0, config_1.readConfig)();
        const rawOutput = (0, args_1.isFlagEnabled)(options, "raw");
        const outputMode = rawOutput ? "raw" : "token";
        await (0, auth_1.loginAndPersist)(options, config, outputMode);
        return;
    }
    if (action === "status") {
        const config = (0, config_1.readConfig)();
        const autoLogin = (0, args_1.shouldAutoLogin)(options, false);
        let token = (0, config_1.resolveToken)(options, config);
        if (!token) {
            if (autoLogin) {
                token = await (0, auth_1.loginAndPersist)(options, config, "silent");
            }
            else {
                throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth login'.");
            }
        }
        const baseUrl = (0, config_1.resolveBaseUrl)(options, config);
        let response = await (0, http_1.postJson)("/api/v2/checkin/list", token, baseUrl, { page: 1, rpp: 1 });
        if (autoLogin && (0, responses_1.isTokenExpiredResponse)(response.json)) {
            token = await (0, auth_1.loginAndPersist)(options, config, "silent");
            response = await (0, http_1.postJson)("/api/v2/checkin/list", token, baseUrl, { page: 1, rpp: 1 });
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.text}`);
        }
        if (response.json === undefined) {
            console.log("unknown");
            return;
        }
        console.log((0, responses_1.isTokenExpiredResponse)(response.json) ? "expired" : "valid");
        return;
    }
    if (action === "show") {
        const config = (0, config_1.readConfig)();
        if (!config.token) {
            throw new Error("No token saved. Use 'kahunas auth set <token>' or set KAHUNAS_TOKEN.");
        }
        console.log(config.token);
        return;
    }
    throw new Error(`Unknown auth action: ${action}`);
}
