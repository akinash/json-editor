import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Popover,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  helperText?: string;
  cdnImageUrl?: string;
  canLoadFromCdn?: boolean;
  expectedRatio?: number;
  targetLabel?: string;
};

type Rgb = [number, number, number];
type Stop = { color: string; pos: number };
type Point = { x: number; y: number };
type GradientVariant = {
  id: string;
  label: string;
  model: GradientModel;
};

export function GradientGeneratorField({
  label,
  value,
  onChange,
  error = false,
  helperText,
  cdnImageUrl,
  canLoadFromCdn = false,
  expectedRatio = 16 / 9,
  targetLabel,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <TextField
          label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          helperText={helperText}
          fullWidth
        />
        <Button
          variant="outlined"
          onClick={() => setOpen(true)}
          sx={{ minWidth: 46, width: 46, height: 56, px: 1, flexShrink: 0 }}
          title="Сгенерировать из изображения"
          aria-label="Сгенерировать градиент из изображения"
        >
          <AutoFixHighIcon fontSize="small" />
        </Button>
      </Stack>

      <GradientGeneratorDialog
        open={open}
        initialGradient={value}
        cdnImageUrl={cdnImageUrl}
        canLoadFromCdn={canLoadFromCdn}
        expectedRatio={expectedRatio}
        targetLabel={targetLabel}
        onClose={() => setOpen(false)}
        onApply={(gradient) => {
          onChange(gradient);
          setOpen(false);
        }}
      />
    </>
  );
}

