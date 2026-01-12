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
