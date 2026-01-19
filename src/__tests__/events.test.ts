import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  annotateWorkoutEventSummaries,
  enrichWorkoutEvents,
  filterWorkoutEvents,
  formatWorkoutEventsOutput,
  parseWorkoutDayPreview,
  sortWorkoutEvents,
} from "../events";

describe("filterWorkoutEvents", () => {
  it("filters by program and workout", () => {
    const payload = [
      { id: 1, program: "p1", workout: "w1" },
      { id: 2, program: "p2", workout: "w2" },
    ];
    expect(filterWorkoutEvents(payload, "p1")).toEqual([{ id: 1, program: "p1", workout: "w1" }]);
    expect(filterWorkoutEvents(payload, undefined, "w2")).toEqual([
      { id: 2, program: "p2", workout: "w2" },
    ]);
  });
});

describe("sortWorkoutEvents", () => {
  it("sorts by start time ascending", () => {
    const events = [
      { id: 1, start: "2025-01-02 10:00:00" },
      { id: 2, start: "2025-01-01 10:00:00" },
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
      program_details: { title: "Program" },
    });
  });
});

describe("parseWorkoutDayPreview", () => {
  it("parses volume sets and sections", () => {
    const html = readFileSync(
      new URL("./fixtures/workout-day-preview.html", import.meta.url),
      "utf8",
    );
    const summary = parseWorkoutDayPreview(html, 0);
    expect(summary).not.toBeNull();
    expect(summary?.total_volume_sets).toEqual([
      { body_part: "Upper Back", sets: 7.5 },
      { body_part: "Biceps", sets: 3 },
    ]);
    expect(summary?.sections).toHaveLength(2);
    expect(summary?.sections[0].label).toBe("Warm Up");
    expect(summary?.sections[1].label).toBe("Workout");
    const workoutGroups = summary?.sections[1].groups ?? [];
    expect(workoutGroups).toHaveLength(3);
    expect(workoutGroups[0].type).toBe("straight");
    expect(workoutGroups[1].type).toBe("superset");
    expect(workoutGroups[2].type).toBe("superset");
  });

  it("parses body parts and time-based exercises", () => {
    const html = readFileSync(
      new URL("./fixtures/workout-day-preview.html", import.meta.url),
      "utf8",
    );
    const summary = parseWorkoutDayPreview(html, 0);
    const workoutGroups = summary?.sections[1].groups ?? [];
    const firstExercise = workoutGroups[0]?.exercises[0];
    expect(firstExercise?.body_parts).toEqual([{ name: "Back", volume: 1 }]);
    const supersetExercise = workoutGroups[1]?.exercises[1];
    expect(supersetExercise?.time_seconds).toBe(30);
    expect(supersetExercise?.rest_seconds).toBe(0);
    const secondSupersetExercise = workoutGroups[2]?.exercises[1];
    expect(secondSupersetExercise?.time_seconds).toBe(60);
    expect(secondSupersetExercise?.rest_seconds).toBe(15);
  });

  it("uses the display-block day when no index is provided", () => {
    const html = readFileSync(
      new URL("./fixtures/workout-day-preview.html", import.meta.url),
      "utf8",
    );
    const summary = parseWorkoutDayPreview(html);
    expect(summary?.total_volume_sets[0]?.body_part).toBe("Upper Back");
  });
});

