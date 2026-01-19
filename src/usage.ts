import { CONFIG_PATH } from "./config";
import { formatDim, formatHeading, logPlain } from "./logger";

export function printUsage(): void {
  logPlain(
    `${formatHeading("kahunas - CLI for Kahunas API")}\n\nUsage:\n  kahunas checkins list [--raw]\n  kahunas workout list [--raw]\n  kahunas workout pick [--raw]\n  kahunas workout latest [--raw]\n  kahunas workout events [--minimal] [--full] [--debug-preview] [--raw]\n  kahunas workout serve\n  kahunas serve\n  kahunas workout sync\n  kahunas sync\n  kahunas workout program <id> [--raw]\n\n${formatDim("Config:")}\n  ${CONFIG_PATH}`,
  );
}
