import type {
  WorkoutDaySummary,
  WorkoutEventSummary,
  WorkoutExerciseSummary
} from "../events";

type RenderWorkoutPageOptions = {
  summary?: WorkoutEventSummary;
  days: WorkoutDaySummary[];
  selectedDayIndex?: number;
  timezone: string;
  apiPath: string;
  refreshPath: string;
  isLatest?: boolean;
};

export function renderWorkoutPage(options: RenderWorkoutPageOptions): string {
  const { summary, days, selectedDayIndex, timezone, apiPath, refreshPath, isLatest } = options;
  const eventTitle = summary?.event.title ?? "Workout";
  const eventStart = summary?.event.start ?? "";
  const programTitle = summary?.program?.title ?? "Program";

  const selected =
    selectedDayIndex !== undefined && days[selectedDayIndex]
      ? days[selectedDayIndex]
      : summary?.workout_day ?? null;

  const tabs = days.length > 0
    ? `<nav class="tabs">${days
        .map((day, index) => {
          const label = escapeHtml(day.day_label ?? `Day ${index + 1}`);
          const active = index === selectedDayIndex ? "active" : "";
          return `<a class="tab ${active}" href="/?day=${index}">${label}</a>`;
        })
        .join("")}</nav>`
    : "";

  const totalVolumeSets = selected?.total_volume_sets ?? [];
  const totalVolumeSection =
    totalVolumeSets.length > 0
      ? `
        <section class="section">
          <h2>Total Volume Sets</h2>
          <div class="chips">
            ${totalVolumeSets
              .map(
                (entry) =>
                  `<span class="chip">${escapeHtml(entry.body_part)} ${formatNumber(entry.sets)}</span>`
              )
              .join("")}
          </div>
        </section>
      `
      : "";

  const sections = selected?.sections?.length
    ? selected.sections
        .map((section) => {
          const groups = section.groups
            .map((group, groupIndex) => {
              const groupLabel =
                group.type === "superset"
                  ? `<div class="group-label">Superset</div>`
                  : "";
              const rows = group.exercises
                .map((exercise, rowIndex) =>
                  renderExerciseRow(exercise, groupIndex + rowIndex)
                )
                .join("");
              return `<div class="group">${groupLabel}${rows}</div>`;
            })
            .join("");
          return `
            <section class="section">
              <h2>${escapeHtml(section.label)}</h2>
              <div class="section-body">${groups}</div>
            </section>
          `;
        })
        .join("")
    : `<div class="empty">No workout data found for this day.</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(programTitle)} | Workout</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Spline+Sans:wght@400;500;600&display=swap");

      :root {
        --bg-1: #f6f7fb;
        --bg-2: #eef3f9;
        --card: #ffffff;
        --ink: #1f2430;
        --muted: #6b7280;
        --line: #e3e8f2;
        --accent: #2f7f6f;
        --accent-soft: #e7f5f1;
        --chip: #eaf5ff;
        --shadow: 0 12px 30px rgba(31, 36, 48, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Spline Sans", sans-serif;
        color: var(--ink);
        background: linear-gradient(160deg, var(--bg-1), var(--bg-2));
        min-height: 100vh;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at top right, rgba(47, 127, 111, 0.12), transparent 45%);
        pointer-events: none;
      }

      .page {
        max-width: 1120px;
        margin: 0 auto;
        padding: 40px 24px 72px;
      }

      .hero {
        background: var(--card);
        border-radius: 28px;
        padding: 28px 32px;
        box-shadow: var(--shadow);
        display: grid;
        gap: 20px;
      }

      .title {
        font-family: "Fraunces", serif;
        font-size: 32px;
        margin: 0;
      }

      .subtitle {
        color: var(--muted);
        font-size: 14px;
        letter-spacing: 0.02em;
      }

      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }

      .meta-pill {
        background: var(--accent-soft);
        color: var(--accent);
        padding: 6px 12px;
        border-radius: 999px;
        font-weight: 600;
        font-size: 12px;
      }

      .meta-pill.latest {
        background: #1f2a3d;
        color: #f5f7ff;
      }

      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 8px 16px;
        text-decoration: none;
        color: var(--ink);
        font-weight: 600;
      }

      .tabs {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        padding: 18px 0 4px;
      }

      .tab {
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid var(--line);
        text-decoration: none;
        color: var(--muted);
        font-weight: 600;
        background: #f9fbff;
      }

      .tab.active {
        color: var(--accent);
        border-color: var(--accent);
        background: #f2fbf8;
      }

      .section {
        margin-top: 28px;
      }

      .section h2 {
        margin: 0 0 14px;
        font-size: 18px;
        font-weight: 700;
      }

      .section-body {
        display: grid;
        gap: 14px;
      }

      .group {
        display: grid;
        gap: 10px;
      }

      .group-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--muted);
        padding-left: 6px;
      }

      .exercise {
        background: var(--card);
        border-radius: 16px;
        border: 1px solid var(--line);
        padding: 16px 18px;
        display: grid;
        grid-template-columns: 56px 1fr auto;
        gap: 12px;
        align-items: center;
        box-shadow: 0 4px 16px rgba(31, 36, 48, 0.04);
        animation: fadeSlide 0.5s ease both;
        animation-delay: var(--delay, 0s);
      }

      .badge {
        width: 46px;
        height: 46px;
        border-radius: 14px;
        background: var(--chip);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        color: #275b8b;
      }

      .exercise h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
      }

      .exercise p {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 13px;
      }

      .metrics {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 13px;
        color: var(--muted);
        min-width: 140px;
        text-align: right;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .chip {
        padding: 6px 12px;
        border-radius: 999px;
        background: #e9f7f2;
        color: #2f7f6f;
        font-size: 12px;
        font-weight: 600;
      }

      .chip.muted {
        background: #f1f3f7;
        color: var(--muted);
      }

      .empty {
        margin-top: 20px;
        padding: 24px;
        border-radius: 16px;
        border: 1px dashed var(--line);
        color: var(--muted);
        background: rgba(255, 255, 255, 0.6);
      }

      @keyframes fadeSlide {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (max-width: 720px) {
        .exercise {
          grid-template-columns: 48px 1fr;
        }
        .metrics {
          text-align: left;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="hero">
        <div>
          <div class="subtitle">${escapeHtml(programTitle)}</div>
          <h1 class="title">${escapeHtml(eventTitle)}</h1>
      <div class="meta">
        ${eventStart ? `<span class="meta-pill">${escapeHtml(eventStart)}</span>` : ""}
        <span class="meta-pill">${escapeHtml(timezone)}</span>
        ${isLatest ? `<span class="meta-pill latest">Latest event</span>` : ""}
      </div>
        </div>
        <div class="actions">
          <a class="button" href="${escapeHtml(refreshPath)}">Refresh</a>
          <a class="button" href="${escapeHtml(apiPath)}" target="_blank">JSON</a>
        </div>
        ${tabs}
      </header>

      ${totalVolumeSection}
      ${sections}
    </div>
  </body>
</html>`;
}