function GradientGeneratorDialog({
  open,
  initialGradient,
  cdnImageUrl,
  canLoadFromCdn,
  expectedRatio,
  targetLabel,
  onClose,
  onApply,
}: {
  open: boolean;
  initialGradient: string;
  cdnImageUrl?: string;
  canLoadFromCdn: boolean;
  expectedRatio: number;
  targetLabel?: string;
  onClose: () => void;
  onApply: (gradient: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [imageRatio, setImageRatio] = useState<number>(expectedRatio);
  const [lineStart, setLineStart] = useState<Point>({ x: 0.5, y: 0.08 });
  const [lineEnd, setLineEnd] = useState<Point>({ x: 0.5, y: 0.92 });
  const [stops, setStops] = useState<Stop[]>([]);
  const [error, setError] = useState<string>("");
  const [working, setWorking] = useState(false);
  const [cdnLoading, setCdnLoading] = useState(false);
  const [variants, setVariants] = useState<GradientVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [isDropActive, setIsDropActive] = useState(false);
  const [isImageHover, setIsImageHover] = useState(false);

  const [dragStopIndex, setDragStopIndex] = useState<number | null>(null);
  const [dragHandle, setDragHandle] = useState<"start" | "end" | null>(null);

  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [colorAnchorEl, setColorAnchorEl] = useState<HTMLElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const autoOpenColorRef = useRef(false);
  const generationSeqRef = useRef(0);
  const activeGenerationsRef = useRef(0);
  const stopDragMetaRef = useRef<{ index: number | null; startX: number; startY: number; moved: boolean }>({
    index: null,
    startX: 0,
    startY: 0,
    moved: false,
  });

  useEffect(() => {
    if (!open) {
      // Cancel any in-flight generation when dialog is closed.
      generationSeqRef.current += 1;
      activeGenerationsRef.current = 0;
      setWorking(false);
      return;
    }

    // Reset transient image-generator state per session so reopen uses saved gradient only.
    setImageUrl("");
    setImageRatio(expectedRatio);
    setVariants([]);
    setSelectedVariantId("");
    setIsDropActive(false);
    setIsImageHover(false);
    setSelectedStopIndex(null);
    setColorAnchorEl(null);
    setError("");
    if (!initialGradient) {
      setLineStart({ x: 0.5, y: 0.08 });
      setLineEnd({ x: 0.5, y: 0.92 });
      setStops([]);
      return;
    }
    const parsed = parseGradient(initialGradient);
    if (parsed) {
      const normalized = normalizeParsedGradient(parsed.stops);
      setStops(normalized.localStops);
      const line = lineFromAngleAndRange(parsed.angle, normalized.segmentStart, normalized.segmentEnd);
      setLineStart({ x: line.x1, y: line.y1 });
      setLineEnd({ x: line.x2, y: line.y2 });
    }
  }, [open, initialGradient, expectedRatio]);

  const regenerateFromImage = useCallback(async () => {
    if (!imageUrl) return;
    const requestId = ++generationSeqRef.current;
    activeGenerationsRef.current += 1;
    setWorking(true);
    setError("");
    try {
      const candidateModels = await generateGradientModelsFromImage(imageUrl);
      if (requestId !== generationSeqRef.current) return;
      if (!candidateModels.length) {
        throw new Error("Не удалось подобрать градиент");
      }
      const nextVariants = candidateModels.slice(0, 4).map((model, index) => ({
        id: `variant-${index + 1}`,
        label: `Вариант ${index + 1}`,
        model,
      }));
      setVariants(nextVariants);
      setSelectedVariantId(nextVariants[0].id);
      const normalized = normalizeParsedGradient(nextVariants[0].model.stops);
      setStops(normalized.localStops);
      const line = lineFromAngleAndRange(
        nextVariants[0].model.angle,
        normalized.segmentStart,
        normalized.segmentEnd,
      );
      setLineStart({ x: line.x1, y: line.y1 });
      setLineEnd({ x: line.x2, y: line.y2 });
    } catch (err) {
      if (requestId !== generationSeqRef.current) return;
      const message = err instanceof Error ? err.message : "Не удалось обработать изображение";
      setError(message);
    } finally {
      activeGenerationsRef.current = Math.max(0, activeGenerationsRef.current - 1);
      setWorking(activeGenerationsRef.current > 0);
    }
  }, [imageUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (selectedStopIndex == null) return;
      if (stops.length <= 2) return;
      event.preventDefault();
      setStops((prev) => prev.filter((_, i) => i !== selectedStopIndex));
      setSelectedStopIndex(null);
      setColorAnchorEl(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedStopIndex, stops.length]);

  useEffect(() => {
    const onMove = (event: globalThis.MouseEvent) => {
      if (!previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      const point = {
        x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
      };

      if (dragHandle === "start") {
        setLineStart(point);
      } else if (dragHandle === "end") {
        setLineEnd(point);
      }

      if (dragStopIndex != null) {
        const meta = stopDragMetaRef.current;
        const distance = Math.hypot(event.clientX - meta.startX, event.clientY - meta.startY);
        if (distance > 3) {
          meta.moved = true;
        }
        const t = projectPointToLineT(point, lineStart, lineEnd);
        setStops((prev) => {
          const next = [...prev];
          const min = dragStopIndex === 0 ? 0 : prev[dragStopIndex - 1].pos + 1;
          const max = dragStopIndex === prev.length - 1 ? 100 : prev[dragStopIndex + 1].pos - 1;
          next[dragStopIndex] = { ...next[dragStopIndex], pos: clamp(t * 100, min, max) };
          return next;
        });
      }
    };

    const onUp = () => {
      setDragHandle(null);
      setDragStopIndex(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragHandle, dragStopIndex, lineStart, lineEnd]);

  const gradientCss = useMemo(() => buildGradientFromLine(lineStart, lineEnd, stops), [lineStart, lineEnd, stops]);
  const outputGradient = imageUrl || initialGradient.trim() ? gradientCss : "";

  const onPickFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const nextUrl = typeof reader.result === "string" ? reader.result : "";
      setImageUrl(nextUrl);
      setVariants([]);
      setSelectedVariantId("");
      setIsImageHover(false);
      setIsDropActive(false);
      setLineStart({ x: 0.5, y: 0.08 });
      setLineEnd({ x: 0.5, y: 0.92 });
      try {
        const dimensions = await getImageDimensions(nextUrl);
        setImageRatio(dimensions.width / dimensions.height);
      } catch {
        setImageRatio(expectedRatio);
      }
    };
    reader.onerror = () => {
      setError("Не удалось прочитать файл");
    };
    reader.readAsDataURL(file);
  };

  const onLoadFromCdn = async () => {
    if (!cdnImageUrl) return;
    setCdnLoading(true);
    setError("");
    try {
      const dimensions = await getImageDimensions(cdnImageUrl);
      setImageUrl(cdnImageUrl);
      setImageRatio(dimensions.width / dimensions.height);
      setVariants([]);
      setSelectedVariantId("");
      setIsImageHover(false);
      setIsDropActive(false);
    } catch {
      setError("Не удалось загрузить изображение с CDN.");
    } finally {
      setCdnLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStopIndex == null || !colorAnchorEl || !autoOpenColorRef.current) return;
    autoOpenColorRef.current = false;
    window.requestAnimationFrame(() => {
      colorInputRef.current?.click();
    });
  }, [selectedStopIndex, colorAnchorEl]);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropActive(false);
    const files = event.dataTransfer?.files;
    if (!files || !files.length) return;
    onPickFile(files[0]);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropActive(true);
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropActive(false);
  };

  const stopPoints = stops.map((stop) => ({ ...linePointAt(stop.pos / 100, lineStart, lineEnd), stop }));
  const canDeleteStop = selectedStopIndex != null && stops.length > 2;
  const applyVariant = (variant: GradientVariant) => {
    setSelectedVariantId(variant.id);
    const normalized = normalizeParsedGradient(variant.model.stops);
    const line = lineFromAngleAndRange(variant.model.angle, normalized.segmentStart, normalized.segmentEnd);
    setStops(normalized.localStops);
    setLineStart({ x: line.x1, y: line.y1 });
    setLineEnd({ x: line.x2, y: line.y2 });
  };
  const resetGeneratorSession = () => {
    generationSeqRef.current += 1;
    activeGenerationsRef.current = 0;
    setWorking(false);
    setCdnLoading(false);
    setImageUrl("");
    setVariants([]);
    setSelectedVariantId("");
    setIsDropActive(false);
    setIsImageHover(false);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: "calc(100dvh - 16px)",
          display: "flex",
        },
      }}
    >
      <DialogTitle
        sx={{
          pb: 1,
          "@media (max-height: 860px)": {
            pt: 1.5,
            pb: 0.75,
          },
        }}
      >
        <Stack spacing={0.25}>
          <Typography variant="h6">Генерация градиента из изображения</Typography>
          {targetLabel ? (
            <Typography variant="caption" color="text.secondary">
              {targetLabel}
            </Typography>
          ) : null}
        </Stack>
      </DialogTitle>
      <DialogContent
        sx={{
          overflowY: "auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          "@media (max-height: 860px)": {
            py: 1.25,
          },
        }}
      >
        <Stack spacing={1.5} sx={{ minHeight: 0 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 1.25,
              alignItems: "start",
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                Изображение
              </Typography>
              <Box
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onMouseEnter={() => setIsImageHover(true)}
                onMouseLeave={() => setIsImageHover(false)}
                sx={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: `${imageRatio}`,
                  borderRadius: 0,
                  border: isDropActive
                    ? "1px dashed rgba(41, 118, 255, 0.95)"
                    : "1px solid rgba(128,128,128,0.35)",
                  bgcolor: "action.hover",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {imageUrl ? (
                  <>
                    <Box
                      component="img"
                      src={imageUrl}
                      alt="preview"
                      sx={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
                    />
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        bgcolor: "rgba(4, 11, 26, 0.35)",
                        opacity: isImageHover || isDropActive ? 1 : 0,
                        pointerEvents: isImageHover || isDropActive ? "auto" : "none",
                        transition: "opacity 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<UploadFileIcon />}
                        onClick={openFileDialog}
                      >
                        Загрузить новое изображение
                      </Button>
                    </Box>
                  </>
                ) : (
                  <Stack spacing={1} alignItems="center" sx={{ px: 2, textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary">
                      Выберите файл или перетащите его в область
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<UploadFileIcon />}
                      onClick={openFileDialog}
                    >
                      Загрузить изображение
                    </Button>
                    {canLoadFromCdn && cdnImageUrl ? (
                      <>
                        <Typography variant="caption" color="text.secondary">
                          или
                        </Typography>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => void onLoadFromCdn()}
                          disabled={cdnLoading}
                        >
                          Загрузить из CDN
                        </Button>
                      </>
                    ) : null}
                  </Stack>
                )}
              </Box>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                onClick={(e) => {
                  e.currentTarget.value = "";
                }}
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                Редактор градиента
              </Typography>
              <Box
                ref={previewRef}
                onDoubleClick={(event) => {
                  if (!previewRef.current) return;
                  const rect = previewRef.current.getBoundingClientRect();
                  const point = {
                    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
                    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
                  };
                  const t = projectPointToLineT(point, lineStart, lineEnd);
                  const pos = clamp(t * 100, 0, 100);
                  const color = interpolateColorAtPos(pos, stops);
                  setStops((prev) =>
                    [...prev, { color, pos }]
                      .sort((a, b) => a.pos - b.pos)
                      .map((stop) => ({ ...stop })),
                  );
                }}
                sx={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: `${imageRatio}`,
                  borderRadius: 0,
                  border: "1px solid rgba(128,128,128,0.35)",
                  background: gradientCss || "rgba(110, 126, 148, 0.18)",
                  overflow: "hidden",
                  userSelect: "none",
                }}
              >
                {gradientCss ? (
                  <>
                    <LineOverlay start={lineStart} end={lineEnd} />
                    <Handle point={lineStart} onMouseDown={() => setDragHandle("start")} />
                    <Handle point={lineEnd} onMouseDown={() => setDragHandle("end")} />
                  </>
                ) : null}
                {working ? (
                  <Stack
                    spacing={1}
                    alignItems="center"
                    justifyContent="center"
                    sx={{
                      position: "absolute",
                      inset: 0,
                      bgcolor: "rgba(10, 18, 34, 0.28)",
                      zIndex: 2,
                    }}
                  >
                    <CircularProgress size={30} />
                    <Typography variant="caption" sx={{ color: "#fff" }}>
                      Генерация градиента...
                    </Typography>
                  </Stack>
                ) : null}

                {stopPoints.map((item, index) => (
                  <Box
                    key={`stop-${index}`}
                    component="button"
                    type="button"
                    onMouseDown={(e: ReactMouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      stopDragMetaRef.current = {
                        index,
                        startX: e.clientX,
                        startY: e.clientY,
                        moved: false,
                      };
                      setDragStopIndex(index);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const meta = stopDragMetaRef.current;
                      if (meta.index === index && meta.moved) {
                        stopDragMetaRef.current = { index: null, startX: 0, startY: 0, moved: false };
                        return;
                      }
                      autoOpenColorRef.current = true;
                      setSelectedStopIndex(index);
                      setColorAnchorEl(e.currentTarget);
                    }}
                    sx={{
                      position: "absolute",
                      left: `${item.x * 100}%`,
                      top: `${item.y * 100}%`,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      transform: "translate(-50%, -50%)",
                      bgcolor: item.stop.color,
                      border: "2px solid #fff",
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.65)",
                      cursor: "grab",
                      p: 0,
                    }}
                  />
                ))}
              </Box>
              {imageUrl && variants.length ? (
                <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap">
                  {variants.map((variant) => (
                    <Button
                      key={variant.id}
                      size="small"
                      variant={selectedVariantId === variant.id ? "contained" : "outlined"}
                      onClick={() => applyVariant(variant)}
                      disabled={working}
                      sx={{ minHeight: 28, px: 1.25 }}
                    >
                      {variant.label}
                    </Button>
                  ))}
                </Stack>
              ) : null}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{
          pt: 1,
          justifyContent: "space-between",
          gap: 1,
          "@media (max-height: 860px)": {
            px: 2,
            py: 1.25,
          },
        }}
      >
        <Box sx={{ minWidth: 180 }}>
          {imageUrl ? (
            <Button
              variant="outlined"
              onClick={() => void regenerateFromImage()}
              disabled={working}
            >
              Сгенерировать градиент
            </Button>
          ) : null}
        </Box>

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button
            onClick={() => {
              resetGeneratorSession();
              onClose();
            }}
          >
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              onApply(outputGradient);
              resetGeneratorSession();
            }}
            disabled={!outputGradient.trim()}
          >
            Применить
          </Button>
        </Stack>
      </DialogActions>

      <Popover
        open={selectedStopIndex != null && Boolean(colorAnchorEl)}
        anchorEl={colorAnchorEl}
        onClose={() => {
          setSelectedStopIndex(null);
          setColorAnchorEl(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Stack spacing={1} sx={{ p: 1.25, width: 240 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              component="input"
              ref={colorInputRef}
              type="color"
              value={toHex(selectedStopIndex != null ? stops[selectedStopIndex].color : "#ffffff")}
              onChange={(e) => {
                if (selectedStopIndex == null) return;
                setStops((prev) =>
                  prev.map((stop, i) =>
                    i === selectedStopIndex ? { ...stop, color: hexToRgbCss(e.target.value) } : stop,
                  ),
                );
              }}
              sx={{
                width: 36,
                height: 36,
                p: 0,
                border: "1px solid rgba(0,0,0,0.35)",
                bgcolor: "transparent",
                borderRadius: 0.75,
                cursor: "pointer",
                "&:hover": {
                  boxShadow: "0 0 0 2px rgba(255,255,255,0.55), 0 0 0 3px rgba(0,0,0,0.35)",
                },
              }}
            />
            <TextField
              size="small"
              label="RGB"
              value={selectedStopIndex != null ? stops[selectedStopIndex].color : ""}
              onChange={(e) => {
                if (selectedStopIndex == null) return;
                setStops((prev) =>
                  prev.map((stop, i) =>
                    i === selectedStopIndex ? { ...stop, color: normalizeColor(e.target.value) } : stop,
                  ),
                );
              }}
              fullWidth
            />
          </Stack>
          <Button
            color="error"
            variant="outlined"
            disabled={!canDeleteStop}
            onClick={() => {
              if (selectedStopIndex == null || stops.length <= 2) return;
              setStops((prev) => prev.filter((_, i) => i !== selectedStopIndex));
              setSelectedStopIndex(null);
              setColorAnchorEl(null);
            }}
          >
            Удалить точку
          </Button>
        </Stack>
      </Popover>
    </Dialog>
  );
}

function Handle({ point, onMouseDown }: { point: Point; onMouseDown: () => void }) {
  return (
    <Box
      onMouseDown={onMouseDown}
      sx={{
        position: "absolute",
        left: `${point.x * 100}%`,
        top: `${point.y * 100}%`,
        width: 11,
        height: 11,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        bgcolor: "#fff",
        border: "2px solid #111",
        cursor: "grab",
      }}
    />
  );
}

function LineOverlay({ start, end }: { start: Point; end: Point }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      sx={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
      }}
    >
      <line
        x1={start.x * 100}
        y1={start.y * 100}
        x2={end.x * 100}
        y2={end.y * 100}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={start.x * 100}
        y1={start.y * 100}
        x2={end.x * 100}
        y2={end.y * 100}
        stroke="#ffffff"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </Box>
  );
}

type GradientModel = {
  angle: number;
  stops: Stop[];
};

type PixelSample = {
  x: number;
  y: number;
  rgb: Rgb;
};

async function generateGradientModelsFromImage(dataUrl: string): Promise<GradientModel[]> {
  const samples = await extractBlurSamples(dataUrl);
  if (!samples.length) {
    throw new Error("Не удалось получить семплы изображения");
  }

  const angles = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
  const candidates: Array<{ angle: number; stops: Stop[]; error: number }> = [];

  for (let i = 0; i < angles.length; i += 1) {
    const angle = angles[i];
    const fitted = fitStopsForAngle(samples, angle);
    candidates.push({ angle, stops: fitted.stops, error: fitted.error });
  }

  if (!candidates.length) {
    throw new Error("Не удалось подобрать градиент");
  }

  candidates.sort((a, b) => a.error - b.error);
  const chosen = pickDiverseCandidates(candidates, 4, 20);
  return chosen.map((candidate, index) => {
    if (index === 0) {
      return { angle: candidate.angle, stops: candidate.stops };
    }
    return {
      angle: candidate.angle,
      stops: stylizeStops(candidate.stops, index),
    };
  });
}

function pickDiverseCandidates(
  sorted: Array<{ angle: number; stops: Stop[]; error: number }>,
  limit: number,
  minAngleDistance: number,
): Array<{ angle: number; stops: Stop[]; error: number }> {
  const selected: Array<{ angle: number; stops: Stop[]; error: number }> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const candidate = sorted[i];
    if (!selected.length) {
      selected.push(candidate);
    } else {
      const distinct = selected.every(
        (item) => circularAngleDistance(item.angle, candidate.angle) >= minAngleDistance,
      );
      if (distinct) selected.push(candidate);
    }
    if (selected.length >= limit) return selected;
  }
  for (let i = 0; i < sorted.length && selected.length < limit; i += 1) {
    if (!selected.includes(sorted[i])) selected.push(sorted[i]);
  }
  return selected.slice(0, limit);
}

function circularAngleDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function stylizeStops(stops: Stop[], variantIndex: number): Stop[] {
  if (variantIndex === 1) {
    return stops.map((stop) => ({ ...stop, color: tintColor(stop.color, [255, 224, 195], 0.06) }));
  }
  if (variantIndex === 2) {
    return stops.map((stop) => ({ ...stop, color: tintColor(stop.color, [200, 226, 255], 0.06) }));
  }
  return stops.map((stop) => {
    const rgb = parseRgb(stop.color);
    return { ...stop, color: rgbToCss(boostPresence(rgb, 1.08, 1.05)) };
  });
}

function tintColor(color: string, tint: Rgb, amount: number): string {
  const rgb = parseRgb(color);
  return rgbToCss(roundRgb(mix(rgb, tint, amount)));
}

async function extractBlurSamples(dataUrl: string): Promise<PixelSample[]> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");

  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const maxProcessSide = 920;
  const scale = Math.min(1, maxProcessSide / Math.max(sourceWidth, sourceHeight));
  const processWidth = Math.max(64, Math.round(sourceWidth * scale));
  const processHeight = Math.max(64, Math.round(sourceHeight * scale));

  canvas.width = processWidth;
  canvas.height = processHeight;

  if ("filter" in ctx) {
    // Blur radius depends on image size, not a fixed px value.
    const blurPx = clamp(Math.round(Math.min(processWidth, processHeight) * 0.085), 8, 88);
    ctx.filter = `blur(${blurPx}px) saturate(112%) contrast(106%)`;
  }
  ctx.drawImage(img, 0, 0, processWidth, processHeight);
  ctx.filter = "none";

  const sampleCanvas = document.createElement("canvas");
  const sampleCtx = sampleCanvas.getContext("2d");
  if (!sampleCtx) throw new Error("Canvas недоступен");
  const blurredSize = clamp(Math.round(Math.min(processWidth, processHeight) / 7), 30, 64);
  sampleCanvas.width = blurredSize;
  sampleCanvas.height = blurredSize;
  sampleCtx.drawImage(canvas, 0, 0, blurredSize, blurredSize);

  const { data } = sampleCtx.getImageData(0, 0, blurredSize, blurredSize);
  const samples: PixelSample[] = [];

  for (let y = 0; y < blurredSize; y += 1) {
    for (let x = 0; x < blurredSize; x += 1) {
      const idx = (y * blurredSize + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < 15) continue;
      samples.push({
        x: x / (blurredSize - 1),
        y: y / (blurredSize - 1),
        rgb: [data[idx], data[idx + 1], data[idx + 2]],
      });
    }
  }

  return samples;
}

