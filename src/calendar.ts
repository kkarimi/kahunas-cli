import { parseJsonText } from "./http";

export type CalendarFetchOptions = {
  userUuid: string;
  csrfToken: string;
  cookieHeader: string;
  webBaseUrl: string;
  timezone?: string;
};

export type CalendarFetchResult = {
  text: string;
  payload: unknown;
  timezone: string;
};

export function resolveCalendarTimezone(): string {
  return process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/London";
}

export async function fetchCalendarEvents(
  options: CalendarFetchOptions,
): Promise<CalendarFetchResult> {
  const timezone = options.timezone ?? resolveCalendarTimezone();
  const webOrigin = new URL(options.webBaseUrl).origin;
  const url = new URL(`/coach/clients/calendar/getEvent/${options.userUuid}`, webOrigin);
  url.searchParams.set("timezone", timezone);

  const body = new URLSearchParams();
  body.set("csrf_kahunas_token", options.csrfToken);
  body.set("filter", "");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      cookie: options.cookieHeader,
      origin: webOrigin,
      referer: `${webOrigin}/dashboard`,
      "x-requested-with": "XMLHttpRequest",
    },
    body: body.toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return { text, payload: parseJsonText(text), timezone };
}