describe("formatWorkoutEventsOutput", () => {
  it("formats events with preview summaries", () => {
    const html = readFileSync(
      new URL("./fixtures/workout-day-preview.html", import.meta.url),
      "utf8",
    );
    const events = [{ id: 1, start: "2025-01-01 10:00:00", program: "p1", day: 0 }];
    const output = formatWorkoutEventsOutput(
      events,
      { p1: { title: "Push Day", preview: html } },
      {
        timezone: "Europe/London",
      },
    );
    expect(output.source).toBe("calendar");
    expect(output.events).toHaveLength(1);
    expect(output.events[0].program?.title).toBe("Push Day");
    expect(output.events[0].workout_day?.sections).toHaveLength(2);
  });

  it("falls back to program json exercises when no preview html exists", () => {
    const program = {
      days: [
        {
          day_number: 1,
          title: "Day 1: Anterior",
          workout: [{ exercise_name: "Bench Press", sets: 3, reps: "5-8reps", rest_period: "120" }],
        },
        {
          day_number: 2,
          title: "Day 2: Posterior",
          workout: [{ exercise_name: "Deadlift", sets: 3, reps: "3-5reps", rest_period: "180" }],
        },
      ],
    };
    const events = [{ id: 1, title: "Day 2: Posterior", program: "p1", start: "2025-01-02" }];
    const output = formatWorkoutEventsOutput(events, { p1: program }, { timezone: "UTC" });
    const exercise = output.events[0].workout_day?.sections[0].groups[0].exercises[0];
    expect(exercise?.name).toBe("Deadlift");
    expect(exercise?.sets).toBe(3);
    expect(exercise?.reps).toBe("3-5reps");
  });

  it("annotates exercise order and performed dates for cache/UI output", () => {
    const events = [
      {
        event: { start: "2025-02-03 07:30:00" },
        program: null,
        workout_day: {
          total_volume_sets: [],
          sections: [
            {
              type: "workout",
              label: "Workout",
              groups: [
                {
                  type: "straight",
                  exercises: [
                    { name: "Squat", sequence: "1" },
                    { name: "Row", sequence: "2" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ];
    const annotated = annotateWorkoutEventSummaries(events);
    const exercises = annotated[0].workout_day?.sections[0].groups[0].exercises ?? [];
    expect(exercises[0]?.order).toBe(1);
    expect(exercises[0]?.performed_on).toBe("2025-02-03");
    expect(exercises[0]?.performed_at).toBe("2025-02-03 07:30:00");
    expect(exercises[1]?.order).toBe(2);
  });

  it("handles exercise_list sections with warmup and supersets", () => {
    const program = {
      workout_plan: {
        workout_days: [
          {
            title: "Posterior",
            exercise_list: {
              warmup: [
                {
                  type: "normal",
                  list: [{ exercise_name: "Band Pull Apart", sets: "1", reps: "15" }],
                },
              ],
              workout: [
                {
                  type: "normal",
                  list: [{ exercise_name: "Deadlift", sets: "3", reps: "5" }],
                },
                {
                  type: "superset",
                  list: [
                    { exercise_name: "Row", sets: "3", reps: "8" },
                    { exercise_name: "Curl", sets: "3", reps: "10" },
                  ],
                },
              ],
              cooldown: [],
            },
          },
        ],
      },
    };
    const events = [{ id: 3, title: "Posterior", program: "p3" }];
    const output = formatWorkoutEventsOutput(events, { p3: program }, { timezone: "UTC" });
    const sections = output.events[0].workout_day?.sections ?? [];
    expect(sections).toHaveLength(2);
    expect(sections[0].label).toBe("Warm Up");
    expect(sections[0].groups[0].exercises[0].name).toBe("Band Pull Apart");
    const workoutGroups = sections[1].groups;
    expect(workoutGroups[0].type).toBe("straight");
    expect(workoutGroups[1].type).toBe("superset");
    expect(workoutGroups[1].exercises).toHaveLength(2);
    expect(workoutGroups[1].exercises[0].name).toBe("Row");
  });

  it("extracts exercises from wrapper records with nested exercise objects", () => {
    const program = {
      days: [
        {
          day_number: 1,
          title: "Day 1: Posterior",
          workout: [
            {
              exercise: { name: "Hip Thrust", uuid: "ex-1" },
              sets: "4",
              reps: "8-10",
            },
          ],
        },
      ],
    };
    const events = [{ id: 2, title: "Posterior", program: "p2" }];
    const output = formatWorkoutEventsOutput(events, { p2: program }, { timezone: "UTC" });
    const exercise = output.events[0].workout_day?.sections[0].groups[0].exercises[0];
    expect(exercise?.name).toBe("Hip Thrust");
    expect(exercise?.uuid).toBe("ex-1");
    expect(exercise?.sets).toBe(4);
    expect(exercise?.reps).toBe("8-10");
  });
});
