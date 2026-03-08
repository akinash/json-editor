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

    const desktopMissing = getMissingGradientParts(entry.data.options);
    const mobileMissing = getMissingGradientParts(entry.data["options-portrait"]);
    if (desktopMissing.length || mobileMissing.length) {
      const sections: string[] = [];
      if (desktopMissing.length) {
        sections.push(`Desktop: ${desktopMissing.join(", ")}`);
      }
      if (mobileMissing.length) {
        sections.push(`Mobile: ${mobileMissing.join(", ")}`);
      }
      issues.push({
        level: "error",
        message: `Код "${entry.key}" не заполнен градиент (${sections.join("; ")}).`,
        keys: [entry.key],
      });
    }

    const contentErrors = collectEntryContentErrors(entry);
    if (contentErrors.length) {
      issues.push({
        level: "error",
        message: `Код "${entry.key}": ${contentErrors.join("; ")}.`,
        keys: [entry.key],
      });
    }
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

export function getMissingGradientParts(options: Options): string[] {
  if (!isTimeOfDayEnabled(options)) {
    const gradient = typeof options.gradient === "string" ? options.gradient.trim() : "";
    return gradient ? [] : ["общий"];
  }

  const gradientObj =
    options.gradient && typeof options.gradient === "object" && !Array.isArray(options.gradient)
      ? options.gradient
      : {};
  const suffixes = Array.from(new Set(TIME_KEYS.map((key) => options[key]).filter(Boolean) as TimeKey[]));
  if (!suffixes.length) {
    return ["общий"];
  }
  return suffixes.filter((suffix) => !`${gradientObj[suffix] ?? ""}`.trim());
}

function collectEntryContentErrors(entry: ConfigEntry): string[] {
  const errors: string[] = [];
  const desktopErrors = collectOptionsContentErrors(entry.data.options);
  const mobileErrors = collectOptionsContentErrors(entry.data["options-portrait"]);
  if (desktopErrors.length) {
    errors.push(`Desktop: ${desktopErrors.join(", ")}`);
  }
  if (mobileErrors.length) {
    errors.push(`Mobile: ${mobileErrors.join(", ")}`);
  }
  return errors;
}

function collectOptionsContentErrors(options: Options): string[] {
  const errors: string[] = [];
  const type = detectRuleType(options);

  if (!`${options.aspectRatio ?? ""}`.trim()) {
    errors.push("пустое поле aspectRatio");
  }

  if (type === "range") {
    const start = `${options.start ?? ""}`.trim();
    const end = `${options.end ?? ""}`.trim();
    if (!start || !end) {
      errors.push("для диапазона дат нужно заполнить start и end");
    } else {
      if (!parseDayMonth(start)) errors.push("некорректный формат start (ожидается ДД.ММ или ДД.ММ.ГГГГ/****)");
      if (!parseDayMonth(end)) errors.push("некорректный формат end (ожидается ДД.ММ или ДД.ММ.ГГГГ/****)");
    }
  }

  if (type === "day_of_year") {
    const start = `${options.startDayOfYear ?? ""}`.trim();
    const end = `${options.endDayOfYear ?? ""}`.trim();
    if (!start || !end) {
      errors.push("для day_of_year нужно заполнить startDayOfYear и endDayOfYear");
    } else {
      const startNum = Number(start);
      const endNum = Number(end);
      if (!Number.isInteger(startNum) || startNum < 1 || startNum > 365) {
        errors.push("startDayOfYear должен быть целым числом 1..365");
      }
      if (!Number.isInteger(endNum) || endNum < 1 || endNum > 365) {
        errors.push("endDayOfYear должен быть целым числом 1..365");
      }
    }
  }

  if (type === "weekday_in_month") {
    const x = `${options.xDayOfWeek ?? ""}`.trim();
    const y = `${options.yWeek ?? ""}`.trim();
    const z = `${options.zMonth ?? ""}`.trim();
    if (!x || !y || !z) {
      errors.push("для weekday_in_month нужно заполнить xDayOfWeek, yWeek и zMonth");
    } else {
      const xNum = Number(x);
      const yNum = Number(y);
      const zNum = Number(z);
      if (!Number.isInteger(xNum) || xNum < 1 || xNum > 7) {
        errors.push("xDayOfWeek должен быть целым числом 1..7");
      }
      if (!Number.isInteger(yNum) || yNum < -5 || yNum > 5 || yNum === 0) {
        errors.push("yWeek должен быть целым числом в диапазоне -5..-1 или 1..5");
      }
      if (!Number.isInteger(zNum) || zNum < 1 || zNum > 12) {
        errors.push("zMonth должен быть целым числом 1..12");
      }
    }
  }

  if (!isTimeOfDayEnabled(options)) {
    const gradient = typeof options.gradient === "string" ? options.gradient.trim() : "";
    if (gradient && !isValidGradientCss(gradient)) {
      errors.push("некорректный формат gradient (ожидается linear-gradient(...))");
    }
    return errors;
  }

  const gradientObj =
    options.gradient && typeof options.gradient === "object" && !Array.isArray(options.gradient)
      ? options.gradient
      : {};
  TIME_KEYS.forEach((key) => {
    const mapped = options[key];
    if (!mapped) return;
    if (!TIME_KEYS.includes(mapped)) {
      errors.push(`${key} содержит недопустимое значение "${mapped}"`);
    }
  });
  const usedSuffixes = Array.from(new Set(TIME_KEYS.map((key) => options[key]).filter(Boolean) as TimeKey[]));
  usedSuffixes.forEach((suffix) => {
    const gradient = `${gradientObj[suffix] ?? ""}`.trim();
    if (gradient && !isValidGradientCss(gradient)) {
      errors.push(`некорректный gradient для "${suffix}" (ожидается linear-gradient(...))`);
    }
  });

  return errors;
}

function isValidGradientCss(value: string): boolean {
  const raw = value.trim();
  const match = raw.match(/^linear-gradient\(([\s\S]+?)\)\s*(?:,\s*(rgb\([^)]+\)|#[0-9a-fA-F]{6}))?\s*$/i);
  if (!match) return false;
  const gradientPart = `linear-gradient(${match[1]})`;
  const angle = gradientPart.match(/linear-gradient\(([-\d.]+)deg/i);
  if (!angle || !Number.isFinite(Number(angle[1]))) return false;
  const stops = [...gradientPart.matchAll(/(rgb\([^\)]+\)|#[0-9a-fA-F]{6})\s+([\d.]+)%/g)];
  if (stops.length < 2) return false;
  return stops.every((s) => {
    const pos = Number(s[2]);
    return Number.isFinite(pos) && pos >= 0;
  });
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
