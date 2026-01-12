"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const workouts_1 = require("../workouts");
(0, vitest_1.describe)("extractWorkoutPlans", () => {
    (0, vitest_1.it)("extracts plans from data payload", () => {
        const payload = {
            data: {
                workout_plan: [
                    { uuid: "one", title: "Plan One", updated_at_utc: 10 },
                    { uuid: "two", name: "Plan Two", updated_at_utc: 20 }
                ]
            }
        };
        const plans = (0, workouts_1.extractWorkoutPlans)(payload);
        (0, vitest_1.expect)(plans).toHaveLength(2);
        (0, vitest_1.expect)(plans.map((plan) => plan.uuid)).toEqual(["one", "two"]);
    });
    (0, vitest_1.it)("falls back to deep search", () => {
        const payload = {
            nested: [{ uuid: "deep", title: "Deep Plan" }]
        };
        const plans = (0, workouts_1.extractWorkoutPlans)(payload);
        (0, vitest_1.expect)(plans).toHaveLength(1);
        (0, vitest_1.expect)(plans[0].title).toBe("Deep Plan");
    });
});
(0, vitest_1.describe)("mergeWorkoutPlans", () => {
    (0, vitest_1.it)("merges unique entries", () => {
        const merged = (0, workouts_1.mergeWorkoutPlans)([{ uuid: "a", title: "A" }, { uuid: "b", title: "B" }], [{ uuid: "b", title: "B" }, { uuid: "c", title: "C" }]);
        (0, vitest_1.expect)(merged.map((plan) => plan.uuid)).toEqual(["a", "b", "c"]);
    });
});
(0, vitest_1.describe)("pickLatestWorkout", () => {
    (0, vitest_1.it)("picks by updated_at_utc or created_at_utc", () => {
        const latest = (0, workouts_1.pickLatestWorkout)([
            { uuid: "a", title: "A", updated_at_utc: 2 },
            { uuid: "b", title: "B", created_at_utc: 5 },
            { uuid: "c", title: "C", updated_at_utc: 1 }
        ]);
        (0, vitest_1.expect)(latest.uuid).toBe("b");
    });
});
(0, vitest_1.describe)("formatWorkoutSummary", () => {
    (0, vitest_1.it)("formats title, days, and uuid", () => {
        (0, vitest_1.expect)((0, workouts_1.formatWorkoutSummary)({ uuid: "id", title: "Test", days: 3 })).toBe("Test - 3 days (id)");
    });
});
