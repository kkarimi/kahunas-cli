#!/usr/bin/env node
import { isFlagEnabled, parseArgs } from "./args";
import { handleCheckins } from "./commands/checkins";
import { handleWorkout } from "./commands/workout";
import { logError } from "./logger";
import { printUsage } from "./usage";

type RunCliDeps = {
  parseArgs?: typeof parseArgs;
  isFlagEnabled?: typeof isFlagEnabled;
  handleCheckins?: typeof handleCheckins;
  handleWorkout?: typeof handleWorkout;
  printUsage?: typeof printUsage;
  logError?: typeof logError;
};

export async function runCli(argv: string[], deps: RunCliDeps = {}): Promise<void> {
  const {
    parseArgs: parseArgsImpl = parseArgs,
    isFlagEnabled: isFlagEnabledImpl = isFlagEnabled,
    handleCheckins: handleCheckinsImpl = handleCheckins,
    handleWorkout: handleWorkoutImpl = handleWorkout,
    printUsage: printUsageImpl = printUsage,
  } = deps;

  const { positionals, options } = parseArgsImpl(argv);

  if (positionals.length === 0 || isFlagEnabledImpl(options, "help")) {
    printUsageImpl();
    return;
  }

  const command = positionals[0];
  const rest = positionals.slice(1);

  switch (command) {
    case "checkins":
      await handleCheckinsImpl(rest, options);
      return;
    case "sync":
      await handleWorkoutImpl(["sync", ...rest], options);
      return;
    case "serve":
      await handleWorkoutImpl(["serve", ...rest], options);
      return;
    case "workout":
      await handleWorkoutImpl(rest, options);
      return;
    case "help":
      printUsageImpl();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function main(): Promise<void> {
  await runCli(process.argv.slice(2));
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logError(message);
    process.exit(1);
  });
}
