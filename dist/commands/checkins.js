"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCheckins = handleCheckins;
const args_1 = require("../args");
const config_1 = require("../config");
const http_1 = require("../http");
const output_1 = require("../output");
const responses_1 = require("../responses");
const utils_1 = require("../utils");
const auth_1 = require("../auth");
const usage_1 = require("../usage");
async function handleCheckins(positionals, options) {
    const action = positionals[0];
    if (!action || action === "help") {
        (0, usage_1.printUsage)();
        return;
    }
    if (action !== "list") {
        throw new Error(`Unknown checkins action: ${action}`);
    }
    const config = (0, config_1.readConfig)();
    const autoLogin = (0, args_1.shouldAutoLogin)(options, true);
    let token = (0, config_1.resolveToken)(options, config);
    if (!token) {
        if (autoLogin) {
            token = await (0, auth_1.loginAndPersist)(options, config, "silent");
        }
        else {
            throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth login'.");
        }
    }
    const baseUrl = (0, config_1.resolveBaseUrl)(options, config);
    const page = (0, utils_1.parseNumber)(options.page, 1);
    const rpp = (0, utils_1.parseNumber)(options.rpp, 12);
    const rawOutput = (0, args_1.isFlagEnabled)(options, "raw");
    let response = await (0, http_1.postJson)("/api/v2/checkin/list", token, baseUrl, { page, rpp });
    if (autoLogin && (0, responses_1.isTokenExpiredResponse)(response.json)) {
        token = await (0, auth_1.loginAndPersist)(options, config, "silent");
        response = await (0, http_1.postJson)("/api/v2/checkin/list", token, baseUrl, { page, rpp });
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.text}`);
    }
    const userUuid = (0, responses_1.extractUserUuidFromCheckins)(response.json);
    if (userUuid && userUuid !== config.userUuid) {
        (0, config_1.writeConfig)({ ...config, userUuid });
    }
    (0, output_1.printResponse)(response, rawOutput);
}