function fitStopsForAngle(samples: PixelSample[], angle: number): { stops: Stop[]; error: number } {
  const binsCount = 48;
  const accum = Array.from({ length: binsCount }, () => ({
    r: 0,
    g: 0,
    b: 0,
    w: 0,
  }));

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    const t = projectPointToGradientT(s.x, s.y, angle);
    const b = clamp(Math.round(t * (binsCount - 1)), 0, binsCount - 1);
    const weight = sampleWeight(s.x, s.y, s.rgb);
    accum[b].r += s.rgb[0] * weight;
    accum[b].g += s.rgb[1] * weight;
    accum[b].b += s.rgb[2] * weight;
    accum[b].w += weight;
  }

  const curve: Rgb[] = accum.map((bucket) =>
    bucket.w > 0 ? [bucket.r / bucket.w, bucket.g / bucket.w, bucket.b / bucket.w] : [180, 180, 180],
  );
  const smoothCurve = smoothRgbCurve(curve, 2);

  const p1 = 0.2;
  const p2 = 0.56;
  const p3 = 0.92;

  const c1 = sampleCurveAt(smoothCurve, p1);
  const c2 = sampleCurveAt(smoothCurve, p2);
  const c3 = sampleCurveAt(smoothCurve, p3);

  // Preserve image character: minimal whitening + slight vividness boost.
  const s1 = boostPresence(roundRgb(mix(c1, [255, 255, 255], 0.08)), 1.1, 1.04);
  const s2 = boostPresence(roundRgb(mix(saturate(c2, 1.08), [255, 255, 255], 0.02)), 1.16, 1.06);
  const s3 = boostPresence(roundRgb(balanceTailColor(c3, smoothCurve)), 1.1, 1.04);

  const stops: Stop[] = [
    { color: rgbToCss(s1), pos: p1 * 100 },
    { color: rgbToCss(s2), pos: p2 * 100 },
    { color: rgbToCss(s3), pos: p3 * 100 },
  ];

  const error = computeFitError(smoothCurve, [
    { t: p1, rgb: s1 },
    { t: p2, rgb: s2 },
    { t: p3, rgb: s3 },
  ]);

  return { stops, error };
}

