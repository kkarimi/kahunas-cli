import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { WorkoutDaySummary, WorkoutExerciseSummary } from "../events";
import type { WorkoutPageData } from "./types";

function WorkoutPage(props: WorkoutPageData): JSX.Element {
  const eventTitle = props.summary?.event.title ?? "Workout";
  const eventStart = props.summary?.event.start ?? "";
  const performedOn = resolvePerformedOnLabel(eventStart);
  const programTitle = props.summary?.program?.title ?? "Program";
  const [selectedDayIndex, setSelectedDayIndex] = createSignal<number | undefined>(
    props.selectedDayIndex,
  );

  const selected = createMemo(() => {
    const index = selectedDayIndex();
    if (index !== undefined && props.days[index]) {
      return props.days[index];
    }
    return props.summary?.workout_day ?? null;
  });

  const selectedDayLabel = createMemo(() => selected()?.day_label);
  const latestSelected = createMemo(() => getLatestExerciseDateFromDay(selected()));
  const selectedDayDate = createMemo(() => {
    const index = selectedDayIndex();
    if (index === undefined) {
      return undefined;
    }
    return props.dayDateMap?.[String(index)];
  });
  const headerDate = createMemo(() =>
    resolvePerformedOnLabel(selectedDayDate() ?? latestSelected() ?? eventStart),
  );
  const headerSubtitle = createMemo(() => {
    const dayLabel = selectedDayLabel();
    return dayLabel ? `${programTitle} • ${dayLabel}` : programTitle;
  });

  createEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const dayLabel = selectedDayLabel();
    document.title = dayLabel ? `${programTitle} | ${dayLabel}` : `${programTitle} | Workout`;
  });

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handler = (): void => {
      const nextIndex = resolveIndexFromSearch(window.location.search);
      setSelectedDayIndex(nextIndex);
    };
    window.addEventListener("popstate", handler);
    onCleanup(() => window.removeEventListener("popstate", handler));
  });

  const totalVolumeSets = createMemo(() => selected()?.total_volume_sets ?? []);

  return (
    <div class="page">
      <header class="hero">
        <div>
          <div class="subtitle">{headerSubtitle()}</div>
          <h1 class="title">{eventTitle}</h1>
          <div class="meta">
            {headerDate() ? <span class="meta-pill">{headerDate()}</span> : null}
            <span class="meta-pill">{props.timezone}</span>
            {props.isLatest ? <span class="meta-pill latest">Latest event</span> : null}
          </div>
        </div>
        <div class="actions">
          <a class="button" href={props.refreshPath}>
            Refresh
          </a>
          <a class="button" href={props.apiPath} target="_blank">
            JSON
          </a>
        </div>
        {props.days.length > 0 ? (
          <div class="tabs-block">
            <div class="tabs-label">Program days</div>
            <nav class="tabs">
              {props.days.map((day, index) => {
                const label = day.day_label ?? `Day ${index + 1}`;
                const active = index === selectedDayIndex() ? "active" : "";
                const eventParam =
                  props.selectedEventId !== undefined
                    ? `&event=${encodeURIComponent(String(props.selectedEventId))}`
                    : "";
                return (
                  <a
                    class={`tab ${active}`.trim()}
                    href={`/?day=${index}${eventParam}`}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                        return;
                      }
                      event.preventDefault();
                      setSelectedDayIndex(index);
                      if (typeof window !== "undefined") {
                        const search = new URLSearchParams(window.location.search);
                        search.set("day", String(index));
                        if (props.selectedEventId !== undefined) {
                          search.set("event", String(props.selectedEventId));
                        } else {
                          search.delete("event");
                        }
                        const nextUrl = `${window.location.pathname}?${search.toString()}`;
                        window.history.pushState(null, "", nextUrl);
                      }
                    }}
                  >
                    {label}
                  </a>
                );
              })}
            </nav>
          </div>
        ) : null}
      </header>

      {totalVolumeSets().length > 0 ? (
        <section class="section">
          <h2>Total Volume Sets</h2>
          <div class="chips">
            {totalVolumeSets().map((entry) => (
              <span class="chip">
                {entry.body_part} {formatNumber(entry.sets)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {selected()?.sections?.length ? (
        selected()!.sections.map((section) => (
          <section class="section">
            <h2>{section.label}</h2>
            <div class="section-body">
              {section.groups.map((group, groupIndex) => (
                <div class="group">
                  {group.type === "superset" ? <div class="group-label">Superset</div> : null}
                  {group.exercises.map((exercise, rowIndex) =>
                    renderExerciseRow(exercise, groupIndex + rowIndex, performedOn),
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div class="empty">No workout data found for this day.</div>
      )}
    </div>
  );
}

function resolveIndexFromSearch(search: string): number | undefined {
  if (typeof search !== "string") {
    return undefined;
  }
  const params = new URLSearchParams(search);
  const value = params.get("day");
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function renderExerciseRow(
  exercise: WorkoutExerciseSummary,
  index: number,
  performedOn?: string,
): JSX.Element {
  const badge = resolveOrderLabel(exercise, index);
  const dateLabel = resolvePerformedOnLabel(
    exercise.performed_on ?? exercise.performed_at ?? performedOn,
  );
  const metrics = [
    exercise.sets !== undefined ? `Sets ${exercise.sets}` : null,
    exercise.reps ? `Reps ${exercise.reps}` : null,
    exercise.rest_seconds !== undefined ? `Rest ${formatDuration(exercise.rest_seconds)}` : null,
    exercise.time_seconds !== undefined ? `Time ${formatDuration(exercise.time_seconds)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  return (
    <div class="exercise" style={`--delay: ${Math.min(index * 0.04, 0.4)}s`}>
      <div class="badge">
        <span>{badge}</span>
        <span class="badge-label">Order</span>
      </div>
      <div>
        <h3>{exercise.name}</h3>
        <p>{metrics || "No prescription"}</p>
      </div>
      <div class="metrics">
        {dateLabel ? <span class="date-pill">{dateLabel}</span> : null}
        {exercise.body_parts?.length ? formatBodyParts(exercise.body_parts) : null}
      </div>
    </div>
  );
}

function formatBodyParts(parts: Array<{ name: string; volume?: number }>): JSX.Element {
  const entries = parts.slice(0, 3);
  return (
    <>
      {entries.map((part, index) => (
        <>
          {part.name}
          {part.volume !== undefined ? ` ${formatNumber(part.volume)}` : ""}
          {index < entries.length - 1 ? <br /> : null}
        </>
      ))}
    </>
  );
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

function resolveOrderLabel(exercise: WorkoutExerciseSummary, index: number): string {
  if (exercise.order !== undefined && Number.isFinite(exercise.order)) {
    return String(exercise.order);
  }
  if (exercise.sequence) {
    return exercise.sequence;
  }
  return String(index + 1);
}

function resolvePerformedOnLabel(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : value;
}

function getLatestExerciseDateFromDay(
  day: WorkoutDaySummary | null | undefined,
): string | undefined {
  if (!day?.sections?.length) {
    return undefined;
  }
  let latest: { time: number; label: string } | undefined;
  for (const section of day.sections) {
    for (const group of section.groups) {
      for (const exercise of group.exercises) {
        const label = exercise.performed_on ?? exercise.performed_at;
        if (!label) {
          continue;
        }
        const parsed = Date.parse(label);
        if (!Number.isFinite(parsed)) {
          continue;
        }
        if (!latest || parsed > latest.time) {
          latest = { time: parsed, label };
        }
      }
    }
  }
  return latest?.label;
}

export { WorkoutPage };
