import type { WorkoutDaySummary, WorkoutEventSummary } from "../events";

type WorkoutPageData = {
  summary?: WorkoutEventSummary;
  days: WorkoutDaySummary[];
  dayDateMap?: Record<string, string>;
  selectedDayIndex?: number;
  timezone: string;
  apiPath: string;
  refreshPath: string;
  isLatest?: boolean;
  selectedEventId?: string | number;
};

export type { WorkoutPageData };
