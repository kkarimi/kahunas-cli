"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printResponse = printResponse;
function printResponse(response, rawOutput) {
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
