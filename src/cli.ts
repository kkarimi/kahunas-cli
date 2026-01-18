#!/usr/bin/env node
import { isFlagEnabled, parseArgs } from "./args";
import { handleCheckins } from "./commands/checkins";
import { handleWorkout } from "./commands/workout";
import { logError } from "./logger";
import { printUsage } from "./usage";

async function main(): Promise<void> {
  const { positionals, options } = parseArgs(process.argv.slice(2));

  if (positionals.length === 0 || isFlagEnabled(options, "help")) {
    printUsage();
    return;
  }

  const command = positionals[0];
  const rest = positionals.slice(1);

  switch (command) {
    case "checkins":
      await handleCheckins(rest, options);
      return;
    case "sync":
      await handleWorkout(["sync", ...rest], options);
      return;
    case "serve":
      await handleWorkout(["serve", ...rest], options);
      return;
    case "workout":
      await handleWorkout(rest, options);
      return;
    case "help":
      printUsage();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(message);
  process.exit(1);
});
