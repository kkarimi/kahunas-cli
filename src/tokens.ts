export function isLikelyAuthToken(value: string): boolean {
  if (value.length >= 80) {
    return true;
  }
  if (value.includes(".") && value.split(".").length >= 3) {
    return true;
  }
  return /[+/=]/.test(value) && value.length >= 40;
}

function findTokenInUnknown(value: unknown): string | undefined {
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

export function extractToken(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return findTokenInUnknown(parsed);
  } catch {
    const trimmed = text.trim();
    return trimmed ? trimmed : undefined;
  }
}

export function isLikelyLoginHtml(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed.startsWith("<")) {
    return false;
  }
  return (
    trimmed.includes("login to your account") ||
    trimmed.includes("welcome back") ||
    trimmed.includes("<title>kahunas")
  );
}

export function extractJwtExpiry(token: string): string | undefined {
  const parts = token.split(".");
  if (parts.length < 2) {
    return undefined;
  }
  const payload = decodeBase64Url(parts[1]);
  if (!payload) {
    return undefined;
  }
  try {
    const data = JSON.parse(payload) as { exp?: unknown };
    if (typeof data.exp !== "number" || !Number.isFinite(data.exp)) {
      return undefined;
    }
    return new Date(data.exp * 1000).toISOString();
  } catch {
    return undefined;
  }
}

function decodeBase64Url(value: string): string | undefined {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded =
    padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  try {
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}
