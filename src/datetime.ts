import {
  addMilliseconds,
  format,
  formatDistanceToNow,
  fromUnixTime,
  isBefore,
  isValid,
  parseISO
} from "date-fns";

export function formatHumanTimestamp(value: string): string {
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    return value;
  }
  const absolute = format(parsed, "yyyy-MM-dd HH:mm:ss");
  const relative = formatDistanceToNow(parsed, { addSuffix: true });
  return `${absolute} (${relative})`;
}

export function isIsoAfterNow(value: string): boolean {
  const parsed = parseISO(value);
  return isValid(parsed) && isBefore(new Date(), parsed);
}

export function isoFromUnixSeconds(value: number): string {
  return fromUnixTime(value).toISOString();
}

export function addMillisecondsIso(value: string, ms: number): string | undefined {
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    return undefined;
  }
  return addMilliseconds(parsed, ms).toISOString();
}