function sampleWeight(x: number, y: number, rgb: Rgb): number {
  const lum = luminance(rgb);
  if (lum < 10 || lum > 246) return 0.25;
  const centerWeight = 1.2 - Math.hypot(x - 0.5, y - 0.5) * 0.7;
  const sat = rgbToHsl(rgb).s;
  const satWeight = 0.78 + sat * 0.75;
  return clamp(centerWeight * satWeight, 0.25, 2);
}

function projectPointToGradientT(x: number, y: number, angle: number): number {
  const rad = ((angle - 90) * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const corners = [
    0 * ux + 0 * uy,
    1 * ux + 0 * uy,
    0 * ux + 1 * uy,
    1 * ux + 1 * uy,
  ];
  const min = Math.min(...corners);
  const max = Math.max(...corners);
  const v = x * ux + y * uy;
  return clamp((v - min) / (max - min || 1), 0, 1);
}

function smoothRgbCurve(curve: Rgb[], radius: number): Rgb[] {
  return curve.map((_, idx) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let w = 0;
    for (let d = -radius; d <= radius; d += 1) {
      const i = clamp(idx + d, 0, curve.length - 1);
      const ww = radius + 1 - Math.abs(d);
      r += curve[i][0] * ww;
      g += curve[i][1] * ww;
      b += curve[i][2] * ww;
      w += ww;
    }
    return [r / w, g / w, b / w];
  });
}

