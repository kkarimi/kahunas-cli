export function isTokenExpiredResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const record = payload as Record<string, unknown>;
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

export function extractUserUuidFromCheckins(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const checkins = (data as Record<string, unknown>).checkins;
  if (!Array.isArray(checkins) || checkins.length === 0) {
    return undefined;
  }
  const first = checkins[0];
  if (!first || typeof first !== "object") {
    return undefined;
  }
  const candidate = (first as Record<string, unknown>).user_uuid;
  return typeof candidate === "string" ? candidate : undefined;
}
