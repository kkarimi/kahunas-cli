import pc from "picocolors";

type ColorFn = (input: string) => string;

function formatLabel(label: string, color: ColorFn): string {
  return pc.bold(color(label));
}

export function logInfo(message: string): void {
  console.log(`${formatLabel("info", pc.cyan)} ${message}`);
}

export function logWarn(message: string): void {
  console.warn(`${formatLabel("warn", pc.yellow)} ${message}`);
}

export function logError(message: string): void {
  console.error(`${formatLabel("error", pc.red)} ${message}`);
}

export function logDebug(enabled: boolean, message: string): void {
  if (!enabled) {
    return;
  }
  console.error(`${formatLabel("debug", pc.gray)} ${message}`);
}

export function logPlain(message: string): void {
  console.log(message);
}

export function formatHeading(message: string): string {
  return pc.bold(message);
}

export function formatDim(message: string): string {
  return pc.dim(message);
}
