export type WorkoutPlan = {
  uuid?: string;
  title?: string;
  updated_at_utc?: number;
  created_at_utc?: number;
  days?: number;
};

function mapWorkoutPlan(entry: Record<string, unknown>): WorkoutPlan | undefined {
  const uuid = typeof entry.uuid === "string" ? entry.uuid : undefined;
  const title =
    typeof entry.title === "string"
      ? entry.title
      : typeof entry.name === "string"
        ? entry.name
        : undefined;
  if (!uuid || !title) {
    return undefined;
  }
  return {
    uuid,
    title,
    updated_at_utc: typeof entry.updated_at_utc === "number" ? entry.updated_at_utc : undefined,
    created_at_utc: typeof entry.created_at_utc === "number" ? entry.created_at_utc : undefined,
    days: typeof entry.days === "number" ? entry.days : undefined,
  };
}

function findWorkoutPlansDeep(payload: unknown): WorkoutPlan[] {
  const results: WorkoutPlan[] = [];
  const seen = new Set<string>();

  const record = (plan: WorkoutPlan | undefined): void => {
    if (!plan || !plan.uuid) {
      return;
    }
    if (seen.has(plan.uuid)) {
      return;
    }
    seen.add(plan.uuid);
    results.push(plan);
  };

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      let foundCandidate = false;
      for (const entry of value) {
        if (entry && typeof entry === "object") {
          const plan = mapWorkoutPlan(entry as Record<string, unknown>);
          if (plan) {
            record(plan);
            foundCandidate = true;
          }
        }
      }
      if (foundCandidate) {
        return;
      }
      for (const entry of value) {
        visit(entry);
      }
      return;
    }
    if (value && typeof value === "object") {
      const plan = mapWorkoutPlan(value as Record<string, unknown>);
      if (plan) {
        record(plan);
      }
      for (const entry of Object.values(value)) {
        visit(entry);
      }
    }
  };

  visit(payload);
  return results;
}

export function mergeWorkoutPlans(primary: WorkoutPlan[], secondary: WorkoutPlan[]): WorkoutPlan[] {
  const merged: WorkoutPlan[] = [];
  const seen = new Set<string>();

  const pushPlan = (plan: WorkoutPlan): void => {
    if (!plan.uuid || seen.has(plan.uuid)) {
      return;
    }
    seen.add(plan.uuid);
    merged.push(plan);
  };

  for (const plan of primary) {
    pushPlan(plan);
  }
  for (const plan of secondary) {
    pushPlan(plan);
  }

  return merged;
}

export function extractWorkoutPlans(payload: unknown): WorkoutPlan[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (!data || typeof data !== "object") {
    return findWorkoutPlansDeep(payload);
  }
  const dataRecord = data as Record<string, unknown>;
  const keys = ["workout_plan", "workout_plans", "workout_program", "workout_programs"];
  const plans: WorkoutPlan[] = [];
  for (const key of keys) {
    const workoutPlan = dataRecord[key];
    if (Array.isArray(workoutPlan)) {
      for (const entry of workoutPlan) {
        if (entry && typeof entry === "object") {
          const plan = mapWorkoutPlan(entry as Record<string, unknown>);
          if (plan) {
            plans.push(plan);
          }
        }
      }
      continue;
    }
    if (workoutPlan && typeof workoutPlan === "object") {
      const plan = mapWorkoutPlan(workoutPlan as Record<string, unknown>);
      if (plan) {
        plans.push(plan);
      }
    }
  }
  if (plans.length > 0) {
    return plans;
  }
  return findWorkoutPlansDeep(payload);
}

export function pickLatestWorkout(plans: WorkoutPlan[]): WorkoutPlan {
  const sorted = [...plans].sort((a, b) => {
    const aValue = a.updated_at_utc ?? a.created_at_utc ?? 0;
    const bValue = b.updated_at_utc ?? b.created_at_utc ?? 0;
    return bValue - aValue;
  });
  return sorted[0];
}

export function formatWorkoutSummary(plan: WorkoutPlan): string {
  const title = plan.title ?? "Untitled";
  const uuid = plan.uuid ?? "unknown";
  const days = plan.days ? ` - ${plan.days} days` : "";
  return `${title}${days} (${uuid})`;
}

export function buildWorkoutPlanIndex(plans: WorkoutPlan[]): Record<string, WorkoutPlan> {
  const index: Record<string, WorkoutPlan> = {};
  for (const plan of plans) {
    if (plan.uuid) {
      index[plan.uuid] = plan;
    }
  }
  return index;
}
