import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("workout sync flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    readConfig.mockReturnValue({});
    readAuthConfig.mockReturnValue(undefined);
    resolveToken.mockReturnValue(undefined);
    resolveBaseUrl.mockReturnValue("https://api.kahunas.io");
    resolveWebBaseUrl.mockReturnValue("https://kahunas.io");
    writeWorkoutCache.mockReturnValue({ updatedAt: "2026-01-01T00:00:00.000Z", plans: [] });
  });

  afterAll(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
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

    expect(writeAuthConfig).not.toHaveBeenCalled();
  });
});
