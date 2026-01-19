export type WorkoutEvent = Record<string, unknown>;

export type WorkoutEventSummary = {
  event: { id?: number | string; start?: string; end?: string; title?: string };
  program: { uuid?: string; title?: string } | null;
  workout_day: WorkoutDaySummary | null;
};

export type WorkoutDaySummary = {
  day_index?: number;
  day_label?: string;
  total_volume_sets: { body_part: string; sets: number }[];
  sections: WorkoutSectionSummary[];
};

export type WorkoutSectionSummary = {
  type: "warm_up" | "workout";
  label: string;
  groups: WorkoutExerciseGroup[];
};

export type WorkoutExerciseGroup = {
  type: "straight" | "superset";
  label?: string;
  exercises: WorkoutExerciseSummary[];
};

export type WorkoutExerciseSummary = {
  name: string;
  uuid?: string;
  order?: number;
  sets?: number;
  reps?: string;
  rest_seconds?: number;
  time_seconds?: number;
  notes?: string;
  sequence?: string;
  performed_at?: string;
  performed_on?: string;
  body_parts?: { name: string; volume?: number }[];
  media?: { file_url?: string; thumbnail_url?: string; file_type?: number }[];
};

export function summarizeWorkoutProgramDays(program: unknown): WorkoutDaySummary[] {
  const candidates = extractProgramDayCandidates(program);
  if (candidates.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const unique: WorkoutDaySummary[] = [];
  for (const candidate of candidates) {
    const key = [
      candidate.day_index ?? "none",
      candidate.day_label ?? "unknown",
      candidate.sections.length
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(candidate);
  }
  return unique.sort((a, b) => {
    const aIndex = a.day_index;
    const bIndex = b.day_index;
    if (aIndex !== undefined && bIndex !== undefined) {
      return aIndex - bIndex;
    }
    if (aIndex !== undefined) {
      return -1;
    }
    if (bIndex !== undefined) {
      return 1;
    }
    const aLabel = a.day_label ?? "";
    const bLabel = b.day_label ?? "";
    return aLabel.localeCompare(bLabel);
  });
}

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

type WorkoutOutputOptions = { timezone: string; program?: string; workout?: string };

const HTML_ENTITY_MAP: Record<string, string> = {
  "&quot;": "\"",
  "&#34;": "\"",
  "&apos;": "'",
  "&#39;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">"
};

const DAY_INDEX_KEYS = [
  "day_index",
  "workout_day_index",
  "day",
  "workout_day",
  "day_number",
  "workout_day_number"
];

export type PreviewHtmlMatch = { html: string; source: string };

export function formatWorkoutEventsOutput(
  events: WorkoutEvent[],
  programDetails: Record<string, unknown>,
  options: WorkoutOutputOptions
): {
  source: "calendar";
  timezone: string;
  filters: { program: string | null; workout: string | null };
  events: WorkoutEventSummary[];
} {
  return {
    source: "calendar",
    timezone: options.timezone,
    filters: {
      program: options.program ?? null,
      workout: options.workout ?? null
    },
    events: events.map((event) => formatWorkoutEvent(event, programDetails))
  };
}

export function parseWorkoutDayPreview(html: string, dayIndex?: number): WorkoutDaySummary | null {
  const dayBlocks = extractWorkoutDayBlocks(html);
  const selected = selectWorkoutDayBlock(dayBlocks, dayIndex);
  if (dayBlocks.size > 1 && !selected) {
    return null;
  }
  const dayHtml = selected?.html ?? html;
  if (!dayHtml) {
    return null;
  }

  const totalVolumeSets = parseTotalVolumeSets(dayHtml);
  const sections: WorkoutSectionSummary[] = [];

  const warmupHtml = extractSectionHtml(dayHtml, "table_warmup");
  if (warmupHtml) {
    const groups = buildExerciseGroups(warmupHtml);
    if (groups.length > 0) {
      sections.push({ type: "warm_up", label: "Warm Up", groups });
    }
  }

  const workoutHtml = extractSectionHtml(dayHtml, "table_workout");
  if (workoutHtml) {
    const groups = buildExerciseGroups(workoutHtml);
    if (groups.length > 0) {
      sections.push({ type: "workout", label: "Workout", groups });
    }
  }

  if (totalVolumeSets.length === 0 && sections.length === 0) {
    return null;
  }

  const resolvedIndex = selected?.index ?? dayIndex;
  return {
    day_index: resolvedIndex,
    day_label: resolvedIndex === undefined ? undefined : `Day ${resolvedIndex + 1}`,
    total_volume_sets: totalVolumeSets,
    sections
  };
}

function formatWorkoutEvent(
  event: WorkoutEvent,
  programDetails: Record<string, unknown>
): WorkoutEventSummary {
  const record = event as Record<string, unknown>;
  const programUuid = typeof record.program === "string" ? record.program : undefined;
  const program = programUuid ? programDetails[programUuid] : undefined;
  const programSummary = programUuid ? extractProgramSummary(programUuid, program) : null;

  const dayIndex = resolveEventDayIndex(record, program);
  const previewMatch =
    findWorkoutPreviewHtmlMatch(record) ??
    (program ? findWorkoutPreviewHtmlMatch(program) : undefined);
  const previewHtml = previewMatch?.html;
  let workoutDay = previewHtml ? parseWorkoutDayPreview(previewHtml, dayIndex) : null;
  if (!workoutDay) {
    workoutDay = deriveWorkoutDayFromProgram(program ?? record, record);
  }

  return {
    event: {
      id: typeof record.id === "number" || typeof record.id === "string" ? record.id : undefined,
      start: typeof record.start === "string" ? record.start : undefined,
      end: typeof record.end === "string" ? record.end : undefined,
      title: typeof record.title === "string" ? record.title : undefined
    },
    program: programSummary,
    workout_day: workoutDay
  };
}

export function annotateWorkoutEventSummaries(
  events: WorkoutEventSummary[]
): WorkoutEventSummary[] {
  return events.map((event) => {
    if (!event.workout_day) {
      return event;
    }
    const performedAt = event.event.start;
    const performedOn = resolvePerformedOn(performedAt);
    let order = 1;
    const sections = event.workout_day.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        exercises: group.exercises.map((exercise) => {
          const derivedOrder = parseSequence(exercise.sequence) ?? order;
          const next = {
            ...exercise,
            order: derivedOrder,
            performed_at: performedAt ?? exercise.performed_at,
            performed_on: performedOn ?? exercise.performed_on
          };
          order += 1;
          return next;
        })
      }))
    }));
    return { ...event, workout_day: { ...event.workout_day, sections } };
  });
}

