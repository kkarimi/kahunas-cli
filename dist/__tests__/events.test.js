"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const events_1 = require("../events");
(0, vitest_1.describe)("filterWorkoutEvents", () => {
    (0, vitest_1.it)("filters by program and workout", () => {
        const payload = [
            { id: 1, program: "p1", workout: "w1" },
            { id: 2, program: "p2", workout: "w2" }
        ];
        (0, vitest_1.expect)((0, events_1.filterWorkoutEvents)(payload, "p1")).toEqual([{ id: 1, program: "p1", workout: "w1" }]);
        (0, vitest_1.expect)((0, events_1.filterWorkoutEvents)(payload, undefined, "w2")).toEqual([
            { id: 2, program: "p2", workout: "w2" }
        ]);
    });
});
(0, vitest_1.describe)("sortWorkoutEvents", () => {
    (0, vitest_1.it)("sorts by start time ascending", () => {
        const events = [
            { id: 1, start: "2025-01-02 10:00:00" },
            { id: 2, start: "2025-01-01 10:00:00" }
        ];
        const sorted = (0, events_1.sortWorkoutEvents)(events);
        (0, vitest_1.expect)(sorted.map((event) => event.id)).toEqual([2, 1]);
    });
});
(0, vitest_1.describe)("enrichWorkoutEvents", () => {
    (0, vitest_1.it)("adds program_details from lookup", () => {
        const events = [{ id: 1, program: "p1" }];
        const enriched = (0, events_1.enrichWorkoutEvents)(events, { p1: { title: "Program" } });
        (0, vitest_1.expect)(enriched[0]).toMatchObject({
            id: 1,
            program: "p1",
            program_details: { title: "Program" }
        });
    });
});
