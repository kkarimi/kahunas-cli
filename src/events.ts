export type WorkoutEvent = Record<string, unknown>;

export function filterWorkoutEvents(
  payload: unknown,
  programFilter?: string,
  workoutFilter?: string
): WorkoutEvent[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const record = entry as Record<string, unknown>;
    if (programFilter && record.program !== programFilter) {
      return false;
    }
    if (workoutFilter && record.workout !== workoutFilter) {
      return false;
    }
    return true;
  }) as WorkoutEvent[];
}

export function sortWorkoutEvents(events: WorkoutEvent[]): WorkoutEvent[] {
  return [...events].sort((a, b) => {
    const aStart = typeof a.start === "string" ? Date.parse(a.start.replace(" ", "T")) : 0;
    const bStart = typeof b.start === "string" ? Date.parse(b.start.replace(" ", "T")) : 0;
    return aStart - bStart;
  });
}

export function enrichWorkoutEvents(
  events: WorkoutEvent[],
  programDetails: Record<string, unknown>
): WorkoutEvent[] {
  return events.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    const record = entry as Record<string, unknown>;
    const programUuid = typeof record.program === "string" ? record.program : undefined;
    const program = programUuid ? programDetails[programUuid] : undefined;
    return {
      ...record,
      program_details: program ?? null
    };
  });
}
