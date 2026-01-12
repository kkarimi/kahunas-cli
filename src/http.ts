import { extractToken } from "./tokens";

export type ApiResponse = {
  ok: boolean;
  status: number;
  text: string;
  json?: unknown;
};

export function parseJsonText(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function postJson(
  pathName: string,
  token: string,
  baseUrl: string,
  body: Record<string, unknown>
): Promise<ApiResponse> {
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

export async function getWithAuth(
  pathName: string,
  token: string,
  baseUrl: string
): Promise<ApiResponse> {
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

export async function fetchWorkoutProgram(
  token: string,
  baseUrl: string,
  programId: string,
  csrfToken?: string
): Promise<ApiResponse> {
  const url = new URL(`/api/v1/workoutprogram/${programId}`, baseUrl);
  if (csrfToken) {
    url.searchParams.set("csrf_kahunas_token", csrfToken);
  }
  return getWithAuth(url.pathname + url.search, token, baseUrl);
}

export async function fetchAuthToken(
  csrfToken: string,
  cookieHeader: string,
  webBaseUrl: string
): Promise<{ token?: string; raw: string }> {
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

  return { token: extractToken(text), raw: text };
}
