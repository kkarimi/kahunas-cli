import { isFlagEnabled } from "../args";
import { readConfig, resolveBaseUrl, resolveToken, writeConfig } from "../config";
import { postJson } from "../http";
import { printResponse } from "../output";
import { extractUserUuidFromCheckins, isTokenExpiredResponse } from "../responses";
import { loginAndPersist } from "../auth";
import { printUsage } from "../usage";

export async function handleCheckins(
  positionals: string[],
  options: Record<string, string>
): Promise<void> {
  const action = positionals[0];
  if (!action || action === "help") {
    printUsage();
    return;
  }

  if (action !== "list") {
    throw new Error(`Unknown checkins action: ${action}`);
  }

  const config = readConfig();
  const autoLogin = true;
  let token = resolveToken(options, config);
  if (!token) {
    if (autoLogin) {
      token = await loginAndPersist(options, config, "silent");
    } else {
      throw new Error(
        "Missing auth token. Run 'kahunas workout sync' to refresh login, then try again."
      );
    }
  }

  const baseUrl = resolveBaseUrl(options, config);
  const page = 1;
  const rpp = 12;
  const rawOutput = isFlagEnabled(options, "raw");

  let response = await postJson("/api/v2/checkin/list", token, baseUrl, { page, rpp });
  if (autoLogin && isTokenExpiredResponse(response.json)) {
    token = await loginAndPersist(options, config, "silent");
    response = await postJson("/api/v2/checkin/list", token, baseUrl, { page, rpp });
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.text}`);
  }

  const userUuid = extractUserUuidFromCheckins(response.json);
  if (userUuid && userUuid !== config.userUuid) {
    writeConfig({ ...config, userUuid });
  }

  printResponse(response, rawOutput);
}
