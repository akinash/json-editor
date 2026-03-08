import { describe, expect, it } from "vitest";
import {
  ensureEntryShape,
  getMissingGradientParts,
  isValidGradientCss,
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
});
