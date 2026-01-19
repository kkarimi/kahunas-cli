import { describe, expect, it, vi } from "vitest";
import { runCli } from "../cli";

describe("runCli", () => {
  it("prints usage when no command is provided", async () => {
    const printUsage = vi.fn();
    const parseArgs = vi.fn().mockReturnValue({ positionals: [], options: {} });

    await runCli([], { parseArgs, printUsage, isFlagEnabled: vi.fn() });

    expect(printUsage).toHaveBeenCalledTimes(1);
  });

  it("prints usage when --help is set", async () => {
    const printUsage = vi.fn();
    const parseArgs = vi.fn().mockReturnValue({
      positionals: ["workout"],
      options: { help: "true" },
    });
    const isFlagEnabled = vi.fn().mockReturnValue(true);

    await runCli(["workout", "--help"], { parseArgs, isFlagEnabled, printUsage });

    expect(isFlagEnabled).toHaveBeenCalledWith({ help: "true" }, "help");
    expect(printUsage).toHaveBeenCalledTimes(1);
  });

  it("routes checkins commands", async () => {
    const handleCheckins = vi.fn().mockResolvedValue(undefined);
    const parseArgs = vi.fn().mockReturnValue({
      positionals: ["checkins", "list"],
      options: { raw: "true" },
    });

    await runCli(["checkins", "list", "--raw"], {
      parseArgs,
      isFlagEnabled: vi.fn().mockReturnValue(false),
      handleCheckins,
    });

    expect(handleCheckins).toHaveBeenCalledWith(["list"], { raw: "true" });
  });

  it("routes sync and serve aliases to workout handler", async () => {
    const handleWorkout = vi.fn().mockResolvedValue(undefined);
    const parseArgs = vi
      .fn()
      .mockReturnValueOnce({ positionals: ["sync"], options: {} })
      .mockReturnValueOnce({
        positionals: ["serve", "--debug-preview"],
        options: { "debug-preview": "true" },
      });

    await runCli(["sync"], { parseArgs, isFlagEnabled: vi.fn(), handleWorkout });
    await runCli(["serve", "--debug-preview"], {
      parseArgs,
      isFlagEnabled: vi.fn(),
      handleWorkout,
    });

    expect(handleWorkout).toHaveBeenCalledWith(["sync"], {});
    expect(handleWorkout).toHaveBeenCalledWith(["serve", "--debug-preview"], {
      "debug-preview": "true",
    });
  });

  it("throws on unknown commands", async () => {
    const parseArgs = vi.fn().mockReturnValue({
      positionals: ["nope"],
      options: {},
    });

    await expect(runCli(["nope"], { parseArgs, isFlagEnabled: vi.fn() })).rejects.toThrow(
      "Unknown command: nope",
    );
  });
});
