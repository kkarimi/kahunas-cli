"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKOUT_CACHE_PATH = exports.CONFIG_PATH = void 0;
exports.readConfig = readConfig;
exports.writeConfig = writeConfig;
exports.readWorkoutCache = readWorkoutCache;
exports.writeWorkoutCache = writeWorkoutCache;
exports.resolveToken = resolveToken;
exports.resolveCsrfToken = resolveCsrfToken;
exports.resolveCsrfCookie = resolveCsrfCookie;
exports.resolveAuthCookie = resolveAuthCookie;
exports.resolveUserUuid = resolveUserUuid;
exports.resolveBaseUrl = resolveBaseUrl;
exports.resolveWebBaseUrl = resolveWebBaseUrl;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const DEFAULT_BASE_URL = "https://api.kahunas.io";
const DEFAULT_WEB_BASE_URL = "https://kahunas.io";
exports.CONFIG_PATH = path.join(os.homedir(), ".config", "kahunas", "config.json");
exports.WORKOUT_CACHE_PATH = path.join(os.homedir(), ".config", "kahunas", "workouts.json");
function readConfig() {
    if (!fs.existsSync(exports.CONFIG_PATH)) {
        return {};
    }
    const raw = fs.readFileSync(exports.CONFIG_PATH, "utf-8");
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error(`Invalid JSON in ${exports.CONFIG_PATH}.`);
    }
}
function writeConfig(config) {
    const dir = path.dirname(exports.CONFIG_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(exports.CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}
function readWorkoutCache() {
    if (!fs.existsSync(exports.WORKOUT_CACHE_PATH)) {
        return undefined;
    }
    const raw = fs.readFileSync(exports.WORKOUT_CACHE_PATH, "utf-8");
    try {
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
function writeWorkoutCache(plans) {
    const dir = path.dirname(exports.WORKOUT_CACHE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const cache = { updatedAt: new Date().toISOString(), plans };
    fs.writeFileSync(exports.WORKOUT_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
    return cache;
}
function resolveToken(options, config) {
    return options.token ?? process.env.KAHUNAS_TOKEN ?? config.token;
}
function resolveCsrfToken(options, config) {
    return options.csrf ?? process.env.KAHUNAS_CSRF ?? config.csrfToken;
}
function resolveCsrfCookie(options, config) {
    return options["csrf-cookie"] ?? process.env.KAHUNAS_CSRF_COOKIE ?? config.csrfCookie;
}
function resolveAuthCookie(options, config) {
    return options.cookie ?? process.env.KAHUNAS_COOKIE ?? config.authCookie;
}
function resolveUserUuid(options, config) {
    return options.user ?? process.env.KAHUNAS_USER_UUID ?? config.userUuid;
}
function resolveBaseUrl(options, config) {
    return options["base-url"] ?? config.baseUrl ?? DEFAULT_BASE_URL;
}
function resolveWebBaseUrl(options, config) {
    return (options["web-base-url"] ??
        process.env.KAHUNAS_WEB_BASE_URL ??
        config.webBaseUrl ??
        DEFAULT_WEB_BASE_URL);
}