function renderExerciseRow(exercise: WorkoutExerciseSummary, index: number): string {
  const badge = escapeHtml(exercise.sequence ?? String(index + 1));
  const metrics = [
    exercise.sets !== undefined ? `Sets ${exercise.sets}` : null,
    exercise.reps ? `Reps ${escapeHtml(exercise.reps)}` : null,
    exercise.rest_seconds !== undefined ? `Rest ${formatDuration(exercise.rest_seconds)}` : null,
    exercise.time_seconds !== undefined ? `Time ${formatDuration(exercise.time_seconds)}` : null
  ]
    .filter(Boolean)
    .join(" | ");
  return `
    <div class="exercise" style="--delay: ${Math.min(index * 0.04, 0.4)}s">
      <div class="badge">${badge}</div>
      <div>
        <h3>${escapeHtml(exercise.name)}</h3>
        <p>${metrics || "No prescription"}</p>
      </div>
      <div class="metrics">
        ${exercise.body_parts?.length ? formatBodyParts(exercise.body_parts) : ""}
      </div>
    </div>
  `;
}

function formatBodyParts(parts: Array<{ name: string; volume?: number }>): string {
  return parts
    .slice(0, 3)
    .map((part) =>
      `${escapeHtml(part.name)}${part.volume !== undefined ? ` ${formatNumber(part.volume)}` : ""}`
    )
    .join("<br />");
}

function formatDuration(value: number): string {
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1).replace(/\.0$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
