import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkoutPlan } from "./workouts";

const DEFAULT_BASE_URL = "https://api.kahunas.io";
const DEFAULT_WEB_BASE_URL = "https://kahunas.io";

export const CONFIG_PATH = path.join(os.homedir(), ".config", "kahunas", "config.json");
export const WORKOUT_CACHE_PATH = path.join(
  os.homedir(),
  ".config",
  "kahunas",
  "workouts.json"
);

export type Config = {
  token?: string;
  baseUrl?: string;
  csrfToken?: string;
  webBaseUrl?: string;
  authCookie?: string;
  csrfCookie?: string;
  userUuid?: string;
};

export type WorkoutCache = {
  updatedAt: string;
  plans: WorkoutPlan[];
};

export function readConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  try {
    return JSON.parse(raw) as Config;
  } catch {
    throw new Error(`Invalid JSON in ${CONFIG_PATH}.`);
  }
}

export function writeConfig(config: Config): void {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function readWorkoutCache(): WorkoutCache | undefined {
  if (!fs.existsSync(WORKOUT_CACHE_PATH)) {
    return undefined;
  }
  const raw = fs.readFileSync(WORKOUT_CACHE_PATH, "utf-8");
  try {
    return JSON.parse(raw) as WorkoutCache;
  } catch {
    return undefined;
  }
}

export function writeWorkoutCache(plans: WorkoutPlan[]): WorkoutCache {
  const dir = path.dirname(WORKOUT_CACHE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const cache: WorkoutCache = { updatedAt: new Date().toISOString(), plans };
  fs.writeFileSync(WORKOUT_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
  return cache;
}

export function resolveToken(options: Record<string, string>, config: Config): string | undefined {
  return options.token ?? process.env.KAHUNAS_TOKEN ?? config.token;
}

export function resolveCsrfToken(options: Record<string, string>, config: Config): string | undefined {
  return options.csrf ?? process.env.KAHUNAS_CSRF ?? config.csrfToken;
}

export function resolveCsrfCookie(options: Record<string, string>, config: Config): string | undefined {
  return options["csrf-cookie"] ?? process.env.KAHUNAS_CSRF_COOKIE ?? config.csrfCookie;
}

export function resolveAuthCookie(options: Record<string, string>, config: Config): string | undefined {
  return options.cookie ?? process.env.KAHUNAS_COOKIE ?? config.authCookie;
}

export function resolveUserUuid(options: Record<string, string>, config: Config): string | undefined {
  return options.user ?? process.env.KAHUNAS_USER_UUID ?? config.userUuid;
}

export function resolveBaseUrl(options: Record<string, string>, config: Config): string {
  return options["base-url"] ?? config.baseUrl ?? DEFAULT_BASE_URL;
}

export function resolveWebBaseUrl(options: Record<string, string>, config: Config): string {
  return (
    options["web-base-url"] ??
    process.env.KAHUNAS_WEB_BASE_URL ??
    config.webBaseUrl ??
    DEFAULT_WEB_BASE_URL
  );
}