function sampleCurveAt(curve: Rgb[], t: number): Rgb {
  const p = clamp(t, 0, 1) * (curve.length - 1);
  const i0 = Math.floor(p);
  const i1 = Math.min(curve.length - 1, i0 + 1);
  const k = p - i0;
  return [
    curve[i0][0] + (curve[i1][0] - curve[i0][0]) * k,
    curve[i0][1] + (curve[i1][1] - curve[i0][1]) * k,
    curve[i0][2] + (curve[i1][2] - curve[i0][2]) * k,
  ];
}

function balanceTailColor(c3: Rgb, curve: Rgb[]): Rgb {
  const tail = sampleCurveAt(curve, 0.95);
  const tailLum = luminance(tail);
  if (tailLum > 155) {
    return mix(c3, mix(tail, [255, 255, 255], 0.05), 0.84);
  }
  if (tailLum > 130) {
    return mix(c3, tail, 0.68);
  }
  return c3;
}

function computeFitError(curve: Rgb[], stops: Array<{ t: number; rgb: Rgb }>): number {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  let error = 0;
  for (let i = 0; i < curve.length; i += 1) {
    const t = i / (curve.length - 1);
    const target = curve[i];
    const pred = predictColorAt(sorted, t);
    error +=
      (target[0] - pred[0]) * (target[0] - pred[0]) +
      (target[1] - pred[1]) * (target[1] - pred[1]) +
      (target[2] - pred[2]) * (target[2] - pred[2]);
  }
  return error / curve.length;
}

