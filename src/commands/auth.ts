import { isFlagEnabled, shouldAutoLogin } from "../args";
import {
  CONFIG_PATH,
  readConfig,
  resolveAuthCookie,
  resolveBaseUrl,
  resolveCsrfCookie,
  resolveCsrfToken,
  resolveToken,
  resolveWebBaseUrl,
  writeConfig
} from "../config";
import { fetchAuthToken, postJson } from "../http";
import { isTokenExpiredResponse } from "../responses";
import { isLikelyAuthToken } from "../tokens";
import { loginAndPersist } from "../auth";
import { printUsage } from "../usage";

export async function handleAuth(
  positionals: string[],
  options: Record<string, string>
): Promise<void> {
  const action = positionals[0];
  if (!action || action === "help") {
    printUsage();
    return;
  }

  if (action === "set") {
    const token = positionals[1] ?? options.token;
    if (!token) {
      throw new Error("Missing token for auth set.");
    }
    const config = readConfig();
    const baseUrl = resolveBaseUrl(options, config);
    const csrfToken = resolveCsrfToken(options, config);
    const webBaseUrl = resolveWebBaseUrl(options, config);
    const authCookie = resolveAuthCookie(options, config);
    const csrfCookie = resolveCsrfCookie(options, config);
    writeConfig({
      ...config,
      token,
      baseUrl,
      csrfToken,
      webBaseUrl,
      authCookie,
      csrfCookie
    });
    console.log(`Saved token to ${CONFIG_PATH}`);
    return;
  }

  if (action === "token") {
    const config = readConfig();
    const csrfToken = resolveCsrfToken(options, config);
    if (!csrfToken) {
      throw new Error("Missing CSRF token. Provide --csrf or set KAHUNAS_CSRF.");
    }

    const webBaseUrl = resolveWebBaseUrl(options, config);
    const authCookie = resolveAuthCookie(options, config);
    const csrfCookie = resolveCsrfCookie(options, config);
    const cookieToken = csrfCookie ?? csrfToken;
    const cookieHeader = authCookie ?? `csrf_kahunas_cookie_token=${cookieToken}`;
    const rawOutput = isFlagEnabled(options, "raw");
    const { token: extractedToken, raw } = await fetchAuthToken(
      csrfToken,
      cookieHeader,
      webBaseUrl
    );
    const token = extractedToken && isLikelyAuthToken(extractedToken) ? extractedToken : undefined;

    if (rawOutput) {
      console.log(raw);
      return;
    }

    if (!token) {
      console.log(raw);
      return;
    }

    const nextConfig = {
      ...config,
      token,
      csrfToken,
      webBaseUrl
    };
    if (authCookie) {
      nextConfig.authCookie = authCookie;
    }
    if (csrfCookie) {
      nextConfig.csrfCookie = csrfCookie;
    }
    writeConfig(nextConfig);
    console.log(token);
    return;
  }

  if (action === "login") {
    const config = readConfig();
    const rawOutput = isFlagEnabled(options, "raw");
    const outputMode = rawOutput ? "raw" : "token";
    await loginAndPersist(options, config, outputMode);
    return;
  }

  if (action === "status") {
    const config = readConfig();
    const autoLogin = shouldAutoLogin(options, false);
    let token = resolveToken(options, config);
    if (!token) {
      if (autoLogin) {
        token = await loginAndPersist(options, config, "silent");
      } else {
        throw new Error("Missing auth token. Set KAHUNAS_TOKEN or run 'kahunas auth login'.");
      }
    }

    const baseUrl = resolveBaseUrl(options, config);
    let response = await postJson("/api/v2/checkin/list", token, baseUrl, { page: 1, rpp: 1 });
    if (autoLogin && isTokenExpiredResponse(response.json)) {
      token = await loginAndPersist(options, config, "silent");
      response = await postJson("/api/v2/checkin/list", token, baseUrl, { page: 1, rpp: 1 });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.text}`);
    }

    if (response.json === undefined) {
      console.log("unknown");
      return;
    }

    console.log(isTokenExpiredResponse(response.json) ? "expired" : "valid");
    return;
  }

  if (action === "show") {
    const config = readConfig();
    if (!config.token) {
      throw new Error("No token saved. Use 'kahunas auth set <token>' or set KAHUNAS_TOKEN.");
    }
    console.log(config.token);
    return;
  }

  throw new Error(`Unknown auth action: ${action}`);
}