function resolvePerformedOn(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : value;
}


function deriveWorkoutDayFromProgram(
  program: unknown,
  event: Record<string, unknown>
): WorkoutDaySummary | null {
  if (!program || typeof program !== "object") {
    return null;
  }
  const candidates = extractProgramDayCandidates(program);
  if (candidates.length === 0) {
    return null;
  }
  const dayIndex = resolveEventDayIndex(event, program) ?? parseDayIndexFromTitle(event.title);
  if (dayIndex !== undefined) {
    const match =
      candidates.find((candidate) => candidate.day_index === dayIndex) ??
      candidates.find((candidate) => candidate.day_index === dayIndex - 1);
    if (match) {
      return match;
    }
  }
  const title = typeof event.title === "string" ? event.title.trim() : "";
  if (title) {
    const normalizedTitle = normalizeLabel(title);
    const match = candidates.find((candidate) => {
      if (!candidate.day_label) {
        return false;
      }
      const normalizedLabel = normalizeLabel(candidate.day_label);
      return (
        normalizedLabel.includes(normalizedTitle) || normalizedTitle.includes(normalizedLabel)
      );
    });
    if (match) {
      return match;
    }
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  return null;
}

function extractProgramDayCandidates(program: unknown): WorkoutDaySummary[] {
  const candidates: WorkoutDaySummary[] = [];
  const queue: unknown[] = [program];
  while (queue.length > 0) {
    const value = queue.shift();
    if (!value) {
      continue;
    }
    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    if (typeof value !== "object") {
      continue;
    }
    const record = value as Record<string, unknown>;
    const sections = extractSectionsFromRecord(record);
    if (sections.length > 0) {
      const dayIndex = resolveDayIndexFromRecord(record);
      const dayLabel = resolveDayLabelFromRecord(record, dayIndex);
      const totalVolume = extractTotalVolumeFromRecord(record);
      candidates.push({
        day_index: dayIndex,
        day_label: dayLabel,
        total_volume_sets: totalVolume,
        sections
      });
    }
    queue.push(...Object.values(record));
  }
  return candidates;
}

function extractSectionsFromRecord(record: Record<string, unknown>): WorkoutSectionSummary[] {
  const sections: WorkoutSectionSummary[] = [];
  const exerciseListSections = extractSectionsFromExerciseList(record.exercise_list);
  if (exerciseListSections.length > 0) {
    return exerciseListSections;
  }
  const warmup = extractExercisesFromValue(
    record.warmup ?? record.warm_up ?? record.warm_up_exercises ?? record.warmups
  );
  if (warmup.length > 0) {
    sections.push({ type: "warm_up", label: "Warm Up", groups: wrapExercises(warmup) });
  }

  const workout = extractExercisesFromValue(
    record.workout ??
      record.workout_exercises ??
      record.exercises ??
      record.exercise
  );
  if (workout.length > 0) {
    sections.push({ type: "workout", label: "Workout", groups: wrapExercises(workout) });
  }

  return sections;
}

function extractSectionsFromExerciseList(value: unknown): WorkoutSectionSummary[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  const sections: WorkoutSectionSummary[] = [];

  const warmupGroups = extractExerciseGroupsFromList(record.warmup ?? record.warm_up);
  if (warmupGroups.length > 0) {
    sections.push({ type: "warm_up", label: "Warm Up", groups: warmupGroups });
  }

  const workoutGroups = extractExerciseGroupsFromList(record.workout ?? record.main);
  if (workoutGroups.length > 0) {
    sections.push({ type: "workout", label: "Workout", groups: workoutGroups });
  }

  const cooldownGroups = extractExerciseGroupsFromList(record.cooldown ?? record.cool_down);
  if (cooldownGroups.length > 0) {
    sections.push({ type: "workout", label: "Cooldown", groups: cooldownGroups });
  }

  return sections;
}

function extractExerciseGroupsFromList(value: unknown): WorkoutExerciseGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const groups: WorkoutExerciseGroup[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const exercises = extractExercisesFromValue(
      record.list ?? record.exercises ?? record.exercise ?? record.items
    );
    if (exercises.length === 0) {
      continue;
    }
    const typeValue = typeof record.type === "string" ? record.type.toLowerCase() : "";
    const groupType = typeValue.includes("superset") ? "superset" : "straight";
    groups.push({ type: groupType, exercises });
  }
  return groups;
}

