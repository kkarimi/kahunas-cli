import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  check,
  flatten,
  minLength,
  object,
  optional,
  pipe,
  safeParse,
  string,
  trim,
  type InferOutput,
} from "valibot";
import type { WorkoutEventSummary } from "./events";
import type { WorkoutPlan } from "./workouts";

const DEFAULT_BASE_URL = "https://api.kahunas.io";
const DEFAULT_WEB_BASE_URL = "https://kahunas.io";

export const CONFIG_PATH = path.join(os.homedir(), ".config", "kahunas", "config.json");
export const AUTH_PATH = path.join(os.homedir(), ".config", "kahunas", "auth.json");
export const WORKOUT_CACHE_PATH = path.join(os.homedir(), ".config", "kahunas", "workouts.json");
export const CACHE_DIR_PATH = path.join(os.homedir(), ".config", "kahunas", "cache");

export type Config = {
  token?: string;
  baseUrl?: string;
  csrfToken?: string;
  webBaseUrl?: string;
  authCookie?: string;
  csrfCookie?: string;
  userUuid?: string;
  tokenUpdatedAt?: string;
  tokenExpiresAt?: string | null;
  debug?: boolean;
  headless?: boolean;
};

export type AuthConfig = {
  username?: string;
  email?: string;
  password?: string;
  loginPath?: string;
};

const AuthConfigSchema = pipe(
  object({
    username: optional(pipe(string(), trim(), minLength(1, "Missing username."))),
    email: optional(pipe(string(), trim(), minLength(1, "Missing email."))),
    password: pipe(string("Missing password."), trim(), minLength(1, "Missing password.")),
    loginPath: optional(string()),
  }),
  check((input) => Boolean(input.username || input.email), "Missing username or email."),
);

export type ValidAuthConfig = InferOutput<typeof AuthConfigSchema>;

export type WorkoutCache = {
  updatedAt: string;
  plans: WorkoutPlan[];
  events?: WorkoutEventsCache | null;
};

export type WorkoutEventsCache = {
  updatedAt: string;
  timezone: string;
  source: "calendar";
  filters: { program: string | null; workout: string | null };
  events: WorkoutEventSummary[];
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

export function readAuthConfig(): ValidAuthConfig | undefined {
  if (!fs.existsSync(AUTH_PATH)) {
    return undefined;
  }

  const raw = fs.readFileSync(AUTH_PATH, "utf-8");
  let parsed: AuthConfig;
  try {
    parsed = JSON.parse(raw) as AuthConfig;
  } catch {
    throw new Error(`Invalid JSON in ${AUTH_PATH}.`);
  }
  return validateAuthConfig(parsed);
}

export function writeAuthConfig(auth: AuthConfig): void {
  const dir = path.dirname(AUTH_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTH_PATH, `${JSON.stringify(auth, null, 2)}\n`, "utf-8");
}

export function validateAuthConfig(auth: AuthConfig): ValidAuthConfig {
  const result = safeParse(AuthConfigSchema, auth);
  if (result.success) {
    return result.output;
  }

  const flat = flatten(result.issues);
  const missing: string[] = [];
  if (flat.root?.some((message) => message.includes("username or email"))) {
    missing.push("username or email");
  }
  if (flat.nested?.password) {
    missing.push("password");
  }

  if (missing.length > 0) {
    throw new Error(`Invalid auth.json at ${AUTH_PATH}. Missing ${missing.join(" and ")}.`);
  }

  const detail =
    flat.root?.[0] ?? flat.other?.[0] ?? flat.nested?.password?.[0] ?? "Invalid auth.json format.";
  throw new Error(`Invalid auth.json at ${AUTH_PATH}. ${detail}`);
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

export function writeWorkoutCache(
  plans: WorkoutPlan[],
  events?: WorkoutEventsCache | null,
): WorkoutCache {
  const dir = path.dirname(WORKOUT_CACHE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const cache: WorkoutCache = { updatedAt: new Date().toISOString(), plans, events };
  fs.writeFileSync(WORKOUT_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
  return cache;
}

export function resolveToken(_: Record<string, string>, config: Config): string | undefined {
  return config.token;
}

export function resolveCsrfToken(_: Record<string, string>, config: Config): string | undefined {
  return config.csrfToken;
}

export function resolveCsrfCookie(_: Record<string, string>, config: Config): string | undefined {
  return config.csrfCookie;
}

export function resolveAuthCookie(_: Record<string, string>, config: Config): string | undefined {
  return config.authCookie;
}

export function resolveUserUuid(_: Record<string, string>, config: Config): string | undefined {
  return config.userUuid;
}

export function resolveBaseUrl(options: Record<string, string>, config: Config): string {
  return config.baseUrl ?? DEFAULT_BASE_URL;
}

export function resolveWebBaseUrl(options: Record<string, string>, config: Config): string {
  return config.webBaseUrl ?? DEFAULT_WEB_BASE_URL;
}
