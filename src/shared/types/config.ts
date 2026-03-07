export type DateRuleType =
  | "default"
  | "range"
  | "day_of_year"
  | "weekday_in_month";

export type TimeKey = "morning" | "day" | "evening" | "night";

export type TimeMap = Record<TimeKey, TimeKey>;

export type GradientValue = string | Partial<Record<TimeKey, string>>;

export interface Options {
  start?: string;
  end?: string;
  startDayOfYear?: string;
  endDayOfYear?: string;
  xDayOfWeek?: string;
  yWeek?: string;
  zMonth?: string;
  aspectRatio?: string;
  gradient?: GradientValue;
  morning?: TimeKey;
  day?: TimeKey;
  evening?: TimeKey;
  night?: TimeKey;
}

export interface ConfigEntryData {
  value: string;
  description?: string;
  "value-portrait": string;
  options: Options;
  "options-portrait": Options;
}

export interface ConfigEntry {
  key: string;
  data: ConfigEntryData;
}

export interface ValidationIssue {
  level: "error" | "warn";
  message: string;
  keys?: string[];
}
