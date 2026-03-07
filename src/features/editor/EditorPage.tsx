import React from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
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
      <Paper
        sx={{
          px: 2.5,
          py: 2,
          borderRadius: 3,
          mb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            component="img"
            src="./apple-touch-icon.png"
            alt="Логотип"
            sx={{ width: 44, height: 44, borderRadius: 1.5, border: (t) => `1px solid ${t.palette.divider}` }}
          />
          <Box>
            <Typography variant="h1">Редактор JSON-конфига</Typography>
            <Typography color="text.secondary">Редактирование конфига заставок веб-версии</Typography>
          </Box>
        </Stack>

        <Button
          variant="outlined"
          startIcon={resolvedMode === "dark" ? <DarkModeIcon /> : <LightModeIcon />}
          onClick={() => setMode(resolvedMode === "dark" ? "light" : "dark")}
        >
          {resolvedMode === "dark" ? "Тёмная" : "Светлая"}
        </Button>
      </Paper>

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
              syncEntriesToJson([...entries, createEmptyEntry(existing)]);
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
