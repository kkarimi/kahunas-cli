import * as fs from "node:fs";
import * as path from "node:path";
import { CACHE_DIR_PATH } from "./config";

type CalendarCacheIndex = {
  file: string;
  updatedAt: string;
  timezone: string;
  userUuid?: string;
};

type ProgramCacheIndex = {
  file: string;
  updatedAt: string;
};

type CacheIndex = {
  calendar?: CalendarCacheIndex;
  programs: Record<string, ProgramCacheIndex>;
};

type CalendarCachePayload = {
  updatedAt: string;
  timezone: string;
  userUuid?: string;
  payload: unknown;
};

const CACHE_INDEX_PATH = path.join(CACHE_DIR_PATH, "index.json");

function ensureCacheDir(): void {
  fs.mkdirSync(CACHE_DIR_PATH, { recursive: true });
}

function readCacheIndex(): CacheIndex {
  if (!fs.existsSync(CACHE_INDEX_PATH)) {
    return { programs: {} };
  }
  try {
    const raw = fs.readFileSync(CACHE_INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw) as CacheIndex;
    const programs = parsed.programs ?? {};
    return { ...parsed, programs };
  } catch {
    return { programs: {} };
  }
}

function writeCacheIndex(index: CacheIndex): void {
  ensureCacheDir();
  fs.writeFileSync(CACHE_INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}

function safeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

export function writeCalendarCache(
  payload: unknown,
  metadata: { timezone: string; userUuid?: string },
): CalendarCachePayload {
  ensureCacheDir();
  const updatedAt = new Date().toISOString();
  const file = `calendar-${safeTimestamp(updatedAt)}.json`;
  const record: CalendarCachePayload = {
    updatedAt,
    timezone: metadata.timezone,
    userUuid: metadata.userUuid,
    payload,
  };
  fs.writeFileSync(
    path.join(CACHE_DIR_PATH, file),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf-8",
  );
  const index = readCacheIndex();
  index.calendar = {
    file,
    updatedAt,
    timezone: metadata.timezone,
    userUuid: metadata.userUuid,
  };
  writeCacheIndex(index);
  return record;
}

export function writeProgramCache(programId: string, payload: unknown): void {
  if (!programId) {
    return;
  }
  ensureCacheDir();
  const updatedAt = new Date().toISOString();
  const file = `program-${programId}.json`;
  fs.writeFileSync(
    path.join(CACHE_DIR_PATH, file),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf-8",
  );
  const index = readCacheIndex();
  index.programs[programId] = { file, updatedAt };
  writeCacheIndex(index);
}

export function readCalendarCache(): CalendarCachePayload | null {
  const index = readCacheIndex();
  if (!index.calendar?.file) {
    return null;
  }
  const filePath = path.join(CACHE_DIR_PATH, index.calendar.file);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CalendarCachePayload;
  } catch {
    return null;
  }
}

export function readProgramCache(programId: string): unknown | null {
  if (!programId) {
    return null;
  }
  const index = readCacheIndex();
  const entry = index.programs[programId];
  if (!entry?.file) {
    return null;
  }
  const filePath = path.join(CACHE_DIR_PATH, entry.file);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function readProgramCaches(programIds: string[]): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const programId of programIds) {
    const payload = readProgramCache(programId);
    if (payload !== null) {
      details[programId] = payload;
    }
  }
  return details;
}
