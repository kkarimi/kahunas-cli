"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeWorkoutPlans = mergeWorkoutPlans;
exports.extractWorkoutPlans = extractWorkoutPlans;
exports.pickLatestWorkout = pickLatestWorkout;
exports.formatWorkoutSummary = formatWorkoutSummary;
exports.buildWorkoutPlanIndex = buildWorkoutPlanIndex;
function mapWorkoutPlan(entry) {
    const uuid = typeof entry.uuid === "string" ? entry.uuid : undefined;
    const title = typeof entry.title === "string"
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
        days: typeof entry.days === "number" ? entry.days : undefined
    };
}
function findWorkoutPlansDeep(payload) {
    const results = [];
    const seen = new Set();
    const record = (plan) => {
        if (!plan || !plan.uuid) {
            return;
        }
        if (seen.has(plan.uuid)) {
            return;
        }
        seen.add(plan.uuid);
        results.push(plan);
    };
    const visit = (value) => {
        if (Array.isArray(value)) {
            let foundCandidate = false;
            for (const entry of value) {
                if (entry && typeof entry === "object") {
                    const plan = mapWorkoutPlan(entry);
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
            const plan = mapWorkoutPlan(value);
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
function mergeWorkoutPlans(primary, secondary) {
    const merged = [];
    const seen = new Set();
    const pushPlan = (plan) => {
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
function extractWorkoutPlans(payload) {
    if (!payload || typeof payload !== "object") {
        return [];
    }
    const record = payload;
    const data = record.data;
    if (!data || typeof data !== "object") {
        return findWorkoutPlansDeep(payload);
    }
    const dataRecord = data;
    const keys = ["workout_plan", "workout_plans", "workout_program", "workout_programs"];
    const plans = [];
    for (const key of keys) {
        const workoutPlan = dataRecord[key];
        if (Array.isArray(workoutPlan)) {
            for (const entry of workoutPlan) {
                if (entry && typeof entry === "object") {
                    const plan = mapWorkoutPlan(entry);
                    if (plan) {
                        plans.push(plan);
                    }
                }
            }
            continue;
        }
        if (workoutPlan && typeof workoutPlan === "object") {
            const plan = mapWorkoutPlan(workoutPlan);
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
function pickLatestWorkout(plans) {
    const sorted = [...plans].sort((a, b) => {
        const aValue = a.updated_at_utc ?? a.created_at_utc ?? 0;
        const bValue = b.updated_at_utc ?? b.created_at_utc ?? 0;
        return bValue - aValue;
    });
    return sorted[0];
}
function formatWorkoutSummary(plan) {
    const title = plan.title ?? "Untitled";
    const uuid = plan.uuid ?? "unknown";
    const days = plan.days ? ` - ${plan.days} days` : "";
    return `${title}${days} (${uuid})`;
}
function buildWorkoutPlanIndex(plans) {
    const index = {};
    for (const plan of plans) {
        if (plan.uuid) {
            index[plan.uuid] = plan;
        }
    }
    return index;
}