function extractExercisesFromValue(value: unknown): WorkoutExerciseSummary[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return extractExercisesFromArray(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (looksLikeExerciseRecord(record)) {
      const parsed = parseExerciseFromRecord(record);
      return parsed ? [parsed] : [];
    }
    const exercises: WorkoutExerciseSummary[] = [];
    for (const entry of Object.values(record)) {
      exercises.push(...extractExercisesFromValue(entry));
    }
    return exercises;
  }
  return [];
}

function extractExercisesFromArray(entries: unknown[]): WorkoutExerciseSummary[] {
  const exerciseEntries = entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => entry as Record<string, unknown>);
  const looksLikeExercises = exerciseEntries.some((entry) => looksLikeExerciseRecord(entry));
  if (!looksLikeExercises) {
    const nested: WorkoutExerciseSummary[] = [];
    for (const entry of exerciseEntries) {
      nested.push(...extractExercisesFromValue(entry));
    }
    return nested;
  }
  return exerciseEntries
    .map((entry) => parseExerciseFromRecord(entry))
    .filter((entry): entry is WorkoutExerciseSummary => Boolean(entry));
}

function looksLikeExerciseRecord(record: Record<string, unknown>): boolean {
  if (typeof record.exercise_name === "string") {
    return true;
  }
  if (typeof record.exercise_uuid === "string") {
    return true;
  }
  if (typeof record.name === "string" && (record.sets !== undefined || record.reps !== undefined)) {
    return true;
  }
  const nested = record.exercise;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.name === "string" || typeof nestedRecord.exercise_name === "string") {
      return true;
    }
    if (typeof nestedRecord.uuid === "string" || typeof nestedRecord.exercise_uuid === "string") {
      return true;
    }
  }
  return false;
}

