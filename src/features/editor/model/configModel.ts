import {
  ConfigEntry,
  ConfigEntryData,
  DateRuleType,
  Options,
  TimeKey,
  ValidationIssue,
} from "@/shared/types/config";
import { TIME_DEFAULT_MAP, TIME_KEYS } from "./constants";

const codePattern = /^[A-Za-z0-9_]{1,25}$/;
const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function parseConfigJson(jsonText: string): ConfigEntry[] {
  if (!jsonText.trim()) {
    return [];
  }
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON должен быть объектом верхнего уровня");
  }
  return Object.entries(parsed).map(([key, data]) => ({
    key,
    data: ensureEntryShape(data as Partial<ConfigEntryData>, key),
  }));
}

export function serializeConfig(entries: ConfigEntry[]): string {
  const result: Record<string, ConfigEntryData> = {};
  entries.forEach((entry) => {
    result[entry.key] = ensureEntryShape(entry.data, entry.key);
  });
  return JSON.stringify(result, null, 2);
}

export function ensureEntryShape(raw: Partial<ConfigEntryData>, key: string): ConfigEntryData {
  const data: ConfigEntryData = {
    value: raw.value ?? key,
    description: raw.description ?? "",
    "value-portrait": raw["value-portrait"] ?? `${key}-portrait`,
    options: ensureOptions(raw.options),
    "options-portrait": ensureOptions(raw["options-portrait"]),
  };

  data.value = key;
  data["value-portrait"] = `${key}-portrait`;
  return data;
}

function ensureOptions(raw?: Partial<Options>): Options {
  const options: Options = {
    ...raw,
    aspectRatio: raw?.aspectRatio ?? "xMaxYMid",
    gradient: raw?.gradient ?? "",
  };
  if (isTimeOfDayEnabled(options)) {
    enableTimeOfDay(options);
  }
  return options;
}

export function normalizeCode(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 25);
}

export function isCodeValid(code: string): boolean {
  return codePattern.test(code);
}

export function setEntryCode(entry: ConfigEntry, nextCode: string): ConfigEntry {
  const clean = normalizeCode(nextCode);
  return {
    key: clean,
    data: {
      ...entry.data,
      value: clean,
      "value-portrait": `${clean}-portrait`,
    },
  };
}

export function detectRuleType(options: Options): DateRuleType {
  if ("start" in options || "end" in options) return "range";
  if ("startDayOfYear" in options || "endDayOfYear" in options) return "day_of_year";
  if ("xDayOfWeek" in options || "yWeek" in options || "zMonth" in options) {
    return "weekday_in_month";
  }
  return "default";
}

export function applyRuleType(options: Options, type: DateRuleType): Options {
  const next = { ...options };
  delete next.start;
  delete next.end;
  delete next.startDayOfYear;
  delete next.endDayOfYear;
  delete next.xDayOfWeek;
  delete next.yWeek;
  delete next.zMonth;

  if (type === "range") {
    next.start = "";
    next.end = "";
  }
  if (type === "day_of_year") {
    next.startDayOfYear = "";
    next.endDayOfYear = "";
  }
  if (type === "weekday_in_month") {
    next.xDayOfWeek = "";
    next.yWeek = "";
    next.zMonth = "";
  }
  return next;
}

export function normalizeRangeDateForJson(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const parsed = parseDayMonth(raw);
  if (!parsed) return raw;
  return `${pad2(parsed.day)}.${pad2(parsed.month)}.****`;
}

export function uiDateFromJsonDate(value?: string): string {
  const raw = `${value ?? ""}`.trim();
  if (!raw) return "";
  const parsed = parseDayMonth(raw);
  if (!parsed) return raw;
  return `${pad2(parsed.day)}.${pad2(parsed.month)}`;
}

export function parseDayMonth(input: string): { day: number; month: number; doy: number } | null {
  const match = input.trim().match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}|\*{4}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth[month - 1]) return null;
  const doy = daysInMonth.slice(0, month - 1).reduce((a, b) => a + b, 0) + day;
  return { day, month, doy };
}

function pad2(v: number): string {
  return String(v).padStart(2, "0");
}

