import type { WorkoutDaySummary, WorkoutEventSummary } from "../events";

type WorkoutPageData = {
  summary?: WorkoutEventSummary;
  days: WorkoutDaySummary[];
  dayDateMap?: Record<string, string>;
  sessions?: Array<{
    id: string | number;
    title?: string;
    start?: string;
    program?: string | null;
    programUuid?: string;
  }>;
  selectedDayIndex?: number;
  timezone: string;
  apiPath: string;
  refreshPath: string;
  isLatest?: boolean;
  selectedEventId?: string | number;
  eventSelected?: boolean;
};

export type { WorkoutPageData };