function predictColorAt(stops: Array<{ t: number; rgb: Rgb }>, t: number): Rgb {
  if (t <= stops[0].t) return stops[0].rgb;
  if (t >= stops[stops.length - 1].t) return stops[stops.length - 1].rgb;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t < a.t || t > b.t) continue;
    const k = (t - a.t) / (b.t - a.t || 1);
    return [
      a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k,
      a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k,
      a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k,
    ];
  }
  return stops[0].rgb;
}

function buildGradientFromLine(start: Point, end: Point, localStops: Stop[]): string {
  if (!localStops.length) return "";
  const angle = lineToCssAngle(start, end);
  const segmentStart = projectPointToGradientT(start.x, start.y, angle);
  const segmentEnd = projectPointToGradientT(end.x, end.y, angle);
  const length = segmentEnd - segmentStart;

  const safe = [...localStops]
    .map((stop) => ({
      color: stop.color,
      pos: clamp((segmentStart + (stop.pos / 100) * length) * 100, 0, 100),
    }))
    .sort((x, y) => x.pos - y.pos);

  if (safe.length === 1) {
    return `linear-gradient(${angle.toFixed(2)}deg, ${safe[0].color} 0%, ${safe[0].color} 100%)`;
  }
  const stopsText = safe.map((stop) => `${stop.color} ${stop.pos.toFixed(3)}%`).join(",");
  return `linear-gradient(${angle.toFixed(2)}deg, ${stopsText})`;
}

