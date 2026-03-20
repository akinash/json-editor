import React from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import AddIcon from "@mui/icons-material/Add";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useThemeModeContext } from "@/app/ThemeModeProvider";
import { AppCard } from "@/shared/ui/AppCard";
import { AppSectionTitle } from "@/shared/ui/AppSectionTitle";
import { ObjectCard } from "./components/ObjectCard";
import { JsonCodeEditor } from "./components/JsonCodeEditor";
import { ConfigEntry } from "@/shared/types/config";
import {
  createEmptyEntry,
  parseConfigJson,
  serializeConfig,
  validateEntries,
} from "./model/configModel";
import { DEFAULT_URL } from "./model/constants";

function JsonConfigLogo() {
  return (
    <Box
      aria-hidden
      sx={{
        position: "relative",
        width: { xs: 30, md: 36 },
        height: { xs: 30, md: 36 },
      }}
    >
      <Typography
        component="span"
        sx={{
          position: "absolute",
          left: 0,
          top: "50%",
          transform: "translateY(-56%)",
          fontSize: { xs: 26, md: 30 },
          lineHeight: 1,
          fontWeight: 700,
          color: "#fff",
          opacity: 0.96,
        }}
      >
        {"{"}
      </Typography>
      <Typography
        component="span"
        sx={{
          position: "absolute",
          right: 0,
          top: "50%",
          transform: "translateY(-56%)",
          fontSize: { xs: 26, md: 30 },
          lineHeight: 1,
          fontWeight: 700,
          color: "#fff",
          opacity: 0.96,
        }}
      >
        {"}"}
      </Typography>

      <Box
        sx={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: { xs: 12, md: 14 },
          transform: "translate(-50%, -50%)",
          display: "grid",
          gap: "4px",
        }}
      >
        {[0, 1, 2].map((row) => (
          <Box
            key={row}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Box
              sx={{
                width: 3,
                height: 3,
                borderRadius: "50%",
                backgroundColor: "#fff",
                opacity: row === 1 ? 1 : 0.75,
              }}
            />
            <Box
              sx={{
                flex: 1,
                height: 2,
                borderRadius: 999,
                backgroundColor: "#fff",
                opacity: row === 1 ? 1 : 0.72,
              }}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function EditorPage() {
  const [url, setUrl] = React.useState(DEFAULT_URL);
  const [urlError, setUrlError] = React.useState("");
  const [jsonError, setJsonError] = React.useState("");
  const [jsonText, setJsonText] = React.useState("{}");
  const [entries, setEntries] = React.useState<ConfigEntry[]>([]);
  const [expandedId, setExpandedId] = React.useState<string | false>(false);

  const { resolvedMode, setMode } = useThemeModeContext();

  const issues = React.useMemo(() => validateEntries(entries), [entries]);
  const duplicateCodeSet = React.useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((entry) => {
      const key = entry.key.trim();
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const duplicates = new Set<string>();
    counts.forEach((count, key) => {
      if (count > 1) duplicates.add(key);
    });
    return duplicates;
  }, [entries]);
  const statusByKey = React.useMemo(() => {
    const map = new Map<string, "ok" | "warn" | "error">();
    entries.forEach((entry) => map.set(entry.key, "ok"));
    issues.forEach((issue) => {
      issue.keys?.forEach((key) => {
        const current = map.get(key);
        if (issue.level === "error") {
          map.set(key, "error");
        } else if (current !== "error") {
          map.set(key, "warn");
        }
      });
    });
    return map;
  }, [entries, issues]);

  React.useEffect(() => {
    if (window.location.protocol === "file:") {
      setUrlError(
        "Режим file://: автозагрузка по URL отключена из-за CORS. Нажмите «Загрузить» только на http/https.",
      );
      return;
    }
    void handleLoadFromUrl();
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const sortableIds = React.useMemo(() => entries.map((_, index) => `row-${index}`), [entries]);
  const assetsBaseUrl = React.useMemo(() => getAssetsBaseUrl(url), [url]);

  const syncEntriesToJson = React.useCallback((nextEntries: ConfigEntry[]) => {
    setEntries(nextEntries);
    setJsonText(serializeConfig(nextEntries));
    setJsonError("");
  }, []);

  async function handleLoadFromUrl() {
    setUrlError("");
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const nextEntries = parseConfigJson(text || "{}");
      setEntries(nextEntries);
      setJsonText(serializeConfig(nextEntries));
      setJsonError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      setUrlError(`Не удалось загрузить JSON: ${message}`);
    }
  }

  function handleJsonChange(value: string) {
    setJsonText(value);
    try {
      const nextEntries = parseConfigJson(value);
      setEntries(nextEntries);
      setJsonError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка";
      setJsonError(`Ошибка JSON: ${message}`);
    }
  }

  function handleFormat() {
    try {
      const nextEntries = parseConfigJson(jsonText);
      setJsonText(serializeConfig(nextEntries));
      setEntries(nextEntries);
      setJsonError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка";
      setJsonError(`Невозможно форматировать: ${message}`);
    }
  }

  function handleDownload() {
    try {
      JSON.parse(jsonText);
      setJsonError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка";
      setJsonError(`Скачивание отменено: JSON невалидный (${message})`);
      return;
    }

    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = getDownloadFileName(url);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }

  function getDownloadFileName(sourceUrl: string): string {
    const fallback = "background-config.json";
    const raw = sourceUrl.trim();
    if (!raw) return fallback;
    try {
      const parsed = new URL(raw);
      const pathname = parsed.pathname || "";
      const lastSegment = pathname.split("/").filter(Boolean).pop() || "";
      if (!lastSegment) return fallback;
      return lastSegment.toLowerCase().endsWith(".json")
        ? lastSegment
        : `${lastSegment}.json`;
    } catch {
      return fallback;
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    syncEntriesToJson(arrayMove(entries, oldIndex, newIndex));
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box
        sx={{
          mb: 3,
          py: { xs: 0.75, md: 1.25 },
        }}
      >
        <Box
          sx={{
            px: 0,
            py: { xs: 1, md: 1.4 },
            display: "flex",
            alignItems: { xs: "flex-start", md: "center" },
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Stack
            direction="row"
            spacing={{ xs: 1.5, md: 2 }}
            alignItems="center"
            sx={{ minWidth: 0 }}
          >
            <Box
              sx={{
                flexShrink: 0,
                width: { xs: 50, md: 60 },
                height: { xs: 50, md: 60 },
                borderRadius: { xs: 2, md: 2.5 },
                display: "grid",
                placeItems: "center",
                background: (t) =>
                  `linear-gradient(145deg, ${t.palette.primary.main}, ${t.palette.mode === "dark" ? "#4d92ef" : "#2d6ee8"})`,
                border: (t) => `1px solid ${alpha("#ffffff", t.palette.mode === "dark" ? 0.14 : 0.44)}`,
                boxShadow: (t) =>
                  `inset 0 1px 0 ${alpha("#ffffff", 0.34)}, 0 10px 22px ${alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.22 : 0.18)}`,
              }}
            >
              <JsonConfigLogo />
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="h1"
                sx={{
                  fontSize: { xs: "1.55rem", md: "2.45rem" },
                  lineHeight: 1,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: "text.primary",
                  textWrap: "balance",
                }}
              >
                Редактор JSON-конфига
              </Typography>
              <Typography
                sx={{
                  mt: 0.45,
                  fontSize: { xs: "0.95rem", md: "1.05rem" },
                  lineHeight: 1.2,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                  color: "text.secondary",
                }}
              >
                заставок веб-версии
              </Typography>
            </Box>
          </Stack>

          <Box
            component="button"
            type="button"
            aria-label={
              resolvedMode === "dark"
                ? "Переключить на светлую тему"
                : "Переключить на тёмную тему"
            }
            onClick={() => setMode(resolvedMode === "dark" ? "light" : "dark")}
            sx={{
              alignSelf: { xs: "flex-end", md: "center" },
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 1.1,
              width: { xs: 136, md: 154 },
              height: { xs: 44, md: 50 },
              px: { xs: 0.85, md: 1 },
              border: 0,
              borderRadius: 999,
              background: "transparent",
              cursor: "pointer",
              font: "inherit",
              color: "inherit",
              appearance: "none",
              WebkitTapHighlightColor: "transparent",
              "&:focus-visible": {
                outline: (t) => `2px solid ${alpha(t.palette.primary.main, 0.7)}`,
                outlineOffset: 4,
              },
              "& .toggle-side-icon": {
                color: (t) =>
                  alpha(
                    t.palette.text.secondary,
                    resolvedMode === "dark" ? 0.72 : 0.64,
                  ),
                transition: "color 220ms ease, opacity 220ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
              },
              "& .toggle-side-icon.sun": {
                opacity: resolvedMode === "dark" ? 0.4 : 0.92,
                transform: resolvedMode === "dark" ? "scale(0.88) rotate(-18deg)" : "scale(1) rotate(0deg)",
              },
              "& .toggle-side-icon.moon": {
                opacity: resolvedMode === "dark" ? 0.92 : 0.45,
                transform: resolvedMode === "dark" ? "scale(1) rotate(0deg)" : "scale(0.88) rotate(14deg)",
              },
              "& .toggle-track": {
                position: "relative",
                flex: 1,
                height: { xs: 30, md: 34 },
                borderRadius: 999,
                background:
                  resolvedMode === "dark"
                    ? `linear-gradient(180deg, ${alpha("#141c31", 0.92)}, ${alpha("#0b1220", 0.96)})`
                    : `linear-gradient(180deg, ${alpha("#d6ddea", 0.95)}, ${alpha("#c6d0e0", 0.98)})`,
                boxShadow:
                  resolvedMode === "dark"
                    ? `inset 0 3px 8px ${alpha("#020617", 0.55)}, inset 0 -1px 0 ${alpha("#475569", 0.2)}`
                    : `inset 0 3px 7px ${alpha("#94a3b8", 0.28)}, inset 0 -1px 0 ${alpha("#ffffff", 0.85)}`,
                transition: "background 240ms ease, box-shadow 240ms ease",
              },
              "& .toggle-thumb": {
                position: "absolute",
                top: "50%",
                left: resolvedMode === "dark" ? "calc(100% - 27px)" : "3px",
                width: { xs: 24, md: 28 },
                height: { xs: 24, md: 28 },
                borderRadius: "50%",
                transform: resolvedMode === "dark"
                  ? "translateY(-50%) scale(1.02)"
                  : "translateY(-50%) scale(1)",
                background: resolvedMode === "dark"
                  ? "linear-gradient(145deg, #9da6bb, #7d879d)"
                  : "linear-gradient(145deg, #ffffff, #e9eef8)",
                boxShadow: resolvedMode === "dark"
                  ? `0 6px 14px ${alpha("#020617", 0.45)}, inset 0 1px 0 ${alpha("#ffffff", 0.14)}`
                  : `0 8px 18px ${alpha("#94a3b8", 0.38)}, inset 0 1px 0 ${alpha("#ffffff", 0.9)}`,
                transition:
                  "left 300ms cubic-bezier(0.22, 1, 0.36, 1), transform 300ms cubic-bezier(0.22, 1, 0.36, 1), background 220ms ease, box-shadow 220ms ease",
              },
            }}
          >
            <LightModeIcon className="toggle-side-icon sun" sx={{ fontSize: { xs: 22, md: 24 } }} />
            <Box className="toggle-track">
              <Box className="toggle-thumb" />
            </Box>
            <DarkModeIcon className="toggle-side-icon moon" sx={{ fontSize: { xs: 20, md: 22 } }} />
          </Box>
        </Box>
      </Box>

      <Stack spacing={2}>
        <AppCard>
          <AppSectionTitle title="1. Загрузка JSON по URL" />
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} mt={1.5} alignItems="stretch">
            <TextField
              label="Ссылка на JSON"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              fullWidth
              placeholder="https://..."
            />
            <Button variant="contained" onClick={handleLoadFromUrl} sx={{ minWidth: 130, minHeight: 56 }}>
              Загрузить
            </Button>
          </Stack>
          {urlError ? (
            <Typography color="error" variant="caption" sx={{ mt: 1, display: "block" }}>
              {urlError}
            </Typography>
          ) : null}
        </AppCard>

        <AppCard>
          <AppSectionTitle
            title="2. Визуальный редактор"
            subtitle="Изменения в форме и JSON синхронизируются автоматически."
          />

          {issues.length ? (
            <Stack spacing={1} sx={{ mt: 1.5, mb: 1.5 }}>
              {issues.map((issue, idx) => (
                <Alert key={`${issue.message}-${idx}`} severity={issue.level === "error" ? "error" : "warning"}>
                  {issue.message}
                </Alert>
              ))}
            </Stack>
          ) : null}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                {entries.map((entry, index) => (
                  <ObjectCard
                    sortableId={sortableIds[index]}
                    key={sortableIds[index]}
                    entry={entry}
                    expanded={expandedId === sortableIds[index]}
                    status={statusByKey.get(entry.key) ?? "ok"}
                    duplicateCodeSet={duplicateCodeSet}
                    assetsBaseUrl={assetsBaseUrl}
                    onExpanded={(open) => setExpandedId(open ? sortableIds[index] : false)}
                    onChange={(next) => {
                      syncEntriesToJson(
                        entries.map((item, itemIndex) => (itemIndex === index ? next : item)),
                      );
                    }}
                    onClone={() => {
                      const existing = new Set(entries.map((item) => item.key));
                      let nextKey = `${entry.key}_copy`;
                      let i = 2;
                      while (existing.has(nextKey)) {
                        nextKey = `${entry.key}_copy_${i}`;
                        i += 1;
                      }
                      const clone: ConfigEntry = {
                        key: nextKey,
                        data: JSON.parse(JSON.stringify(entry.data)) as ConfigEntry["data"],
                      };
                      clone.data.value = nextKey;
                      clone.data["value-portrait"] = `${nextKey}-portrait`;
                      syncEntriesToJson([...entries, clone]);
                    }}
                    onDelete={() => {
                      syncEntriesToJson(entries.filter((item) => item.key !== entry.key));
                      if (expandedId === sortableIds[index]) setExpandedId(false);
                    }}
                  />
                ))}
              </Stack>
            </SortableContext>
          </DndContext>

          <Divider sx={{ my: 1.5 }} />
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              const existing = new Set(entries.map((entry) => entry.key));
              const nextEntries = [...entries, createEmptyEntry(existing)];
              syncEntriesToJson(nextEntries);
              setExpandedId(`row-${nextEntries.length - 1}`);
            }}
          >
            Новый объект
          </Button>
        </AppCard>

        <AppCard>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <AppSectionTitle title="3. JSON-редактор" />
            <Stack direction="row" spacing={1}>
              <Button startIcon={<FormatAlignLeftIcon />} onClick={handleFormat}>
                Форматировать
              </Button>
              <Button startIcon={<FileDownloadIcon />} variant="outlined" onClick={handleDownload}>
                Скачать JSON
              </Button>
            </Stack>
          </Stack>

          <JsonCodeEditor
            value={jsonText}
            onChange={handleJsonChange}
            isDark={resolvedMode === "dark"}
          />
          {jsonError ? (
            <Typography color="error" variant="caption" sx={{ mt: 1, display: "block" }}>
              {jsonError}
            </Typography>
          ) : null}
        </AppCard>
      </Stack>
    </Container>
  );
}

function getAssetsBaseUrl(sourceUrl: string): string {
  const raw = sourceUrl.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname || "/";
    const basePath = pathname.endsWith("/") ? pathname : pathname.replace(/\/[^/]*$/, "/");
    return `${parsed.origin}${basePath}`;
  } catch {
    return "";
  }
}
