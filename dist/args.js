"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.isFlagEnabled = isFlagEnabled;
exports.shouldAutoLogin = shouldAutoLogin;
function parseArgs(argv) {
    const positionals = [];
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith("--")) {
            positionals.push(arg);
            continue;
        }
        const trimmed = arg.slice(2);
        const [key, inlineValue] = trimmed.split("=");
        if (inlineValue !== undefined) {
            options[key] = inlineValue;
            continue;
        }
        const next = argv[index + 1];
        if (next && !next.startsWith("--")) {
            options[key] = next;
            index += 1;
            continue;
        }
        options[key] = "true";
    }
    return { positionals, options };
}
function isFlagEnabled(options, name) {
    const value = options[name];
    return value === "true" || value === "1" || value === "yes";
}
function shouldAutoLogin(options, defaultValue) {
    if (isFlagEnabled(options, "auto-login")) {
        return true;
    }
    if (isFlagEnabled(options, "no-auto-login")) {
        return false;
    }
    return defaultValue;
}
