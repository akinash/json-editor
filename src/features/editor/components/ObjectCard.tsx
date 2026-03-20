import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { ConfigEntry, DateRuleType, Options, TimeKey } from "@/shared/types/config";
import { GradientGeneratorField } from "./GradientGeneratorDialog";
import {
  applyRuleType,
  buildFileNames,
  detectRuleType,
  disableTimeOfDay,
  enableTimeOfDay,
  getRuleSummary,
  getMissingGradientParts,
  isValidGradientCss,
  isTimeOfDayEnabled,
  normalizeCode,
  normalizeRangeDateForJson,
  parseDayMonth,
  uiDateFromJsonDate,
} from "@/features/editor/model/configModel";
import { TIME_KEYS } from "@/features/editor/model/constants";

const TIME_LABEL: Record<TimeKey, string> = {
  morning: "Утро",
  day: "День",
  evening: "Вечер",
  night: "Ночь",
};

const FIELD_GRID = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", md: "repeat(12, minmax(0, 1fr))" },
  gap: 1.5,
} as const;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const fileExistsCache = new Map<string, boolean>();
const DESKTOP_RATIO = 5774 / 2436;
const MOBILE_RATIO = 1625 / 2436;
const TIME_LABEL_LOWER: Record<TimeKey, string> = {
  morning: "утро",
  day: "день",
  evening: "вечер",
  night: "ночь",
};
type OptionsFieldErrors = {
  aspectRatio: boolean;
  start: boolean;
  end: boolean;
  startDayOfYear: boolean;
  endDayOfYear: boolean;
  xDayOfWeek: boolean;
  yWeek: boolean;
  zMonth: boolean;
  gradientGeneralInvalid: boolean;
  gradientInvalidSuffixes: Set<TimeKey>;
  invalidTimeKeys: Set<TimeKey>;
};

