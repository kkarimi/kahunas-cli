import { describe, expect, it } from "vitest";
import { enrichWorkoutEvents, filterWorkoutEvents, sortWorkoutEvents } from "../events";

describe("filterWorkoutEvents", () => {
  it("filters by program and workout", () => {
    const payload = [
      { id: 1, program: "p1", workout: "w1" },
      { id: 2, program: "p2", workout: "w2" }
    ];
    expect(filterWorkoutEvents(payload, "p1")).toEqual([{ id: 1, program: "p1", workout: "w1" }]);
    expect(filterWorkoutEvents(payload, undefined, "w2")).toEqual([
      { id: 2, program: "p2", workout: "w2" }
    ]);
  });
});

describe("sortWorkoutEvents", () => {
  it("sorts by start time ascending", () => {
    const events = [
      { id: 1, start: "2025-01-02 10:00:00" },
      { id: 2, start: "2025-01-01 10:00:00" }
    ];
    const sorted = sortWorkoutEvents(events);
    expect(sorted.map((event) => event.id)).toEqual([2, 1]);
  });
});

describe("enrichWorkoutEvents", () => {
  it("adds program_details from lookup", () => {
    const events = [{ id: 1, program: "p1" }];
    const enriched = enrichWorkoutEvents(events, { p1: { title: "Program" } });
    expect(enriched[0]).toMatchObject({
      id: 1,
      program: "p1",
      program_details: { title: "Program" }
    });
  });
});