function parseExerciseFromRecord(record: Record<string, unknown>): WorkoutExerciseSummary | null {
  const nested = record.exercise && typeof record.exercise === "object"
    ? (record.exercise as Record<string, unknown>)
    : undefined;
  const name =
    typeof record.exercise_name === "string"
      ? record.exercise_name
      : typeof record.name === "string"
        ? record.name
        : typeof nested?.name === "string"
          ? nested.name
          : typeof nested?.exercise_name === "string"
            ? nested.exercise_name
            : typeof nested?.title === "string"
              ? nested.title
          : undefined;
  if (!name) {
    return null;
  }
  const sets = parseNumber(record.sets as string | undefined);
  const reps =
    typeof record.reps === "string"
      ? record.reps
      : typeof record.reps === "number"
        ? String(record.reps)
        : typeof record.rep === "string"
          ? record.rep
          : typeof record.repetition === "string"
            ? record.repetition
        : undefined;
  const rest = parseNumber(
    (record.rest_period ?? record.rest ?? record.rest_seconds) as string | undefined
  );
  const time = parseNumber(
    (record.time_period ?? record.time ?? record.duration) as string | undefined
  );
  const bodyParts = extractBodyPartsFromValue(
    record.bodypart ?? record.body_parts ?? nested?.bodypart ?? nested?.body_parts
  );
  const sequence =
    typeof record.number === "string" || typeof record.number === "number"
      ? String(record.number)
      : typeof record.sequence === "string" || typeof record.sequence === "number"
        ? String(record.sequence)
        : typeof record.order === "string" || typeof record.order === "number"
          ? String(record.order)
          : typeof record.exercise_order === "string" || typeof record.exercise_order === "number"
            ? String(record.exercise_order)
            : typeof record.group_order === "string" || typeof record.group_order === "number"
              ? String(record.group_order)
          : undefined;

  return {
    name,
    uuid:
      typeof record.exercise_uuid === "string"
        ? record.exercise_uuid
        : typeof nested?.uuid === "string"
          ? nested.uuid
          : typeof nested?.exercise_uuid === "string"
            ? nested.exercise_uuid
            : undefined,
    sets: sets ?? parseNumber(nested?.sets as string | undefined),
    reps,
    rest_seconds: rest ?? parseNumber(nested?.rest_period as string | undefined),
    time_seconds: time ?? parseNumber(nested?.time_period as string | undefined),
    notes: typeof record.notes === "string" ? record.notes : undefined,
    sequence,
    body_parts: bodyParts.length > 0 ? bodyParts : undefined,
    // media omitted from summary output to keep payload concise
  };
}

function extractBodyPartsFromValue(
  value: unknown
): Array<{ name: string; volume?: number }> {
  if (!value) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => {
      const name = typeof entry.body_part_name === "string" ? entry.body_part_name : undefined;
      if (!name) {
        return undefined;
      }
      const rawVolume =
        typeof entry.body_volume === "number"
          ? entry.body_volume
          : typeof entry.body_volume === "string"
            ? Number.parseFloat(entry.body_volume)
            : undefined;
      const volume = Number.isFinite(rawVolume ?? NaN) ? rawVolume : undefined;
      const result: { name: string; volume?: number } = { name };
      if (volume !== undefined) {
        result.volume = volume;
      }
      return result;
    })
    .filter(
      (entry): entry is { name: string; volume?: number } =>
        Boolean(entry && entry.name)
    );
}

function extractMediaFromValue(
  value: unknown
): Array<{ file_url?: string; thumbnail_url?: string; file_type?: number }> {
  if (!value) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => ({
      file_url: typeof entry.file_url === "string" ? entry.file_url : undefined,
      thumbnail_url: typeof entry.thumbnail_url === "string" ? entry.thumbnail_url : undefined,
      file_type: typeof entry.file_type === "number" ? entry.file_type : undefined
    }))
    .filter((entry) => Boolean(entry.file_url) || Boolean(entry.thumbnail_url));
}

