import { beforeEach, describe, expect, it, vi } from "vitest";

const isFlagEnabled = vi.fn();
const readConfig = vi.fn();
const resolveBaseUrl = vi.fn();
const resolveToken = vi.fn();
const writeConfig = vi.fn();

vi.mock("../config", () => ({
  readConfig,
  resolveBaseUrl,
  resolveToken,
  writeConfig
}));

const postJson = vi.fn();

vi.mock("../http", () => ({
  postJson
}));

const printResponse = vi.fn();

vi.mock("../output", () => ({
  printResponse
}));

const extractUserUuidFromCheckins = vi.fn();
const isTokenExpiredResponse = vi.fn();

vi.mock("../responses", () => ({
  extractUserUuidFromCheckins,
  isTokenExpiredResponse
}));

const loginAndPersist = vi.fn();

vi.mock("../auth", () => ({
  loginAndPersist
}));

const printUsage = vi.fn();

vi.mock("../usage", () => ({
  printUsage
}));

const { handleCheckins } = await import("../commands/checkins");

describe("handleCheckins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFlagEnabled.mockReturnValue(false);
    readConfig.mockReturnValue({ userUuid: "user-old" });
    resolveBaseUrl.mockReturnValue("https://api.kahunas.io");
    resolveToken.mockReturnValue("token-1");
    postJson.mockResolvedValue({ ok: true, status: 200, text: "", json: { data: [] } });
    isTokenExpiredResponse.mockReturnValue(false);
    extractUserUuidFromCheckins.mockReturnValue(undefined);
  });

  it("prints usage when action is missing", async () => {
    await handleCheckins([], {});

    expect(printUsage).toHaveBeenCalledTimes(1);
    expect(postJson).not.toHaveBeenCalled();
  });

  it("throws on unknown action", async () => {
    await expect(handleCheckins(["nope"], {})).rejects.toThrow(
      "Unknown checkins action: nope"
    );
  });

  it("logs in when token is missing and updates user uuid", async () => {
    resolveToken.mockReturnValue(undefined);
    loginAndPersist.mockResolvedValue("token-2");
    extractUserUuidFromCheckins.mockReturnValue("user-new");

    await handleCheckins(["list"], {});

    expect(loginAndPersist).toHaveBeenCalledTimes(1);
    expect(postJson).toHaveBeenCalledWith(
      "/api/v2/checkin/list",
      "token-2",
      "https://api.kahunas.io",
      { page: 1, rpp: 12 }
    );
    expect(writeConfig).toHaveBeenCalledWith({ userUuid: "user-new" });
    expect(printResponse).toHaveBeenCalledTimes(1);
  });

  it("retries when the token is expired", async () => {
    resolveToken.mockReturnValue("token-1");
    loginAndPersist.mockResolvedValue("token-2");
    isTokenExpiredResponse.mockReturnValueOnce(true).mockReturnValueOnce(false);

    await handleCheckins(["list"], {});

    expect(postJson).toHaveBeenCalledTimes(2);
    expect(postJson.mock.calls[0]?.[1]).toBe("token-1");
    expect(postJson.mock.calls[1]?.[1]).toBe("token-2");
  });
});
