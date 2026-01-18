import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkoutPlan } from "./workouts";

const DEFAULT_BASE_URL = "https://api.kahunas.io";
const DEFAULT_WEB_BASE_URL = "https://kahunas.io";

export const CONFIG_PATH = path.join(os.homedir(), ".config", "kahunas", "config.json");
export const AUTH_PATH = path.join(os.homedir(), ".config", "kahunas", "auth.json");
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

export type ValidAuthConfig = AuthConfig & {
  password: string;
} & ({ username: string } | { email: string });

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
  const missing: string[] = [];
  const hasUsername = typeof auth.username === "string" && auth.username.trim().length > 0;
  const hasEmail = typeof auth.email === "string" && auth.email.trim().length > 0;
  const hasPassword = typeof auth.password === "string" && auth.password.trim().length > 0;

  if (!hasUsername && !hasEmail) {
    missing.push("username or email");
  }
  if (!hasPassword) {
    missing.push("password");
  }

  if (missing.length > 0) {
    throw new Error(`Invalid auth.json at ${AUTH_PATH}. Missing ${missing.join(" and ")}.`);
  }

  return auth as ValidAuthConfig;
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
