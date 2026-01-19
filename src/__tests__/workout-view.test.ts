import { describe, expect, it } from "vitest";
import type { WorkoutDaySummary, WorkoutEventSummary } from "../events";
import { renderWorkoutPage } from "../server/workout-view";

describe("renderWorkoutPage", () => {
  it("renders workout details with escaped content", () => {
    const days: WorkoutDaySummary[] = [
      {
        day_index: 1,
        day_label: "Day 1 <Alpha>",
        total_volume_sets: [{ body_part: "Upper & Back", sets: 7.5 }],
        sections: [
          {
            type: "workout",
            label: 'Main "Block"',
            groups: [
              {
                type: "superset",
                exercises: [
                  {
                    name: "Press & <Pull>",
                    sets: 3,
                    reps: "10",
                    rest_seconds: 90,
                    body_parts: [{ name: "Chest & Arms", volume: 2.5 }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        day_index: 2,
        day_label: "Day 2",
        total_volume_sets: [],
        sections: [],
      },
    ];

    const summary: WorkoutEventSummary = {
      event: { title: "Legs & <Arms>", start: "2026-01-01 10:00:00" },
      program: { title: 'Program "A"' },
      workout_day: days[0],
    };

    const html = renderWorkoutPage({
      summary,
      days,
      selectedDayIndex: 0,
      timezone: "Europe/London",
      apiPath: "/api/workout",
      refreshPath: "/?refresh=1",
      isLatest: true,
    });

    expect(html).toContain("Legs &amp; &lt;Arms&gt;");
    expect(html).toContain("Program &quot;A&quot;");
    expect(html).toContain("Day 1 &lt;Alpha&gt;");
    expect(html).toContain("Upper &amp; Back 7.5");
    expect(html).toContain("Press &amp; &lt;Pull&gt;");
    expect(html).toContain('<div class="group-label">Superset</div>');
    expect(html).toContain("Latest event");
  });
});
