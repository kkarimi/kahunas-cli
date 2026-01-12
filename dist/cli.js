#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const args_1 = require("./args");
const auth_1 = require("./commands/auth");
const checkins_1 = require("./commands/checkins");
const workout_1 = require("./commands/workout");
const usage_1 = require("./usage");
async function main() {
    const { positionals, options } = (0, args_1.parseArgs)(process.argv.slice(2));
    if (positionals.length === 0 || (0, args_1.isFlagEnabled)(options, "help")) {
        (0, usage_1.printUsage)();
        return;
    }
    const command = positionals[0];
    const rest = positionals.slice(1);
    switch (command) {
        case "auth":
            await (0, auth_1.handleAuth)(rest, options);
            return;
        case "checkins":
            await (0, checkins_1.handleCheckins)(rest, options);
            return;
        case "workout":
            await (0, workout_1.handleWorkout)(rest, options);
            return;
        case "help":
            (0, usage_1.printUsage)();
            return;
        default:
            throw new Error(`Unknown command: ${command}`);
    }
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
});