function parseGradient(value: string): { angle: number; stops: Stop[] } | null {
  const angleMatch = value.match(/linear-gradient\(([-\d.]+)deg/i);
  const stopMatches = [...value.matchAll(/(rgb\([^\)]+\)|#[0-9a-fA-F]{6})\s+([\d.]+)%/g)];
  if (!angleMatch || stopMatches.length < 2) return null;
  const angle = Number(angleMatch[1]);
  if (!Number.isFinite(angle)) return null;
  const stops: Stop[] = stopMatches.map((m) => ({
    color: normalizeColor(m[1]),
    pos: clamp(Number(m[2]) || 0, 0, 100),
  }));
  return { angle, stops };
}

function normalizeParsedGradient(stops: Stop[]): {
  localStops: Stop[];
  segmentStart: number;
  segmentEnd: number;
} {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const min = clamp((sorted[0]?.pos ?? 8) / 100, 0, 1);
  const max = clamp((sorted[sorted.length - 1]?.pos ?? 92) / 100, 0, 1);
  const length = Math.max(0.08, max - min);
  const segmentStart = clamp(min, 0, 1);
  const segmentEnd = clamp(min + length, 0, 1);

  const localStops = sorted.map((stop) => ({
    color: stop.color,
    pos: clamp(((stop.pos / 100 - segmentStart) / (segmentEnd - segmentStart || 1)) * 100, 0, 100),
  }));

  return { localStops, segmentStart, segmentEnd };
}

function lineFromAngleAndRange(angleDeg: number, startT: number, endT: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);

  const corners = [
    0 * ux + 0 * uy,
    1 * ux + 0 * uy,
    0 * ux + 1 * uy,
    1 * ux + 1 * uy,
  ];
  const min = Math.min(...corners);
  const max = Math.max(...corners);
  const centerDot = 0.5 * ux + 0.5 * uy;
  const span = max - min || 1;

  const pointAt = (t: number): Point => {
    const projection = min + clamp(t, 0, 1) * span;
    const distance = projection - centerDot;
    return {
      x: clamp(0.5 + ux * distance, 0, 1),
      y: clamp(0.5 + uy * distance, 0, 1),
    };
  };

  const start = pointAt(startT);
  const end = pointAt(endT);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

function lineToCssAngle(start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
}

function linePointAt(t: number, start: Point, end: Point): Point {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function projectPointToLineT(point: Point, start: Point, end: Point): number {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const wx = point.x - start.x;
  const wy = point.y - start.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 0.000001) return 0;
  return clamp((wx * vx + wy * vy) / len2, 0, 1);
}

function interpolateColorAtPos(pos: number, stops: Stop[]): string {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (!sorted.length) return "rgb(255, 255, 255)";
  if (pos <= sorted[0].pos) return sorted[0].color;
  if (pos >= sorted[sorted.length - 1].pos) return sorted[sorted.length - 1].color;

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (pos < left.pos || pos > right.pos) continue;
    const t = (pos - left.pos) / (right.pos - left.pos || 1);
    const l = parseRgb(left.color);
    const r = parseRgb(right.color);
    return rgbToCss([
      Math.round(l[0] + (r[0] - l[0]) * t),
      Math.round(l[1] + (r[1] - l[1]) * t),
      Math.round(l[2] + (r[2] - l[2]) * t),
    ]);
  }
  return sorted[0].color;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturate([r, g, b]: Rgb, amount: number): Rgb {
  const gray = (r + g + b) / 3;
  return [gray + (r - gray) * amount, gray + (g - gray) * amount, gray + (b - gray) * amount];
}

function roundRgb([r, g, b]: Rgb): Rgb {
  return [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)];
}

function boostPresence(rgb: Rgb, saturationBoost: number, contrastBoost: number): Rgb {
  const sat = saturate(rgb, saturationBoost);
  const contrasted = increaseContrast(sat, contrastBoost);
  return roundRgb(contrasted);
}

function increaseContrast([r, g, b]: Rgb, factor: number): Rgb {
  const mid = 128;
  return [
    clamp((r - mid) * factor + mid, 0, 255),
    clamp((g - mid) * factor + mid, 0, 255),
    clamp((b - mid) * factor + mid, 0, 255),
  ];
}

function rgbToCss([r, g, b]: Rgb): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function rgbToHsl([r, g, b]: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (d !== 0) {
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) / 6;
    } else {
      h = ((rn - gn) / d + 4) / 6;
    }
  }
  return { h, s, l };
}

function parseRgb(value: string): Rgb {
  const match = value.match(/rgb\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/i);
  if (match) {
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    const clean = value.trim().slice(1);
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [255, 255, 255];
}

function normalizeColor(value: string): string {
  const raw = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return hexToRgbCss(raw);
  }
  if (/^rgb\(/i.test(raw)) {
    return raw;
  }
  return "rgb(255, 255, 255)";
}

function toHex(value: string): string {
  const match = value.match(/rgb\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/i);
  if (match) {
    return `#${Number(match[1]).toString(16).padStart(2, "0")}${Number(match[2])
      .toString(16)
      .padStart(2, "0")}${Number(match[3]).toString(16).padStart(2, "0")}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    return value.trim();
  }
  return "#ffffff";
}

function hexToRgbCss(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
    img.src = src;
  });
}

async function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(src);
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
}
