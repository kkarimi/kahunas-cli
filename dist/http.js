"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJsonText = parseJsonText;
exports.postJson = postJson;
exports.getWithAuth = getWithAuth;
exports.fetchWorkoutProgram = fetchWorkoutProgram;
exports.fetchAuthToken = fetchAuthToken;
const tokens_1 = require("./tokens");
function parseJsonText(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
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
    return { token: (0, tokens_1.extractToken)(text), raw: text };
}
