import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();

const fsMock = {
  existsSync: vi.fn((filePath: string) => files.has(filePath)),
  readFileSync: vi.fn((filePath: string) => {
    const value = files.get(filePath);
    if (value === undefined) {
      throw new Error(`Missing ${filePath}`);
    }
    return value;
  }),
  writeFileSync: vi.fn((filePath: string, contents: string) => {
    files.set(filePath, contents);
  }),
  mkdirSync: vi.fn()
};

vi.mock("node:fs", () => fsMock);
vi.mock("node:os", () => ({
  homedir: () => "/home/tester"
}));

const configModule = await import("../config");

const {
  AUTH_PATH,
  CONFIG_PATH,
  readAuthConfig,
  readConfig,
  validateAuthConfig,
  writeAuthConfig,
  writeConfig
} = configModule;

describe("config helpers", () => {
  beforeEach(() => {
    files.clear();
    vi.clearAllMocks();
  });

  it("returns empty config when file is missing", () => {
    expect(readConfig()).toEqual({});
  });

  it("throws when config JSON is invalid", () => {
    files.set(CONFIG_PATH, "{bad json}");
    expect(() => readConfig()).toThrow(`Invalid JSON in ${CONFIG_PATH}.`);
  });

  it("returns undefined when auth config is missing", () => {
    expect(readAuthConfig()).toBeUndefined();
  });

  it("throws when auth JSON is invalid", () => {
    files.set(AUTH_PATH, "{bad json}");
    expect(() => readAuthConfig()).toThrow(`Invalid JSON in ${AUTH_PATH}.`);
  });

  it("requires username or email in auth config", () => {
    expect(() => validateAuthConfig({ password: "secret" })).toThrow(
      `Invalid auth.json at ${AUTH_PATH}. Missing username or email.`
    );
  });

  it("requires password in auth config", () => {
    expect(() => validateAuthConfig({ username: "user" })).toThrow(
      `Invalid auth.json at ${AUTH_PATH}. Missing password.`
    );
  });

  it("writes config files with formatted JSON", () => {
    writeConfig({ token: "t1" });
    writeAuthConfig({ email: "user@example.com", password: "secret" });

    expect(fsMock.mkdirSync).toHaveBeenCalledTimes(2);
    expect(files.get(CONFIG_PATH)).toBe(`{\n  \"token\": \"t1\"\n}\n`);
    expect(files.get(AUTH_PATH)).toBe(`{\n  \"email\": \"user@example.com\",\n  \"password\": \"secret\"\n}\n`);
  });
});