export function getRuleSummary(options: Options): string {
  const type = detectRuleType(options);
  if (type === "default") return "По-умолчанию";
  if (type === "range") {
    return `${uiDateFromJsonDate(options.start) || "-"} → ${uiDateFromJsonDate(options.end) || "-"}`;
  }
  if (type === "day_of_year") {
    return `Дни года: ${options.startDayOfYear || "-"} → ${options.endDayOfYear || "-"}`;
  }
  return `Неделя/месяц: ${options.xDayOfWeek || "-"}/${options.yWeek || "-"}/${options.zMonth || "-"}`;
}

export function isTimeOfDayEnabled(options: Options): boolean {
  if (TIME_KEYS.some((key) => Boolean((options as Record<TimeKey, string | undefined>)[key]))) {
    return true;
  }
  return !!options.gradient && typeof options.gradient === "object" && !Array.isArray(options.gradient);
}

export function enableTimeOfDay(options: Options): void {
  TIME_KEYS.forEach((key) => {
    if (!(options as Record<TimeKey, TimeKey | undefined>)[key]) {
      (options as Record<TimeKey, TimeKey>)[key] = TIME_DEFAULT_MAP[key];
    }
  });
  if (!options.gradient || typeof options.gradient === "string") {
    const base = options.gradient ?? "";
    options.gradient = {
      day: base,
      night: base,
    };
  }
}

export function disableTimeOfDay(options: Options): void {
  const gradient =
    typeof options.gradient === "string"
      ? options.gradient
      : (options.gradient?.day ?? options.gradient?.night ?? "");
  TIME_KEYS.forEach((key) => {
    delete (options as Partial<Record<TimeKey, string>>)[key];
  });
  options.gradient = gradient;
}

export function buildFileNames(baseValue: string, options: Options): string[] {
  if (!baseValue) return [];
  if (!isTimeOfDayEnabled(options)) {
    return [`${baseValue}.jpeg`];
  }
  const suffixes = new Set<TimeKey>();
  TIME_KEYS.forEach((period) => {
    const value = (options as Record<TimeKey, TimeKey | undefined>)[period];
    if (value) suffixes.add(value);
  });
  if (!suffixes.size) return [`${baseValue}.jpeg`];
  return Array.from(suffixes).map((suffix) => `${baseValue}-${suffix}.jpeg`);
}

export function validateEntries(entries: ConfigEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const codeSet = new Set<string>();
  entries.forEach((entry) => {
    if (!entry.key) {
      issues.push({ level: "error", message: "Есть объект без кода." });
      return;
    }
    if (!isCodeValid(entry.key)) {
      issues.push({ level: "error", message: `Код \"${entry.key}\" невалидный (латиница/цифры/_ до 25).`, keys: [entry.key] });
    }
    if (codeSet.has(entry.key)) {
      issues.push({ level: "error", message: `Дубликат кода \"${entry.key}\".`, keys: [entry.key] });
    }
    codeSet.add(entry.key);
  });

  const defaults = entries.filter((entry) => detectRuleType(entry.data.options) === "default");
  if (defaults.length > 1) {
    issues.push({
      level: "warn",
      message: "У вас есть несколько объектов без даты.",
      keys: defaults.map((entry) => entry.key),
    });
  }

  const intervals = entries
    .map((entry) => {
      const { options } = entry.data;
      if (detectRuleType(options) !== "range") return null;
      const start = parseDayMonth(uiDateFromJsonDate(options.start));
      const end = parseDayMonth(uiDateFromJsonDate(options.end));
      if (!start || !end) return null;
      return { key: entry.key, start: start.doy, end: end.doy };
    })
    .filter((item): item is { key: string; start: number; end: number } => Boolean(item));

  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const a = intervals[i];
      const b = intervals[j];
      const overlap = !(a.end < b.start || b.end < a.start);
      if (overlap) {
        issues.push({
          level: "warn",
          message: `Есть два объекта с пересечением дат: ${a.key} и ${b.key}.`,
          keys: [a.key, b.key],
        });
      }
    }
  }

  return issues;
}

export function createEmptyEntry(existing: Set<string>): ConfigEntry {
  let i = 1;
  let key = `new_object_${i}`;
  while (existing.has(key)) {
    i += 1;
    key = `new_object_${i}`;
  }
  return {
    key,
    data: ensureEntryShape({}, key),
  };
}