function extractTotalVolumeFromRecord(record: Record<string, unknown>): {
  body_part: string;
  sets: number;
}[] {
  const bodypart = record.bodypart ?? record.body_parts;
  if (!Array.isArray(bodypart)) {
    return [];
  }
  const totals: { body_part: string; sets: number }[] = [];
  for (const entry of bodypart) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const data = entry as Record<string, unknown>;
    if (typeof data.body_part_name !== "string") {
      continue;
    }
    const setsValue =
      typeof data.body_volume === "number"
        ? data.body_volume
        : typeof data.body_volume === "string"
          ? Number.parseFloat(data.body_volume)
          : undefined;
    if (setsValue === undefined || !Number.isFinite(setsValue)) {
      continue;
    }
    totals.push({ body_part: data.body_part_name, sets: setsValue });
  }
  return totals;
}

function wrapExercises(exercises: WorkoutExerciseSummary[]): WorkoutExerciseGroup[] {
  const sorted = [...exercises].sort((a, b) => {
    const aSeq = parseSequence(a.sequence);
    const bSeq = parseSequence(b.sequence);
    if (aSeq !== undefined && bSeq !== undefined) {
      return aSeq - bSeq;
    }
    if (aSeq !== undefined) {
      return -1;
    }
    if (bSeq !== undefined) {
      return 1;
    }
    return 0;
  });
  return sorted.map((exercise) => ({ type: "straight", exercises: [exercise] }));
}

