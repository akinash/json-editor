import { describe, expect, it } from "vitest";
import {
  applyRuleType,
  buildFileNames,
  detectRuleType,
  ensureEntryShape,
  getMissingGradientParts,
  isValidGradientCss,
  normalizeRangeDateForJson,
  parseConfigJson,
  parseDayMonth,
  serializeConfig,
  validateEntries,
} from "./configModel";
import type { ConfigEntry, Options } from "@/shared/types/config";

function makeEntry(key: string, options: Partial<Options>, portrait: Partial<Options> = {}): ConfigEntry {
  return {
    key,
    data: ensureEntryShape(
      {
        value: key,
        "value-portrait": `${key}-portrait`,
        options,
        "options-portrait": portrait,
      },
      key,
    ),
  };
}

describe("isValidGradientCss", () => {
  it("accepts plain linear-gradient", () => {
    expect(
      isValidGradientCss(
        "linear-gradient(150.00deg, rgb(139, 172, 200) 20.000%,rgb(189, 168, 159) 56.000%,rgb(237, 243, 243) 92.000%)",
      ),
    ).toBe(true);
  });

  it("accepts linear-gradient with trailing fallback color and >100% stop", () => {
    expect(
      isValidGradientCss(
        "linear-gradient(0.00deg, rgb(245, 247, 248) 16.785%,rgb(242, 177, 141) 52.061%,rgb(100, 162, 201) 101.123%),rgb(255, 255, 255)",
      ),
    ).toBe(true);
  });

  it("rejects invalid syntax", () => {
    expect(isValidGradientCss("rgb(1, 2, 3)")).toBe(false);
  });
});

describe("getMissingGradientParts", () => {
  it("returns general part when plain gradient is empty", () => {
    expect(getMissingGradientParts({ gradient: "", aspectRatio: "xMaxYMid" })).toEqual(["общий"]);
  });

  it("returns missing used suffixes when time-of-day mode is enabled", () => {
    const options: Options = {
      aspectRatio: "xMaxYMid",
      morning: "day",
      day: "day",
      evening: "night",
      night: "night",
      gradient: {
        day: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
      },
    };
    expect(getMissingGradientParts(options)).toEqual(["night"]);
  });
});

describe("validateEntries", () => {
  it("reports format issues for wrong day_of_year fields", () => {
    const entry = makeEntry(
      "bad_days",
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
        startDayOfYear: "0",
        endDayOfYear: "366",
      },
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
      },
    );
    const issues = validateEntries([entry]);
    expect(issues.some((i) => i.level === "error" && i.message.includes("startDayOfYear"))).toBe(true);
    expect(issues.some((i) => i.level === "error" && i.message.includes("endDayOfYear"))).toBe(true);
  });

  it("does not report errors for valid minimal entry", () => {
    const entry = makeEntry(
      "ok_entry",
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
      },
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
      },
    );
    const issues = validateEntries([entry]);
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("warns when date ranges overlap", () => {
    const first = makeEntry(
      "march_a",
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
        start: "01.03.****",
        end: "10.03.****",
      },
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
      },
    );
    const second = makeEntry(
      "march_b",
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
        start: "05.03.****",
        end: "12.03.****",
      },
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
      },
    );

    const issues = validateEntries([first, second]);
    expect(
      issues.some((issue) => issue.level === "warn" && issue.message.includes("пересечением дат")),
    ).toBe(true);
  });
});

describe("parseConfigJson / serializeConfig", () => {
  it("parses top-level object into entries with normalized shape", () => {
    const entries = parseConfigJson(
      JSON.stringify({
        autumn_2025: {
          value: "ignored",
          description: "Осень",
          "value-portrait": "ignored-too",
          options: {
            aspectRatio: "xMaxYMid",
            gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
          },
          "options-portrait": {
            aspectRatio: "xMaxYMid",
            gradient: "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
          },
        },
      }),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("autumn_2025");
    expect(entries[0].data.value).toBe("autumn_2025");
    expect(entries[0].data["value-portrait"]).toBe("autumn_2025-portrait");
    expect(entries[0].data.description).toBe("Осень");
  });

  it("rejects non-object JSON at top level", () => {
    expect(() => parseConfigJson("[]")).toThrow("JSON должен быть объектом верхнего уровня");
  });

  it("serializes entries back to normalized JSON", () => {
    const entry = makeEntry(
      "winter",
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
      },
      {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
      },
    );

    const serialized = serializeConfig([entry]);
    const parsed = JSON.parse(serialized);

    expect(Object.keys(parsed)).toEqual(["winter"]);
    expect(parsed.winter.value).toBe("winter");
    expect(parsed.winter["value-portrait"]).toBe("winter-portrait");
  });
});

describe("rule helpers", () => {
  it("detects rule type by populated fields", () => {
    expect(detectRuleType({ aspectRatio: "xMaxYMid", gradient: "", start: "", end: "" })).toBe("range");
    expect(
      detectRuleType({ aspectRatio: "xMaxYMid", gradient: "", startDayOfYear: "", endDayOfYear: "" }),
    ).toBe("day_of_year");
    expect(
      detectRuleType({ aspectRatio: "xMaxYMid", gradient: "", xDayOfWeek: "", yWeek: "", zMonth: "" }),
    ).toBe("weekday_in_month");
    expect(detectRuleType({ aspectRatio: "xMaxYMid", gradient: "" })).toBe("default");
  });

  it("applyRuleType clears previous mode fields and sets current mode fields", () => {
    const next = applyRuleType(
      {
        aspectRatio: "xMaxYMid",
        gradient: "",
        start: "01.03.****",
        end: "10.03.****",
        startDayOfYear: "60",
        endDayOfYear: "70",
      },
      "weekday_in_month",
    );

    expect(next.start).toBeUndefined();
    expect(next.end).toBeUndefined();
    expect(next.startDayOfYear).toBeUndefined();
    expect(next.endDayOfYear).toBeUndefined();
    expect(next.xDayOfWeek).toBe("");
    expect(next.yWeek).toBe("");
    expect(next.zMonth).toBe("");
  });
});

describe("date helpers", () => {
  it("normalizes range date to JSON format", () => {
    expect(normalizeRangeDateForJson("7.3")).toBe("07.03.****");
  });

  it("keeps invalid range date as-is during normalization", () => {
    expect(normalizeRangeDateForJson("32.13")).toBe("32.13");
  });

  it("parses valid day-month strings and rejects invalid ones", () => {
    expect(parseDayMonth("23.02.****")).toMatchObject({ day: 23, month: 2, doy: 54 });
    expect(parseDayMonth("31.02.****")).toBeNull();
  });
});

describe("buildFileNames", () => {
  it("returns a single filename when time-of-day mode is disabled", () => {
    expect(buildFileNames("autumn", { aspectRatio: "xMaxYMid", gradient: "" })).toEqual(["autumn.jpeg"]);
  });

  it("returns unique filenames for used time-of-day suffixes", () => {
    expect(
      buildFileNames("autumn", {
        aspectRatio: "xMaxYMid",
        gradient: {
          day: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
          night: "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
        },
        morning: "day",
        day: "day",
        evening: "night",
        night: "night",
      }),
    ).toEqual(["autumn-day.jpeg", "autumn-night.jpeg"]);
  });
});
