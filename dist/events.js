"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterWorkoutEvents = filterWorkoutEvents;
exports.sortWorkoutEvents = sortWorkoutEvents;
exports.enrichWorkoutEvents = enrichWorkoutEvents;
function filterWorkoutEvents(payload, programFilter, workoutFilter) {
    if (!Array.isArray(payload)) {
        return [];
    }
    return payload.filter((entry) => {
        if (!entry || typeof entry !== "object") {
            return false;
        }
        const record = entry;
        if (programFilter && record.program !== programFilter) {
            return false;
        }
        if (workoutFilter && record.workout !== workoutFilter) {
            return false;
        }
        return true;
    });
}
function sortWorkoutEvents(events) {
    return [...events].sort((a, b) => {
        const aStart = typeof a.start === "string" ? Date.parse(a.start.replace(" ", "T")) : 0;
        const bStart = typeof b.start === "string" ? Date.parse(b.start.replace(" ", "T")) : 0;
        return aStart - bStart;
    });
}
function enrichWorkoutEvents(events, programDetails) {
    return events.map((entry) => {
        if (!entry || typeof entry !== "object") {
            return entry;
        }
        const record = entry;
        const programUuid = typeof record.program === "string" ? record.program : undefined;
        const program = programUuid ? programDetails[programUuid] : undefined;
        return {
            ...record,
            program_details: program ?? null
        };
    });
}
