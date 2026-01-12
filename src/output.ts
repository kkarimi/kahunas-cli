import type { ApiResponse } from "./http";

export function printResponse(response: ApiResponse, rawOutput: boolean): void {
  if (rawOutput) {
    console.log(response.text);
    return;
  }

  if (response.json !== undefined) {
    console.log(JSON.stringify(response.json, null, 2));
    return;
  }

  console.log(response.text);
}