export function ObjectCard({
  sortableId,
  entry,
  expanded,
  status,
  duplicateCodeSet,
  assetsBaseUrl,
  onExpanded,
  onChange,
  onClone,
  onDelete,
}: {
  sortableId: string;
  entry: ConfigEntry;
  expanded: boolean;
  status: "ok" | "warn" | "error";
  duplicateCodeSet: Set<string>;
  assetsBaseUrl: string;
  onExpanded: (open: boolean) => void;
  onChange: (next: ConfigEntry) => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sortableId });

  const [startUi, setStartUi] = useState(uiDateFromJsonDate(entry.data.options.start));
  const [endUi, setEndUi] = useState(uiDateFromJsonDate(entry.data.options.end));
  const [fileAvailability, setFileAvailability] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setStartUi(uiDateFromJsonDate(entry.data.options.start));
    setEndUi(uiDateFromJsonDate(entry.data.options.end));
  }, [entry.data.options.start, entry.data.options.end]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const ruleType = detectRuleType(entry.data.options);
  const timeDesktop = isTimeOfDayEnabled(entry.data.options);
  const timeMobile = isTimeOfDayEnabled(entry.data["options-portrait"]);
  const desktopFieldErrors = getOptionsFieldErrors(entry.data.options);
  const mobileFieldErrors = getOptionsFieldErrors(entry.data["options-portrait"]);
  const codeError =
    !entry.key.trim()
      ? "Код заставки обязателен."
      : duplicateCodeSet.has(entry.key)
      ? `Код "${entry.key}" уже используется в другом объекте.`
      : "";
  const desktopFiles = useMemo(
    () => buildFileNames(entry.data.value, entry.data.options),
    [entry.data.value, entry.data.options],
  );
  const mobileFiles = useMemo(
    () => buildFileNames(entry.data["value-portrait"], entry.data["options-portrait"]),
    [entry.data["value-portrait"], entry.data["options-portrait"]],
  );
  const allFilesKey = useMemo(() => [...new Set([...desktopFiles, ...mobileFiles])].sort().join("|"), [
    desktopFiles,
    mobileFiles,
  ]);

  useEffect(() => {
    let cancelled = false;
    const allFiles = allFilesKey ? allFilesKey.split("|").filter(Boolean) : [];
    if (!assetsBaseUrl || !allFiles.length) {
      setFileAvailability((prev) => (Object.keys(prev).length ? {} : prev));
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const pairs = await Promise.all(
        allFiles.map(async (fileName) => {
          const fullUrl = buildFileUrl(assetsBaseUrl, fileName);
          const exists = await checkRemoteImageExists(fullUrl);
          return [fileName, exists] as const;
        }),
      );
      if (cancelled) return;
      const next = Object.fromEntries(pairs);
      setFileAvailability((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length !== nextKeys.length) return next;
        for (let i = 0; i < nextKeys.length; i += 1) {
          const key = nextKeys[i];
          if (prev[key] !== next[key]) return next;
        }
        return prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [assetsBaseUrl, allFilesKey]);

  const setOptions = (patch: Partial<Options>, target: "desktop" | "mobile") => {
    const key = target === "desktop" ? "options" : "options-portrait";
    onChange({
      ...entry,
      data: {
        ...entry.data,
        [key]: {
          ...entry.data[key],
          ...patch,
        },
      },
    });
  };

  const replaceOptions = (nextOptions: Options, target: "desktop" | "mobile") => {
    const key = target === "desktop" ? "options" : "options-portrait";
    onChange({
      ...entry,
      data: {
        ...entry.data,
        [key]: nextOptions,
      },
    });
  };

  const setEntry = (patch: Partial<ConfigEntry["data"]>) => {
    onChange({
      ...entry,
      data: {
        ...entry.data,
        ...patch,
      },
    });
  };

  return (
      <Accordion ref={setNodeRef} expanded={expanded} onChange={(_, open) => onExpanded(open)} sx={style}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%" }}>
          <Box
            component="span"
            title={expanded ? "Сначала сверните объект" : "Перетащить"}
            {...(!expanded ? listeners : {})}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
            sx={{
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 1.5,
              color: "text.secondary",
              opacity: expanded ? 0.45 : 1,
              cursor: expanded ? "not-allowed" : "grab",
              flexShrink: 0,
            }}
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography fontWeight={700} noWrap>
              {entry.key || "(без кода)"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {getRuleSummary(entry.data.options)}
            </Typography>
          </Box>
          <Chip
            size="small"
            color={status === "error" ? "error" : status === "warn" ? "warning" : "success"}
            label={status === "ok" ? "OK" : status === "warn" ? "!" : "ERR"}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Box sx={FIELD_GRID}>
            <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 4" } }}>
              <TextField
                label="Код заставки"
                value={entry.key}
                onChange={(e) => {
                  const code = normalizeCode(e.target.value);
                  onChange({
                    ...entry,
                    key: code,
                    data: {
                      ...entry.data,
                      value: code,
                      "value-portrait": `${code}-portrait`,
                    },
                  });
                }}
                fullWidth
                inputProps={{ maxLength: 25 }}
                error={Boolean(codeError)}
                helperText={codeError || undefined}
              />
            </Box>
            <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 8" } }}>
              <TextField
                label="Подпись к заставке"
                value={entry.data.description ?? ""}
                onChange={(e) => setEntry({ description: e.target.value.slice(0, 50) })}
                fullWidth
                inputProps={{ maxLength: 50 }}
              />
            </Box>
            <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 4" } }}>
              <FormControl fullWidth>
                <InputLabel>Тип даты</InputLabel>
                <Select
                  label="Тип даты"
                  value={ruleType}
                  onChange={(e) => {
                    replaceOptions(
                      applyRuleType(entry.data.options, e.target.value as DateRuleType),
                      "desktop",
                    );
                  }}
                >
                  <MenuItem value="default">По умолчанию</MenuItem>
                  <MenuItem value="range">Диапазон дат</MenuItem>
                  <MenuItem value="day_of_year">Номер дня года</MenuItem>
                  <MenuItem value="weekday_in_month">День недели в месяце</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {ruleType === "default" ? (
              <Box sx={{ gridColumn: "1 / -1" }}>
                <Alert severity="info">Заставка без даты. В конфиге может быть только одна такая запись.</Alert>
              </Box>
            ) : null}

            {ruleType === "range" ? (
              <Box sx={{ gridColumn: "1 / -1" }}>
                <Box sx={FIELD_GRID}>
                  <RangeDateBlock
                    startUi={startUi}
                    endUi={endUi}
                    onManualStart={(value) => {
                      setStartUi(value);
                      setOptions({ start: normalizeRangeDateForJson(value) }, "desktop");
                    }}
                    onManualEnd={(value) => {
                      setEndUi(value);
                      setOptions({ end: normalizeRangeDateForJson(value) }, "desktop");
                    }}
                    onApply={(nextStart, nextEnd) => {
                      setStartUi(nextStart);
                      setEndUi(nextEnd);
                      setOptions(
                        {
                          start: normalizeRangeDateForJson(nextStart),
                          end: normalizeRangeDateForJson(nextEnd),
                        },
                        "desktop",
                      );
                    }}
                    onPreview={(nextStart, nextEnd) => {
                      setStartUi(nextStart);
                      setEndUi(nextEnd);
                    }}
                    startError={desktopFieldErrors.start}
                    endError={desktopFieldErrors.end}
                  />
                </Box>
              </Box>
            ) : null}

            {ruleType === "day_of_year" ? (
              <Box sx={{ gridColumn: "1 / -1" }}>
                <Box sx={FIELD_GRID}>
                  <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 4" } }}>
                    <TextField
                      label="День года: с"
                      value={entry.data.options.startDayOfYear ?? ""}
                      onChange={(e) => setOptions({ startDayOfYear: e.target.value }, "desktop")}
                      error={desktopFieldErrors.startDayOfYear}
                      helperText={desktopFieldErrors.startDayOfYear ? "Введите целое число 1..365." : undefined}
                      fullWidth
                    />
                  </Box>
                  <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 4" } }}>
                    <TextField
                      label="День года: по"
                      value={entry.data.options.endDayOfYear ?? ""}
                      onChange={(e) => setOptions({ endDayOfYear: e.target.value }, "desktop")}
                      error={desktopFieldErrors.endDayOfYear}
                      helperText={desktopFieldErrors.endDayOfYear ? "Введите целое число 1..365." : undefined}
                      fullWidth
                    />
                  </Box>
                </Box>
              </Box>
            ) : null}
            {ruleType === "weekday_in_month" ? (
              <Box sx={{ gridColumn: "1 / -1" }}>
                <Box sx={FIELD_GRID}>
                  <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 4" } }}>
                    <TextField
                      label="День недели (1-7)"
                      value={entry.data.options.xDayOfWeek ?? ""}
                      onChange={(e) => setOptions({ xDayOfWeek: e.target.value }, "desktop")}
                      error={desktopFieldErrors.xDayOfWeek}
                      helperText={desktopFieldErrors.xDayOfWeek ? "Введите целое число 1..7." : undefined}
                      fullWidth
                    />
                  </Box>
                  <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 4" } }}>
                    <TextField
                      label="Номер недели"
                      value={entry.data.options.yWeek ?? ""}
                      onChange={(e) => setOptions({ yWeek: e.target.value }, "desktop")}
                      error={desktopFieldErrors.yWeek}
                      helperText={desktopFieldErrors.yWeek ? "Введите -5..-1 или 1..5." : undefined}
                      fullWidth
                    />
                  </Box>
                  <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 4" } }}>
                    <TextField
                      label="Месяц (1-12)"
                      value={entry.data.options.zMonth ?? ""}
                      onChange={(e) => setOptions({ zMonth: e.target.value }, "desktop")}
                      error={desktopFieldErrors.zMonth}
                      helperText={desktopFieldErrors.zMonth ? "Введите целое число 1..12." : undefined}
                      fullWidth
                    />
                  </Box>
                </Box>
              </Box>
            ) : null}
          </Box>

          <PlatformBlock
            title="Desktop"
            baseValue={entry.data.value}
            assetsBaseUrl={assetsBaseUrl}
            fileAvailability={fileAvailability}
            options={entry.data.options}
            fieldErrors={desktopFieldErrors}
            enabled={timeDesktop}
            onToggle={(next) => {
              const options = { ...entry.data.options };
              if (next) {
                enableTimeOfDay(options);
              } else {
                disableTimeOfDay(options);
              }
              replaceOptions(options, "desktop");
            }}
            onChange={(patch) => setOptions(patch, "desktop")}
          />

          <PlatformBlock
            title="Mobile"
            baseValue={entry.data["value-portrait"]}
            assetsBaseUrl={assetsBaseUrl}
            fileAvailability={fileAvailability}
            options={entry.data["options-portrait"]}
            fieldErrors={mobileFieldErrors}
            enabled={timeMobile}
            onToggle={(next) => {
              const options = { ...entry.data["options-portrait"] };
              if (next) {
                enableTimeOfDay(options);
              } else {
                disableTimeOfDay(options);
              }
              replaceOptions(options, "mobile");
            }}
            onChange={(patch) => setOptions(patch, "mobile")}
          />

          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Изображения</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="caption" color="text.secondary">
                Desktop
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {desktopFiles.map((name) => (
                  <li key={name}>
                    <FileNameItem
                      fileName={name}
                      assetsBaseUrl={assetsBaseUrl}
                      exists={fileAvailability[name] === true}
                    />
                  </li>
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Mobile
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {mobileFiles.map((name) => (
                  <li key={name}>
                    <FileNameItem
                      fileName={name}
                      assetsBaseUrl={assetsBaseUrl}
                      exists={fileAvailability[name] === true}
                    />
                  </li>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>

          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button startIcon={<ContentCopyIcon />} onClick={onClone}>
              Дублировать
            </Button>
            <Button startIcon={<DeleteOutlineIcon />} color="error" onClick={onDelete}>
              Удалить
            </Button>
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function FileNameItem({
  fileName,
  assetsBaseUrl,
  exists,
}: {
  fileName: string;
  assetsBaseUrl: string;
  exists: boolean;
}) {
  const fullUrl = assetsBaseUrl ? buildFileUrl(assetsBaseUrl, fileName) : "";
  if (exists && fullUrl) {
    return (
      <Typography
        variant="body2"
        component="a"
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ color: "primary.main", textDecoration: "underline" }}
      >
        {fileName}
      </Typography>
    );
  }
  return <Typography variant="body2">{fileName}</Typography>;
}

function buildFileUrl(base: string, fileName: string): string {
  return `${base.replace(/\/+$/, "")}/${fileName.replace(/^\/+/, "")}`;
}

async function checkRemoteImageExists(url: string): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const cached = fileExistsCache.get(url);
  if (typeof cached === "boolean") return cached;

  const exists = await new Promise<boolean>((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(false), 8000);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(true);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    img.src = url;
  });

  fileExistsCache.set(url, exists);
  return exists;
}

function PlatformBlock({
  title,
  baseValue,
  assetsBaseUrl,
  fileAvailability,
  options,
  fieldErrors,
  enabled,
  onToggle,
  onChange,
}: {
  title: string;
  baseValue: string;
  assetsBaseUrl: string;
  fileAvailability: Record<string, boolean>;
  options: Options;
  fieldErrors: OptionsFieldErrors;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onChange: (patch: Partial<Options>) => void;
}) {
  const gradientObj =
    options.gradient && typeof options.gradient === "object" && !Array.isArray(options.gradient)
      ? options.gradient
      : {};
  const missingGradientParts = getMissingGradientParts(options);
  const missingGradientSet = new Set(missingGradientParts);
  const plainGradientError = !enabled && missingGradientSet.has("общий");

  return (
    <Box sx={{ p: 1.5, border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography fontWeight={700}>{title}</Typography>
        <FormControlLabel
          control={<Switch checked={enabled} onChange={(e) => onToggle(e.target.checked)} />}
          label="Время суток"
        />
      </Stack>
      <Box sx={FIELD_GRID}>
        <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 6" } }}>
          <TextField
            label="Соотношение сторон"
            value={options.aspectRatio ?? ""}
            onChange={(e) => onChange({ aspectRatio: e.target.value })}
            error={fieldErrors.aspectRatio}
            helperText={fieldErrors.aspectRatio ? "Обязательное поле." : undefined}
            fullWidth
          />
        </Box>
        {!enabled ? (
          <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 6" } }}>
            <GradientGeneratorField
              label="Градиент"
              value={typeof options.gradient === "string" ? options.gradient : ""}
              onChange={(nextGradient) => onChange({ gradient: nextGradient })}
              error={plainGradientError || fieldErrors.gradientGeneralInvalid}
              helperText={
                plainGradientError
                  ? "Обязательное поле."
                  : fieldErrors.gradientGeneralInvalid
                  ? "Невалидный формат gradient."
                  : undefined
              }
              cdnImageUrl={assetsBaseUrl ? buildFileUrl(assetsBaseUrl, `${baseValue}.jpeg`) : ""}
              canLoadFromCdn={fileAvailability[`${baseValue}.jpeg`] === true}
              expectedRatio={title === "Desktop" ? DESKTOP_RATIO : MOBILE_RATIO}
              targetLabel={title}
            />
          </Box>
        ) : null}
      </Box>
      {enabled ? (
        <Box sx={{ ...FIELD_GRID, mt: 1 }}>
          {TIME_KEYS.map((key) => (
            <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 3" } }} key={key}>
              <FormControl fullWidth error={fieldErrors.invalidTimeKeys.has(key)}>
                <InputLabel>{TIME_LABEL[key]}</InputLabel>
                <Select
                  label={TIME_LABEL[key]}
                  value={options[key] ?? "day"}
                  onChange={(e) => onChange({ [key]: e.target.value as TimeKey })}
                >
                  <MenuItem value="morning">Утро (morning)</MenuItem>
                  <MenuItem value="day">День (day)</MenuItem>
                  <MenuItem value="evening">Вечер (evening)</MenuItem>
                  <MenuItem value="night">Ночь (night)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          ))}
          {Array.from(new Set(TIME_KEYS.map((k) => options[k]).filter(Boolean) as TimeKey[])).map((suffix) => (
            <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 6" } }} key={suffix}>
              <GradientGeneratorField
                label={`Градиент ${suffix}`}
                value={gradientObj[suffix] ?? ""}
                onChange={(nextGradient) =>
                  onChange({
                    gradient: {
                      ...gradientObj,
                      [suffix]: nextGradient,
                    },
                  })
                }
                error={missingGradientSet.has(suffix) || fieldErrors.gradientInvalidSuffixes.has(suffix)}
                helperText={
                  missingGradientSet.has(suffix)
                    ? "Обязательное поле."
                    : fieldErrors.gradientInvalidSuffixes.has(suffix)
                    ? "Невалидный формат gradient."
                    : undefined
                }
                cdnImageUrl={assetsBaseUrl ? buildFileUrl(assetsBaseUrl, `${baseValue}-${suffix}.jpeg`) : ""}
                canLoadFromCdn={fileAvailability[`${baseValue}-${suffix}.jpeg`] === true}
                expectedRatio={title === "Desktop" ? DESKTOP_RATIO : MOBILE_RATIO}
                targetLabel={`${title} ${TIME_LABEL_LOWER[suffix] ?? suffix}`}
              />
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function RangeDateBlock({
  startUi,
  endUi,
  onManualStart,
  onManualEnd,
  onApply,
  onPreview,
  startError,
  endError,
}: {
  startUi: string;
  endUi: string;
  onManualStart: (value: string) => void;
  onManualEnd: (value: string) => void;
  onApply: (start: string, end: string) => void;
  onPreview: (start: string, end: string) => void;
  startError?: boolean;
  endError?: boolean;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [leftMonth, setLeftMonth] = useState(1);
  const [tempStart, setTempStart] = useState<number | null>(null);
  const [tempEnd, setTempEnd] = useState<number | null>(null);
  const initialRef = useRef({ start: "", end: "" });

  const open = Boolean(anchorEl);

  const openPicker = (event: MouseEvent<HTMLButtonElement>) => {
    initialRef.current = { start: startUi, end: endUi };
    const startParsed = parseDayMonth(startUi);
    const endParsed = parseDayMonth(endUi);
    setTempStart(startParsed?.doy ?? null);
    setTempEnd(endParsed?.doy ?? null);
    setLeftMonth(startParsed?.month ?? 1);
    setAnchorEl(event.currentTarget);
  };

  const closePicker = (restore: boolean) => {
    if (restore) {
      onPreview(initialRef.current.start, initialRef.current.end);
    }
    setAnchorEl(null);
  };

  const dayToUi = (doy: number | null) => {
    if (doy == null) return "";
    const dm = dayOfYearToDayMonth(doy);
    return `${pad2(dm.day)}.${pad2(dm.month)}`;
  };

  const handleDayClick = (doy: number) => {
    let nextStart = tempStart;
    let nextEnd = tempEnd;

    if (nextStart == null || (nextStart != null && nextEnd != null)) {
      nextStart = doy;
      nextEnd = null;
    } else {
      nextEnd = doy;
      if (nextEnd < nextStart) {
        const swap = nextStart;
        nextStart = nextEnd;
        nextEnd = swap;
      }
    }

    setTempStart(nextStart);
    setTempEnd(nextEnd);
    onPreview(dayToUi(nextStart), dayToUi(nextEnd));
  };

  const renderMonth = (month: number) => {
    const firstWeekday = toMondayFirst(new Date(2025, month - 1, 1).getDay());
    const daysCount = DAYS_IN_MONTH[month - 1];

    return (
      <Box key={month} sx={{ border: (t) => `1px solid ${t.palette.divider}`, borderRadius: 1.5, p: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, mb: 0.75, display: "block" }}>
          {MONTH_NAMES[month - 1]}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 0.5 }}>
          {WEEKDAYS.map((d) => (
            <Typography key={d} variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
              {d}
            </Typography>
          ))}
          {Array.from({ length: firstWeekday - 1 }).map((_, idx) => (
            <Box key={`e-${month}-${idx}`} sx={{ height: 28 }} />
          ))}
          {Array.from({ length: daysCount }).map((_, idx) => {
            const day = idx + 1;
            const doy = getDayOfYear(month, day);
            const isStart = tempStart === doy;
            const isEnd = tempEnd === doy;
            const inRange = tempStart != null && tempEnd != null && doy >= tempStart && doy <= tempEnd;
            return (
              <Button
                key={`d-${month}-${day}`}
                size="small"
                onClick={() => handleDayClick(doy)}
                sx={{
                  minWidth: 0,
                  height: 28,
                  px: 0,
                  borderRadius: 1,
                  color: isStart || isEnd ? "#fff" : "text.primary",
                  bgcolor: isStart || isEnd ? "primary.main" : inRange ? "action.selected" : "transparent",
                }}
              >
                {day}
              </Button>
            );
          })}
        </Box>
      </Box>
    );
  };

  const secondMonth = leftMonth === 12 ? 1 : leftMonth + 1;

  return (
    <>
      <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 5" } }}>
        <TextField
          label="Дата начала"
          value={startUi}
          onChange={(e) => onManualStart(e.target.value)}
          error={Boolean(startError)}
          helperText={startError ? "Ожидается корректная дата." : undefined}
          fullWidth
          placeholder="ДД.ММ"
        />
      </Box>
      <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 5" } }}>
        <TextField
          label="Дата конца"
          value={endUi}
          onChange={(e) => onManualEnd(e.target.value)}
          error={Boolean(endError)}
          helperText={endError ? "Ожидается корректная дата." : undefined}
          fullWidth
          placeholder="ДД.ММ"
        />
      </Box>
      <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 2" }, display: "flex", alignItems: "center" }}>
        <Button
          variant="outlined"
          onClick={openPicker}
          sx={{ minHeight: 56, minWidth: { xs: "100%", md: 56 }, px: { xs: 1.5, md: 1 } }}
          aria-label="Открыть календарь"
          title="Открыть календарь"
        >
          <CalendarMonthIcon />
        </Button>
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => closePicker(true)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 1.25, mt: 0.5, maxWidth: 600, zIndex: 4000 } } }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2">Выберите период</Typography>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" onClick={() => setLeftMonth(leftMonth === 1 ? 12 : leftMonth - 1)}>
              ‹
            </Button>
            <Button size="small" onClick={() => setLeftMonth(leftMonth === 12 ? 1 : leftMonth + 1)}>
              ›
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
          {renderMonth(leftMonth)}
          {renderMonth(secondMonth)}
        </Box>

        <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 1 }}>
          <Button
            onClick={() => {
              setTempStart(null);
              setTempEnd(null);
              onPreview("", "");
            }}
          >
            Очистить
          </Button>
          <Button onClick={() => closePicker(true)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => {
              const s = tempStart;
              let e = tempEnd;
              if (s == null && e == null) {
                onApply("", "");
                closePicker(false);
                return;
              }
              if (s != null && e == null) {
                e = s;
              }
              onApply(dayToUi(s), dayToUi(e));
              closePicker(false);
            }}
          >
            Применить
          </Button>
        </Stack>
      </Popover>
    </>
  );
}

function getOptionsFieldErrors(options: Options): OptionsFieldErrors {
  const type = detectRuleType(options);
  const start = `${options.start ?? ""}`.trim();
  const end = `${options.end ?? ""}`.trim();
  const startDay = `${options.startDayOfYear ?? ""}`.trim();
  const endDay = `${options.endDayOfYear ?? ""}`.trim();
  const xDayOfWeek = `${options.xDayOfWeek ?? ""}`.trim();
  const yWeek = `${options.yWeek ?? ""}`.trim();
  const zMonth = `${options.zMonth ?? ""}`.trim();

  const startDayNum = Number(startDay);
  const endDayNum = Number(endDay);
  const xDayNum = Number(xDayOfWeek);
  const yWeekNum = Number(yWeek);
  const zMonthNum = Number(zMonth);

  const missingGradientSet = new Set(getMissingGradientParts(options));
  const timeEnabled = isTimeOfDayEnabled(options);
  const gradientObj =
    options.gradient && typeof options.gradient === "object" && !Array.isArray(options.gradient)
      ? options.gradient
      : {};
  const invalidTimeKeys = new Set<TimeKey>();
  TIME_KEYS.forEach((key) => {
    const mapped = options[key];
    if (!mapped) return;
    if (!TIME_KEYS.includes(mapped)) {
      invalidTimeKeys.add(key);
    }
  });

  const gradientInvalidSuffixes = new Set<TimeKey>();
  if (timeEnabled) {
    const usedSuffixes = Array.from(new Set(TIME_KEYS.map((key) => options[key]).filter(Boolean) as TimeKey[]));
    usedSuffixes.forEach((suffix) => {
      const gradient = `${gradientObj[suffix] ?? ""}`.trim();
      if (gradient && !isValidGradientCss(gradient)) {
        gradientInvalidSuffixes.add(suffix);
      }
    });
  }

  const gradientGeneral = typeof options.gradient === "string" ? options.gradient.trim() : "";

  return {
    aspectRatio: !`${options.aspectRatio ?? ""}`.trim(),
    start: type === "range" && (!start || !parseDayMonth(start)),
    end: type === "range" && (!end || !parseDayMonth(end)),
    startDayOfYear:
      type === "day_of_year" &&
      (!startDay || !Number.isInteger(startDayNum) || startDayNum < 1 || startDayNum > 365),
    endDayOfYear: type === "day_of_year" && (!endDay || !Number.isInteger(endDayNum) || endDayNum < 1 || endDayNum > 365),
    xDayOfWeek: type === "weekday_in_month" && (!xDayOfWeek || !Number.isInteger(xDayNum) || xDayNum < 1 || xDayNum > 7),
    yWeek:
      type === "weekday_in_month" &&
      (!yWeek || !Number.isInteger(yWeekNum) || yWeekNum < -5 || yWeekNum > 5 || yWeekNum === 0),
    zMonth: type === "weekday_in_month" && (!zMonth || !Number.isInteger(zMonthNum) || zMonthNum < 1 || zMonthNum > 12),
    gradientGeneralInvalid: !timeEnabled && !missingGradientSet.has("общий") && !!gradientGeneral && !isValidGradientCss(gradientGeneral),
    gradientInvalidSuffixes,
    invalidTimeKeys,
  };
}

function pad2(v: number) {
  return String(v).padStart(2, "0");
}

function toMondayFirst(jsDay: number) {
  return jsDay === 0 ? 7 : jsDay;
}

function getDayOfYear(month: number, day: number) {
  return DAYS_IN_MONTH.slice(0, month - 1).reduce((a, b) => a + b, 0) + day;
}

function dayOfYearToDayMonth(dayOfYear: number) {
  let remain = dayOfYear;
  let month = 1;
  for (let i = 0; i < DAYS_IN_MONTH.length; i += 1) {
    if (remain > DAYS_IN_MONTH[i]) {
      remain -= DAYS_IN_MONTH[i];
      month += 1;
    } else {
      break;
    }
  }
  return { month, day: remain };
}
