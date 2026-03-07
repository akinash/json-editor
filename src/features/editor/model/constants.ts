import { TimeMap } from "@/shared/types/config";

export const DEFAULT_URL =
  "https://cdnweb.sberbank.ru/greeting/loaders/web_config_v3.json";

export const TIME_KEYS = ["morning", "day", "evening", "night"] as const;

export const TIME_DEFAULT_MAP: TimeMap = {
  morning: "day",
  day: "day",
  evening: "night",
  night: "night",
};
