import { describe, expect, it } from "vitest";
import {
  extractWorkoutPlans,
  formatWorkoutSummary,
  mergeWorkoutPlans,
  pickLatestWorkout
} from "../workouts";

describe("extractWorkoutPlans", () => {
  it("extracts plans from data payload", () => {
    const payload = {
      data: {
        workout_plan: [
          { uuid: "one", title: "Plan One", updated_at_utc: 10 },
          { uuid: "two", name: "Plan Two", updated_at_utc: 20 }
        ]
      }
    };
    const plans = extractWorkoutPlans(payload);
    expect(plans).toHaveLength(2);
    expect(plans.map((plan) => plan.uuid)).toEqual(["one", "two"]);
  });

  it("falls back to deep search", () => {
    const payload = {
      nested: [{ uuid: "deep", title: "Deep Plan" }]
    };
    const plans = extractWorkoutPlans(payload);
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("Deep Plan");
  });
});

describe("mergeWorkoutPlans", () => {
  it("merges unique entries", () => {
    const merged = mergeWorkoutPlans(
      [{ uuid: "a", title: "A" }, { uuid: "b", title: "B" }],
      [{ uuid: "b", title: "B" }, { uuid: "c", title: "C" }]
    );
    expect(merged.map((plan) => plan.uuid)).toEqual(["a", "b", "c"]);
  });
});

describe("pickLatestWorkout", () => {
  it("picks by updated_at_utc or created_at_utc", () => {
    const latest = pickLatestWorkout([
      { uuid: "a", title: "A", updated_at_utc: 2 },
      { uuid: "b", title: "B", created_at_utc: 5 },
      { uuid: "c", title: "C", updated_at_utc: 1 }
    ]);
    expect(latest.uuid).toBe("b");
  });
});

describe("formatWorkoutSummary", () => {
  it("formats title, days, and uuid", () => {
    expect(formatWorkoutSummary({ uuid: "id", title: "Test", days: 3 })).toBe(
      "Test - 3 days (id)"
    );
  });
});
