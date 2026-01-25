import { createEffect, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import type { WorkoutDaySummary, WorkoutExerciseSummary } from "../events";
import type { WorkoutPageData } from "./types";

function WorkoutPage(props: WorkoutPageData): JSX.Element {
  const eventStart = props.summary?.event.start ?? "";
  const performedOn = resolvePerformedOnLabel(eventStart);
  const programTitle = props.summary?.program?.title ?? "Program";

  const selected = createMemo(() => {
    const index = props.selectedDayIndex;
    if (index !== undefined) {
      if (props.summaryDayIndex !== undefined && props.summaryDayIndex === index) {
        return props.summary?.workout_day ?? props.days[index] ?? null;
      }
      if (props.days[index]) {
        return props.days[index];
      }
    }
    return props.summary?.workout_day ?? null;
  });

  const selectedProgramDayLabel = createMemo(() => {
    const index = props.selectedDayIndex;
    if (index === undefined || !props.days[index]) {
      return undefined;
    }
    return formatDayLabel(props.days[index]?.day_label, index);
  });
  const selectedDayLabel = createMemo(() => selectedProgramDayLabel() ?? selected()?.day_label);
  const latestSelected = createMemo(() => getLatestExerciseDateFromDay(selected()));
  const selectedDayDate = createMemo(() => {
    const index = props.selectedDayIndex;
    if (index === undefined) {
      return undefined;
    }
    return props.dayDateMap?.[String(index)];
  });
  const summaryMatchesDay = createMemo(() => {
    if (props.selectedDayIndex === undefined || props.summaryDayIndex === undefined) {
      return false;
    }
    return props.selectedDayIndex === props.summaryDayIndex;
  });
  const eventTitle = createMemo(() => {
    if (props.eventSelected || summaryMatchesDay()) {
      return props.summary?.event.title ?? selectedDayLabel() ?? "Workout";
    }
    return selectedDayLabel() ?? props.summary?.event.title ?? "Workout";
  });
  const headerDate = createMemo(() => {
    if (props.eventSelected && eventStart) {
      return resolvePerformedOnLabel(eventStart);
    }
    return resolvePerformedOnLabel(selectedDayDate() ?? latestSelected() ?? eventStart);
  });
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

  const totalVolumeSets = createMemo(() => selected()?.total_volume_sets ?? []);
  const hasSessions = Boolean(props.sessions?.length);
  const sessionsByDay = createMemo(() => {
    const sessions = props.sessions ?? [];
    const selectedIndex = props.selectedDayIndex;
    if (selectedIndex === undefined) {
      return { sessions, filtered: false, empty: false };
    }
    const matches = sessions.filter((session) => session.dayIndex === selectedIndex);
    if (matches.length === 0) {
      return { sessions, filtered: false, empty: sessions.length > 0 };
    }
    return { sessions: matches, filtered: true, empty: false };
  });

  return (
    <div class="mx-auto max-w-[1120px] px-6 pt-10 pb-[72px] relative">
      <header class="grid gap-5 rounded-[28px] border border-white/70 bg-gradient-to-br from-white via-[#fff7f0] to-[#f1f6ff] p-7 shadow-card">
        <div>
          <div class="text-sm tracking-[0.02em] text-muted">{headerSubtitle()}</div>
          <h1 class="font-display text-[32px] leading-tight text-ink">{eventTitle()}</h1>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            {headerDate() ? (
              <span class="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong ring-1 ring-accent/20">
                {headerDate()}
              </span>
            ) : null}
            <span class="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong ring-1 ring-accent/20">
              {props.timezone}
            </span>
            {props.isLatest ? (
              <span class="inline-flex items-center rounded-full bg-[#e85d3f] px-3 py-1 text-xs font-semibold text-white shadow-sm">
                Latest event
              </span>
            ) : null}
          </div>
        </div>
        <div class="flex flex-wrap gap-3">
          <a
            class="inline-flex items-center gap-2 rounded-full bg-[#1e1a2b] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2a2440]"
            href={props.refreshPath}
          >
            Refresh
          </a>
          <a
            class="inline-flex items-center gap-2 rounded-full border border-line bg-white/80 px-4 py-2 text-sm font-semibold text-ink shadow-sm backdrop-blur transition hover:bg-white"
            href={props.apiPath}
            target="_blank"
          >
            JSON
          </a>
        </div>
        {props.days.length > 0 ? (
          <div class="grid gap-2 pt-3">
            <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Session focus
            </div>
            <nav class="flex flex-wrap gap-2 pt-2 pb-1">
              {props.days.map((day, index) => {
                const label = formatDayLabel(day.day_label, index);
                const isActive = index === props.selectedDayIndex;
                return (
                  <a
                    class={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "border-accent-strong bg-accent-soft text-accent-strong shadow-sm"
                        : "border-line bg-white/70 text-muted hover:border-accent hover:text-ink"
                    }`.trim()}
                    href={`/?day=${index}`}
                  >
                    {label ?? `Day ${index + 1}`}
                  </a>
                );
              })}
            </nav>
          </div>
        ) : null}
      </header>

      <div
        class={
          hasSessions
            ? "mt-7 flex flex-col gap-6 min-[721px]:flex-row min-[721px]:items-start"
            : "mt-7"
        }
      >
        {hasSessions ? (
          <aside class="w-full rounded-2xl border border-line bg-white/80 p-4 shadow-card backdrop-blur min-[721px]:w-[240px] min-[721px]:shrink-0">
            <div class="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              Sessions
            </div>
            {sessionsByDay().empty ? (
              <div class="mb-3 rounded-xl border border-dashed border-line bg-white/70 px-3 py-2 text-xs text-muted">
                No sessions logged for this day yet. Showing all sessions.
              </div>
            ) : null}
            <div class="grid gap-2">
              {sessionsByDay().sessions.map((session) => {
                const isActive =
                  props.selectedEventId !== undefined &&
                  String(session.id) === String(props.selectedEventId);
                const programLabel =
                  session.program && session.program !== programTitle ? session.program : undefined;
                const dateLabel = resolvePerformedOnLabel(session.start) ?? "Unknown date";
                const dayLabel = formatDayLabel(session.dayLabel, session.dayIndex);
                return (
                  <a
                    class={`grid gap-1 rounded-xl border px-3 py-2 text-ink transition-colors ${
                      isActive
                        ? "border-accent-strong bg-accent-soft shadow-sm"
                        : "border-transparent bg-white/60 hover:border-accent hover:bg-white/80"
                    }`.trim()}
                    href={`/?event=${encodeURIComponent(String(session.id))}`}
                  >
                    <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {dateLabel}
                    </span>
                    {dayLabel ? <span class="text-xs text-muted">{dayLabel}</span> : null}
                    <span class="text-[13px] font-semibold">{session.title ?? "Workout"}</span>
                    {programLabel ? <span class="text-xs text-muted">{programLabel}</span> : null}
                  </a>
                );
              })}
            </div>
          </aside>
        ) : null}

        <div class={hasSessions ? "min-w-0 flex-1" : ""}>
          {totalVolumeSets().length > 0 ? (
            <section class="mt-7">
              <h2 class="text-lg font-bold">Total Volume Sets</h2>
              <div class="mt-3 flex flex-wrap gap-2">
                {totalVolumeSets().map((entry) => (
                  <span class="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-strong shadow-sm">
                    {entry.body_part} {formatNumber(entry.sets)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {selected()?.sections?.length ? (
            selected()!.sections.map((section) => (
              <section class="mt-7">
                <h2 class="text-lg font-bold">{section.label}</h2>
                <div class="grid gap-3.5">
                  {section.groups.map((group, groupIndex) => (
                    <div class="grid gap-2.5">
                      {group.type === "superset" ? (
                        <div class="pl-1 text-[11px] uppercase tracking-[0.1em] text-muted">
                          Superset
                        </div>
                      ) : null}
                      {group.exercises.map((exercise, rowIndex) =>
                        renderExerciseRow(exercise, groupIndex + rowIndex, performedOn),
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div class="mt-5 rounded-2xl border border-dashed border-line bg-white/70 p-6 text-sm text-muted backdrop-blur">
              No workout data found for this day.
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
    <div
      class="grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-2xl border border-line bg-white/85 p-4 shadow-[0_10px_24px_rgba(30,26,43,0.08)] backdrop-blur animate-fade-slide max-[720px]:grid-cols-[48px_1fr]"
      style={`animation-delay: ${Math.min(index * 0.04, 0.4)}s`}
    >
      <div class="grid h-[46px] w-[46px] place-items-center gap-0.5 rounded-[14px] bg-chip text-center text-sm font-bold text-chip-ink">
        <span class="leading-none">{badge}</span>
        <span class="text-[9px] uppercase tracking-[0.08em] opacity-70">Order</span>
      </div>
      <div>
        <h3 class="text-base font-bold">{exercise.name}</h3>
        <p class="mt-1 text-sm text-muted">{metrics || "No prescription"}</p>
      </div>
      <div class="grid min-w-[140px] justify-items-end gap-1.5 text-xs text-muted max-[720px]:justify-items-start max-[720px]:text-left">
        {dateLabel ? (
          <span class="inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[11px] font-semibold text-chip-ink">
            {dateLabel}
          </span>
        ) : null}
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

function formatDayLabel(
  dayLabel: string | undefined,
  dayIndex: number | undefined,
): string | undefined {
  const label = dayLabel?.trim();
  if (label) {
    return label;
  }
  return dayIndex !== undefined ? `Day ${dayIndex + 1}` : undefined;
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
