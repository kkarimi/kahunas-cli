"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLikelyAuthToken = isLikelyAuthToken;
exports.extractToken = extractToken;
exports.isLikelyLoginHtml = isLikelyLoginHtml;
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
function isLikelyLoginHtml(text) {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed.startsWith("<")) {
        return false;
    }
    return (trimmed.includes("login to your account") ||
        trimmed.includes("welcome back") ||
        trimmed.includes("<title>kahunas"));
}
