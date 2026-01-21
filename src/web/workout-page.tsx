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
  const hasSessions = Boolean(props.sessions?.length);

  return (
    <div class="mx-auto max-w-[1120px] px-6 pt-10 pb-[72px]">
      <header class="grid gap-5 rounded-[28px] bg-card p-7 shadow-card">
        <div>
          <div class="text-sm tracking-[0.02em] text-muted">{headerSubtitle()}</div>
          <h1 class="font-display text-[32px] leading-tight text-ink">{eventTitle}</h1>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            {headerDate() ? (
              <span class="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                {headerDate()}
              </span>
            ) : null}
            <span class="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
              {props.timezone}
            </span>
            {props.isLatest ? (
              <span class="inline-flex items-center rounded-full bg-ink px-3 py-1 text-xs font-semibold text-[#f5f7ff]">
                Latest event
              </span>
            ) : null}
          </div>
        </div>
        <div class="flex flex-wrap gap-3">
          <a
            class="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink"
            href={props.refreshPath}
          >
            Refresh
          </a>
          <a
            class="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink"
            href={props.apiPath}
            target="_blank"
          >
            JSON
          </a>
        </div>
        {props.days.length > 0 ? (
          <div class="grid gap-2 pt-3">
            <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Program days
            </div>
            <nav class="flex flex-wrap gap-2 pt-2 pb-1">
              {props.days.map((day, index) => {
                const label = day.day_label ?? `Day ${index + 1}`;
                const isActive = index === selectedDayIndex();
                const eventParam =
                  props.selectedEventId !== undefined
                    ? `&event=${encodeURIComponent(String(props.selectedEventId))}`
                    : "";
                return (
                  <a
                    class={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "border-accent bg-[#f2fbf8] text-accent"
                        : "border-line bg-[#f9fbff] text-muted"
                    }`.trim()}
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

      <div
        class={
          hasSessions
            ? "mt-7 flex flex-col gap-6 min-[721px]:flex-row min-[721px]:items-start"
            : "mt-7"
        }
      >
        {hasSessions ? (
          <aside class="w-full rounded-2xl border border-line bg-card p-4 shadow-card min-[721px]:w-[220px] min-[721px]:shrink-0">
            <div class="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              Sessions
            </div>
            <div class="grid gap-2">
              {props.sessions?.map((session) => {
                const isActive =
                  props.selectedEventId !== undefined &&
                  String(session.id) === String(props.selectedEventId);
                const programLabel =
                  session.program && session.program !== programTitle ? session.program : undefined;
                const dateLabel = resolvePerformedOnLabel(session.start) ?? "Unknown date";
                return (
                  <a
                    class={`grid gap-1 rounded-xl border px-3 py-2 text-ink transition-colors ${
                      isActive
                        ? "border-accent bg-[#f2fbf8]"
                        : "border-transparent bg-[#f7f9fc] hover:border-[#c7d7ea] hover:bg-[#f1f5fb]"
                    }`.trim()}
                    href={`/?event=${encodeURIComponent(String(session.id))}`}
                  >
                    <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {dateLabel}
                    </span>
                    <span class="text-[13px] font-semibold">{session.title ?? "Workout"}</span>
                    {programLabel ? (
                      <span class="text-xs text-muted">{programLabel}</span>
                    ) : null}
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
                  <span class="rounded-full bg-[#e9f7f2] px-3 py-1.5 text-xs font-semibold text-accent">
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
            <div class="mt-5 rounded-2xl border border-dashed border-line bg-white/60 p-6 text-sm text-muted">
              No workout data found for this day.
            </div>
          )}
        </div>
      </div>
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
    <div
      class="grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-[0_4px_16px_rgba(31,36,48,0.04)] animate-fade-slide max-[720px]:grid-cols-[48px_1fr]"
      style={`animation-delay: ${Math.min(index * 0.04, 0.4)}s`}
    >
      <div class="grid h-[46px] w-[46px] place-items-center gap-0.5 rounded-[14px] bg-chip text-center text-sm font-bold text-[#275b8b]">
        <span class="leading-none">{badge}</span>
        <span class="text-[9px] uppercase tracking-[0.08em] opacity-70">Order</span>
      </div>
      <div>
        <h3 class="text-base font-bold">{exercise.name}</h3>
        <p class="mt-1 text-sm text-muted">{metrics || "No prescription"}</p>
      </div>
      <div class="grid min-w-[140px] justify-items-end gap-1.5 text-xs text-muted max-[720px]:justify-items-start max-[720px]:text-left">
        {dateLabel ? (
          <span class="inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[11px] font-semibold text-[#1c3b57]">
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