function parseSequence(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveDayIndexFromRecord(record: Record<string, unknown>): number | undefined {
  for (const key of DAY_INDEX_KEYS) {
    const parsed = parseIndex(record[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function resolveDayLabelFromRecord(
  record: Record<string, unknown>,
  dayIndex?: number
): string | undefined {
  const label =
    typeof record.day_title === "string"
      ? record.day_title
      : typeof record.day_name === "string"
        ? record.day_name
        : typeof record.title === "string"
          ? record.title
          : typeof record.name === "string"
            ? record.name
            : undefined;
  if (label) {
    return label.trim();
  }
  if (dayIndex !== undefined) {
    return `Day ${dayIndex + 1}`;
  }
  return undefined;
}

function parseDayIndexFromTitle(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = value.match(/\\bday\\s*(\\d+)/i);
  if (!match) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed - 1;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveWorkoutEventDayIndex(
  event: WorkoutEvent,
  program: unknown
): number | undefined {
  return resolveEventDayIndex(event as Record<string, unknown>, program);
}

export function findWorkoutPreviewHtmlMatch(value: unknown): PreviewHtmlMatch | undefined {
  const queue: Array<{ value: unknown; path: string }> = [{ value, path: "$" }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const { value: entry, path } = current;
    if (typeof entry === "string") {
      if (
        entry.includes("workoutdays_data") ||
        entry.includes("preview_day_content") ||
        entry.includes("table_workout")
      ) {
        return { html: entry, source: path };
      }
      continue;
    }
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => {
        queue.push({ value: item, path: `${path}[${index}]` });
      });
      continue;
    }
    if (entry && typeof entry === "object") {
      for (const [key, child] of Object.entries(entry as Record<string, unknown>)) {
        queue.push({ value: child, path: `${path}.${formatPathKey(key)}` });
      }
    }
  }
  return undefined;
}

function resolveEventDayIndex(
  event: Record<string, unknown>,
  program: unknown
): number | undefined {
  for (const key of DAY_INDEX_KEYS) {
    const value = event[key];
    const parsed = parseIndex(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  const workoutUuid =
    typeof event.workout === "string"
      ? event.workout
      : typeof event.workout_uuid === "string"
        ? event.workout_uuid
        : undefined;
  if (workoutUuid) {
    const found = findDayIndexByWorkoutUuid(program, workoutUuid);
    if (found !== undefined) {
      return found;
    }
  }

  const workoutDayUuid =
    typeof event.workout_day_uuid === "string" ? event.workout_day_uuid : undefined;
  if (workoutDayUuid) {
    const found = findDayIndexByUuid(program, workoutDayUuid);
    if (found !== undefined) {
      return found;
    }
  }

  const workoutDayId = parseIndex(event.workout_day_id ?? event.day_id);
  if (workoutDayId !== undefined) {
    const found = findDayIndexById(program, workoutDayId);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function extractProgramSummary(
  uuid: string,
  program: unknown
): { uuid?: string; title?: string } | null {
  if (!program || typeof program !== "object") {
    return { uuid };
  }
  const record = program as Record<string, unknown>;
  const title =
    typeof record.title === "string"
      ? record.title
      : typeof record.name === "string"
        ? record.name
        : undefined;
  return { uuid, title };
}

function extractWorkoutDayBlocks(html: string): Map<number, string> {
  const blocks = new Map<number, string>();
  const regex = /<div[^>]*\bid=(["'])day_content_(\d+)\1[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const index = Number.parseInt(match[2], 10);
    if (Number.isNaN(index)) {
      continue;
    }
    const start = match.index;
    const block = extractDivBlock(html, start);
    if (block) {
      blocks.set(index, block);
    }
  }
  return blocks;
}

function selectWorkoutDayBlock(
  blocks: Map<number, string>,
  dayIndex?: number
): { index: number; html: string } | undefined {
  if (dayIndex !== undefined) {
    const direct = blocks.get(dayIndex);
    if (direct) {
      return { index: dayIndex, html: direct };
    }
    const adjusted = blocks.get(dayIndex - 1);
    if (adjusted && dayIndex > 0) {
      return { index: dayIndex - 1, html: adjusted };
    }
  }
  if (blocks.size === 1) {
    const [index, html] = Array.from(blocks.entries())[0];
    return { index, html };
  }
  for (const [index, html] of blocks.entries()) {
    if (/display\s*:\s*block/i.test(html)) {
      return { index, html };
    }
  }
  if (blocks.size > 0) {
    const [index, html] = Array.from(blocks.entries())[0];
    return { index, html };
  }
  return undefined;
}

function extractDivBlock(html: string, startIndex: number): string {
  const tagRegex = /<div\b[^>]*>|<\/div\s*>/gi;
  tagRegex.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(startIndex, tagRegex.lastIndex);
      }
    } else {
      depth += 1;
    }
  }
  return html.slice(startIndex);
}

function extractSectionHtml(html: string, className: string): string | undefined {
  const marker = html.indexOf(className);
  if (marker === -1) {
    return undefined;
  }
  const divStart = html.lastIndexOf("<div", marker);
  if (divStart === -1) {
    return undefined;
  }
  return extractDivBlock(html, divStart);
}

function parseTotalVolumeSets(html: string): { body_part: string; sets: number }[] {
  const results: { body_part: string; sets: number }[] = [];
  const regex = /<span[^>]*total-volume-span[^>]*>(.*?)<\/span>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const text = decodeHtmlEntities(match[1].trim());
    const parsed = parseBodyPartVolume(text);
    if (parsed) {
      results.push(parsed);
    }
  }
  return results;
}

function parseBodyPartVolume(value: string): { body_part: string; sets: number } | undefined {
  const match = value.match(/^(.*?)(?:\s+)(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return undefined;
  }
  const sets = Number.parseFloat(match[2]);
  if (!Number.isFinite(sets)) {
    return undefined;
  }
  return { body_part: match[1].trim(), sets };
}

function buildExerciseGroups(sectionHtml: string): WorkoutExerciseGroup[] {
  const supersetTables = extractSupersetTables(sectionHtml);
  const supersetRanges = supersetTables.map((table) => ({
    start: table.start,
    end: table.end
  }));

  const supersetGroups: Array<{ index: number; group: WorkoutExerciseGroup }> = [];
  for (const table of supersetTables) {
    const exercises = parseExercisesWithIndex(table.html).map((row) => row.exercise);
    if (exercises.length === 0) {
      continue;
    }
    supersetGroups.push({
      index: table.start,
      group: { type: "superset", label: "Superset", exercises }
    });
  }

  const straightGroups: Array<{ index: number; group: WorkoutExerciseGroup }> = [];
  for (const row of parseExercisesWithIndex(sectionHtml)) {
    if (isIndexInRanges(row.index, supersetRanges)) {
      continue;
    }
    if (row.classValue.includes("subrow")) {
      continue;
    }
    straightGroups.push({
      index: row.index,
      group: { type: "straight", exercises: [row.exercise] }
    });
  }

  return [...supersetGroups, ...straightGroups]
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.group);
}

function parseExercisesWithIndex(
  html: string
): Array<{ index: number; exercise: WorkoutExerciseSummary; classValue: string }> {
  const rows: Array<{ index: number; exercise: WorkoutExerciseSummary; classValue: string }> = [];
  const regex = /<tr\b[^>]*\bdata-exercise_name=(["']).*?\1[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[0];
    const exercise = parseExerciseFromTag(tag);
    if (!exercise) {
      continue;
    }
    rows.push({
      index: match.index,
      exercise,
      classValue: extractAttribute(tag, "class") ?? ""
    });
  }
  return rows;
}

function parseExerciseFromTag(tag: string): WorkoutExerciseSummary | null {
  const attrs = extractDataAttributes(tag);
  const name = attrs["exercise_name"];
  if (!name) {
    return null;
  }
  const sets = parseNumber(attrs["sets"]);
  const restSeconds = parseNumber(attrs["rest_period"]);
  const timeSeconds = parseNumber(attrs["time_period"]);
  const bodyParts = parseBodyParts(attrs["bodypart"]);
  const media = parseMedia(attrs["media"]);

  return {
    name,
    uuid: attrs["exercise_uuid"],
    sets,
    reps: attrs["reps"] || undefined,
    rest_seconds: restSeconds,
    time_seconds: timeSeconds,
    notes: attrs["notes"] || undefined,
    sequence: attrs["number"] || undefined,
    body_parts: bodyParts.length > 0 ? bodyParts : undefined,
    media: media.length > 0 ? media : undefined
  };
}

type TableBlock = { start: number; end: number; html: string };

function extractSupersetTables(html: string): TableBlock[] {
  const tables = extractTableBlocks(html);
  const candidates = tables.filter((table) => /Superset/i.test(table.html));
  return candidates.filter((candidate) => !containsSmallerSuperset(candidate, candidates));
}

function containsSmallerSuperset(candidate: TableBlock, candidates: TableBlock[]): boolean {
  const candidateSize = candidate.end - candidate.start;
  return candidates.some((other) => {
    if (other === candidate) {
      return false;
    }
    const otherSize = other.end - other.start;
    return (
      other.start >= candidate.start &&
      other.end <= candidate.end &&
      otherSize < candidateSize
    );
  });
}

function extractTableBlocks(html: string): TableBlock[] {
  const blocks: TableBlock[] = [];
  const regex = /<table\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const start = match.index;
    const block = extractTableBlock(html, start);
    if (!block) {
      continue;
    }
    blocks.push({ start, end: block.end, html: block.html });
  }
  return blocks;
}

function extractTableBlock(html: string, startIndex: number): { html: string; end: number } | null {
  const tagRegex = /<table\b[^>]*>|<\/table\s*>/gi;
  tagRegex.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return { html: html.slice(startIndex, tagRegex.lastIndex), end: tagRegex.lastIndex };
      }
    } else {
      depth += 1;
    }
  }
  return { html: html.slice(startIndex), end: html.length };
}

function parseBodyParts(value: string | undefined): Array<{ name: string; volume?: number }> {
  if (!value) {
    return [];
  }
  const decoded = decodeHtmlEntities(value);
  const parsed = parseJson(decoded);
  if (!Array.isArray(parsed)) {
    return [];
  }
  const results: Array<{ name: string; volume?: number }> = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record.body_part_name === "string" ? record.body_part_name : undefined;
    if (!name) {
      continue;
    }
    const volumeValue =
      typeof record.body_volume === "number"
        ? record.body_volume
        : typeof record.body_volume === "string"
          ? Number.parseFloat(record.body_volume)
          : undefined;
    results.push({
      name,
      volume: Number.isFinite(volumeValue) ? volumeValue : undefined
    });
  }
  return results;
}

function parseMedia(
  value: string | undefined
): Array<{ file_url?: string; thumbnail_url?: string; file_type?: number }> {
  if (!value) {
    return [];
  }
  const decoded = decodeHtmlEntities(value);
  const parsed = parseJson(decoded);
  if (!Array.isArray(parsed)) {
    return [];
  }
  const results: Array<{ file_url?: string; thumbnail_url?: string; file_type?: number }> = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const fileUrl = typeof record.file_url === "string" ? record.file_url : undefined;
    const fileType = typeof record.file_type === "number" ? record.file_type : undefined;
    const mediaEntry: { file_url?: string; thumbnail_url?: string; file_type?: number } = {
      file_type: fileType
    };
    if (fileType === 2) {
      mediaEntry.thumbnail_url = fileUrl;
    } else {
      mediaEntry.file_url = fileUrl;
    }
    if (mediaEntry.file_url || mediaEntry.thumbnail_url) {
      results.push(mediaEntry);
    }
  }
  return results;
}

function extractDataAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /\sdata-([a-z0-9_-]+)=(["'])(.*?)\2/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(tag)) !== null) {
    attrs[match[1]] = decodeHtmlEntities(match[3]);
  }
  return attrs;
}

function extractAttribute(tag: string, name: string): string | undefined {
  const regex = new RegExp(`\\s${name}=(["'])(.*?)\\1`, "i");
  const match = tag.match(regex);
  return match ? match[2] : undefined;
}

function decodeHtmlEntities(value: string): string {
  let result = value;
  for (const [entity, replacement] of Object.entries(HTML_ENTITY_MAP)) {
    result = result.split(entity).join(replacement);
  }
  return result;
}

function isIndexInRanges(index: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseIndex(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function findDayIndexByWorkoutUuid(program: unknown, workoutUuid: string): number | undefined {
  const queue: Array<{ value: unknown; indexInArray?: number }> = [{ value: program }];
  while (queue.length > 0) {
    const { value, indexInArray } = queue.shift() ?? {};
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        queue.push({ value: entry, indexInArray: index });
      });
      continue;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const candidateUuid =
        typeof record.workout_uuid === "string"
          ? record.workout_uuid
          : typeof record.workout === "string"
            ? record.workout
            : typeof record.uuid === "string"
              ? record.uuid
              : undefined;
      if (candidateUuid && candidateUuid === workoutUuid) {
        for (const key of DAY_INDEX_KEYS) {
          const parsed = parseIndex(record[key]);
          if (parsed !== undefined) {
            return parsed;
          }
        }
        if (indexInArray !== undefined) {
          return indexInArray;
        }
      }
      for (const entry of Object.values(record)) {
        queue.push({ value: entry });
      }
    }
  }
  return undefined;
}

function findDayIndexByUuid(program: unknown, uuid: string): number | undefined {
  return findDayIndexByMatcher(program, (record) => record.uuid === uuid);
}

function findDayIndexById(program: unknown, id: number): number | undefined {
  return findDayIndexByMatcher(program, (record) => record.id === id);
}

function findDayIndexByMatcher(
  program: unknown,
  matcher: (record: Record<string, unknown>) => boolean
): number | undefined {
  const queue: Array<{ value: unknown; indexInArray?: number }> = [{ value: program }];
  while (queue.length > 0) {
    const { value, indexInArray } = queue.shift() ?? {};
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        queue.push({ value: entry, indexInArray: index });
      });
      continue;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (matcher(record)) {
        for (const key of DAY_INDEX_KEYS) {
          const parsed = parseIndex(record[key]);
          if (parsed !== undefined) {
            return parsed;
          }
        }
        if (indexInArray !== undefined) {
          return indexInArray;
        }
      }
      for (const entry of Object.values(record)) {
        queue.push({ value: entry });
      }
    }
  }
  return undefined;
}

function formatPathKey(key: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
    return key;
  }
  return `\"${key.replace(/\"/g, '\\"')}\"`;
}
