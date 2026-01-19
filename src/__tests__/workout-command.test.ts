import { beforeEach, describe, expect, it, vi } from "vitest";

const isFlagEnabled = vi.fn();

vi.mock("../args", () => ({
  isFlagEnabled,
}));

const readConfig = vi.fn();
const readAuthConfig = vi.fn();
const readWorkoutCache = vi.fn();
const resolveAuthCookie = vi.fn();
const resolveBaseUrl = vi.fn();
const resolveCsrfCookie = vi.fn();
const resolveCsrfToken = vi.fn();
const resolveToken = vi.fn();
const resolveUserUuid = vi.fn();
const resolveWebBaseUrl = vi.fn();
const writeConfig = vi.fn();
const writeAuthConfig = vi.fn();
const writeWorkoutCache = vi.fn();

vi.mock("../config", () => ({
  AUTH_PATH: "/tmp/kahunas/auth.json",
  CONFIG_PATH: "/tmp/kahunas/config.json",
  WORKOUT_CACHE_PATH: "/tmp/kahunas/workouts.json",
  readConfig,
  readAuthConfig,
  readWorkoutCache,
  resolveAuthCookie,
  resolveBaseUrl,
  resolveCsrfCookie,
  resolveCsrfToken,
  resolveToken,
  resolveUserUuid,
  resolveWebBaseUrl,
  writeConfig,
  writeAuthConfig,
  writeWorkoutCache,
}));

const fetchWorkoutProgram = vi.fn();
const getWithAuth = vi.fn();
const parseJsonText = vi.fn();
const postJson = vi.fn();

vi.mock("../http", () => ({
  fetchWorkoutProgram,
  getWithAuth,
  parseJsonText,
  postJson,
}));

const formatHeading = vi.fn();
const logInfo = vi.fn();
const logPlain = vi.fn();

vi.mock("../logger", () => ({
  formatHeading,
  logInfo,
  logPlain,
}));

const printResponse = vi.fn();

vi.mock("../output", () => ({
  printResponse,
}));

const extractUserUuidFromCheckins = vi.fn();
const isTokenExpiredResponse = vi.fn();

vi.mock("../responses", () => ({
  extractUserUuidFromCheckins,
  isTokenExpiredResponse,
}));

const isLikelyLoginHtml = vi.fn();
const resolveTokenExpiry = vi.fn();

vi.mock("../tokens", () => ({
  isLikelyLoginHtml,
  resolveTokenExpiry,
}));

const askHiddenQuestion = vi.fn();
const askQuestion = vi.fn();
const debugLog = vi.fn();

vi.mock("../utils", () => ({
  askHiddenQuestion,
  askQuestion,
  debugLog,
}));

const buildWorkoutPlanIndex = vi.fn();
const extractWorkoutPlans = vi.fn();
const formatWorkoutSummary = vi.fn();
const mergeWorkoutPlans = vi.fn();
const pickLatestWorkout = vi.fn();

vi.mock("../workouts", () => ({
  buildWorkoutPlanIndex,
  extractWorkoutPlans,
  formatWorkoutSummary,
  mergeWorkoutPlans,
  pickLatestWorkout,
}));

const captureWorkoutsFromBrowser = vi.fn();
const loginAndPersist = vi.fn();

vi.mock("../auth", () => ({
  captureWorkoutsFromBrowser,
  loginAndPersist,
}));

const renderWorkoutPage = vi.fn();

vi.mock("../server/workout-view", () => ({
  renderWorkoutPage,
}));

const printUsage = vi.fn();

vi.mock("../usage", () => ({
  printUsage,
}));

const { handleWorkout } = await import("../commands/workout");

describe("handleWorkout", () => {
  const responseOk = { ok: true, status: 200, text: "", json: { data: [] } };
  const plan = { uuid: "p1", title: "Plan 1" };

  beforeEach(() => {
    vi.clearAllMocks();
    readConfig.mockReturnValue({});
    readAuthConfig.mockReturnValue(undefined);
    readWorkoutCache.mockReturnValue(undefined);
    resolveToken.mockReturnValue("token-1");
    resolveBaseUrl.mockReturnValue("https://api.kahunas.io");
    resolveWebBaseUrl.mockReturnValue("https://kahunas.io");
    getWithAuth.mockResolvedValue(responseOk);
    fetchWorkoutProgram.mockResolvedValue(responseOk);
    extractWorkoutPlans.mockReturnValue([plan]);
    mergeWorkoutPlans.mockImplementation((fresh) => fresh);
    pickLatestWorkout.mockReturnValue(plan);
    isTokenExpiredResponse.mockReturnValue(false);
    isFlagEnabled.mockReturnValue(false);
    formatWorkoutSummary.mockReturnValue("Plan 1 (p1)");
  });

  it("prints usage when action is missing", async () => {
    await handleWorkout([], {});

    expect(printUsage).toHaveBeenCalledTimes(1);
  });

  it("lists workouts with raw output", async () => {
    isFlagEnabled.mockReturnValue(true);

    await handleWorkout(["list"], { raw: "true" });

    expect(printResponse).toHaveBeenCalledWith(responseOk, true);
  });

  it("lists workouts with cache metadata when not raw", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    readWorkoutCache.mockReturnValue({ updatedAt: "2026-01-01T00:00:00.000Z", plans: [plan] });

    await handleWorkout(["list"], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(payload.source).toBe("api+cache");
    expect((payload.cache as Record<string, unknown>).path).toBe("/tmp/kahunas/workouts.json");
    expect((payload.data as Record<string, unknown>).workout_plan).toEqual([plan]);

    logSpy.mockRestore();
  });

  it("throws when pick selection is invalid", async () => {
    askQuestion.mockResolvedValue("99");

    await expect(handleWorkout(["pick"], {})).rejects.toThrow("Invalid selection.");
  });

  it("throws when latest has no plans", async () => {
    extractWorkoutPlans.mockReturnValue([]);
    mergeWorkoutPlans.mockReturnValue([]);

    await expect(handleWorkout(["latest"], {})).rejects.toThrow("No workout programs found.");
  });

  it("throws when program id is missing", async () => {
    await expect(handleWorkout(["program"], {})).rejects.toThrow("Missing workout program id.");
  });
});
