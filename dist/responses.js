"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTokenExpiredResponse = isTokenExpiredResponse;
exports.extractUserUuidFromCheckins = extractUserUuidFromCheckins;
function isTokenExpiredResponse(payload) {
    if (!payload || typeof payload !== "object") {
        return false;
    }
    const record = payload;
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
function extractUserUuidFromCheckins(payload) {
    if (!payload || typeof payload !== "object") {
        return undefined;
    }
    const record = payload;
    const data = record.data;
    if (!data || typeof data !== "object") {
        return undefined;
    }
    const checkins = data.checkins;
    if (!Array.isArray(checkins) || checkins.length === 0) {
        return undefined;
    }
    const first = checkins[0];
    if (!first || typeof first !== "object") {
        return undefined;
    }
    const candidate = first.user_uuid;
    return typeof candidate === "string" ? candidate : undefined;
}
