import * as readline from "node:readline";
import { logDebug } from "./logger";

export function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

export function askQuestion(
  prompt: string,
  output: NodeJS.WritableStream = process.stdout
): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function waitForEnter(
  prompt: string,
  output: NodeJS.WritableStream = process.stdout
): Promise<void> {
  return askQuestion(prompt, output).then(() => undefined);
}

export function debugLog(enabled: boolean, message: string): void {
  logDebug(enabled, message);
}
