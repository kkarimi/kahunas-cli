import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readConfig = vi.fn();
const readAuthConfig = vi.fn();
const writeAuthConfig = vi.fn();
const writeConfig = vi.fn();
const writeWorkoutCache = vi.fn();
const resolveToken = vi.fn();
const resolveBaseUrl = vi.fn();
const resolveCsrfToken = vi.fn();
const resolveCsrfCookie = vi.fn();
const resolveAuthCookie = vi.fn();
const resolveUserUuid = vi.fn();
const resolveWebBaseUrl = vi.fn();

vi.mock("../config", () => ({
  AUTH_PATH: "/tmp/kahunas/auth.json",
  CONFIG_PATH: "/tmp/kahunas/config.json",
  WORKOUT_CACHE_PATH: "/tmp/kahunas/workouts.json",
  readConfig,
  readAuthConfig,
  writeAuthConfig,
  writeConfig,
  writeWorkoutCache,
  readWorkoutCache: vi.fn(),
  resolveToken,
  resolveBaseUrl,
  resolveCsrfToken,
  resolveCsrfCookie,
  resolveAuthCookie,
  resolveUserUuid,
  resolveWebBaseUrl
}));

const postJson = vi.fn();

vi.mock("../http", () => ({
  postJson
}));

const captureWorkoutsFromBrowser = vi.fn();

vi.mock("../auth", () => ({
  captureWorkoutsFromBrowser,
  loginAndPersist: vi.fn()
}));

const askQuestion = vi.fn();
const askHiddenQuestion = vi.fn();

vi.mock("../utils", () => ({
  askQuestion,
  askHiddenQuestion,
  debugLog: vi.fn(),
  waitForEnter: vi.fn()
}));

const { handleWorkout } = await import("../commands/workout");

const originalIsTTY = process.stdin.isTTY;
const originalStdoutIsTTY = process.stdout.isTTY;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

describe("workout sync flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    readConfig.mockReturnValue({});
    readAuthConfig.mockReturnValue(undefined);
    resolveToken.mockReturnValue(undefined);
    resolveBaseUrl.mockReturnValue("https://api.kahunas.io");
    resolveWebBaseUrl.mockReturnValue("https://kahunas.io");
    resolveUserUuid.mockReturnValue("user-uuid");
    writeWorkoutCache.mockReturnValue({
      updatedAt: "2026-01-01T00:00:00.000Z",
      plans: [],
      events: null
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  afterAll(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: originalStdoutIsTTY, configurable: true });
  });

  it("prompts for credentials and writes auth after successful capture", async () => {
    askQuestion.mockResolvedValueOnce("user@example.com").mockResolvedValueOnce("n");
    askHiddenQuestion.mockResolvedValueOnce("secret");
    captureWorkoutsFromBrowser.mockResolvedValue({
      plans: [],
      token: "header.payload.signature",
      webBaseUrl: "https://kahunas.io"
    });

    await handleWorkout(["sync"], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
      message: "Workout programs synced",
      cache: {
        updated_at: "2026-01-01T00:00:00.000Z",
        count: 0,
        path: "/tmp/kahunas/workouts.json",
        data: {
          updatedAt: "2026-01-01T00:00:00.000Z",
          plans: [],
          events: null
        }
      }
    });
    expect(errorSpy).toHaveBeenCalledWith("Saved credentials to /tmp/kahunas/auth.json");
    expect(captureWorkoutsFromBrowser).toHaveBeenCalledTimes(1);
    expect(captureWorkoutsFromBrowser.mock.calls[0][2]).toEqual({
      email: "user@example.com",
      username: undefined,
      password: "secret"
    });
    expect(writeAuthConfig).toHaveBeenCalledWith({
      email: "user@example.com",
      username: undefined,
      password: "secret"
    });
    expect(writeAuthConfig.mock.invocationCallOrder[0]).toBeGreaterThan(
      captureWorkoutsFromBrowser.mock.invocationCallOrder[0]
    );
  });

  it("does not write auth when capture has no token", async () => {
    askQuestion.mockResolvedValueOnce("user@example.com").mockResolvedValueOnce("n");
    askHiddenQuestion.mockResolvedValueOnce("secret");
    captureWorkoutsFromBrowser.mockResolvedValue({
      plans: [],
      token: undefined,
      webBaseUrl: "https://kahunas.io"
    });

    await handleWorkout(["sync"], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
      message: "Workout programs synced",
      cache: {
        updated_at: "2026-01-01T00:00:00.000Z",
        count: 0,
        path: "/tmp/kahunas/workouts.json",
        data: {
          updatedAt: "2026-01-01T00:00:00.000Z",
          plans: [],
          events: null
        }
      }
    });
    expect(writeAuthConfig).not.toHaveBeenCalled();
  });

  it("does not log credentials when --raw is set", async () => {
    askQuestion.mockResolvedValueOnce("user@example.com").mockResolvedValueOnce("n");
    askHiddenQuestion.mockResolvedValueOnce("secret");
    captureWorkoutsFromBrowser.mockResolvedValue({
      plans: [],
      token: "header.payload.signature",
      webBaseUrl: "https://kahunas.io"
    });

    await handleWorkout(["sync"], { raw: "true" });

    expect(errorSpy).not.toHaveBeenCalledWith("Saved credentials to /tmp/kahunas/auth.json");
  });
});
