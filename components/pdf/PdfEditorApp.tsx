"use client";

import "@excalidraw/excalidraw/index.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { UserButton, useAuth } from "@clerk/nextjs";
import type {
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  DataURL,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { upload } from "@vercel/blob/client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { Document, Page, pdfjs } from "react-pdf";
import ImageLibraryDialog from "@/components/notebook/ImageLibraryDialog";
import SettingsDialog from "@/components/notebook/SettingsDialog";
import {
  DEFAULT_PDF_ANNOTATION_TOOLBAR_STATE,
  PdfAnnotationToolbar,
  type PdfAnnotationToolbarState,
  type PdfToolbarDock,
} from "@/components/pdf/PdfAnnotationToolbar";
import {
  createPrivateImageUrl,
  isAllowedImageContentType,
  MAX_IMAGE_SIZE_BYTES,
  sanitizeImageFilename,
} from "@/lib/attachments";
import {
  createGuestPdfDocument,
  deleteGuestPdfDocument,
  getGuestPdfBlob,
  listGuestPdfAnnotations,
  listGuestPdfDocuments,
  renameGuestPdfDocument,
  saveGuestPdfAnnotation,
} from "@/lib/client/guest-pdf-storage";
import {
  deleteRemotePdfDocument,
  getRemotePdfUrl,
  listRemotePdfDocuments,
  loadRemotePdfAnnotations,
  renameRemotePdfDocument,
  saveRemotePdfAnnotation,
} from "@/lib/client/pdf-api";
import {
  loadRemoteSettings,
  saveRemoteSettings,
} from "@/lib/client/settings-api";
import {
  normalizeNewConstantWidthStroke,
  PEN_STROKE_WIDTHS,
  type PenStrokeWidth,
} from "@/lib/excalidraw-pen";
import {
  DEFAULT_PDF_MAX_PAGES,
  DEFAULT_PDF_MAX_UPLOAD_BYTES,
  getGuestPdfLimits,
  getPdfAnnotationPlacement,
  type PdfAnnotationRecord,
  type PdfDocumentRecord,
  sanitizePdfFilename,
} from "@/lib/pdf";
import {
  applyAppearance,
  DEFAULT_PDF_MAX_ZOOM_PERCENT,
  loadLocalSettings,
  saveLocalSettings,
} from "@/lib/settings";
import type { UploadedImage, UserSettings } from "@/lib/types";
import { createId } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((module) => module.Excalidraw),
  { ssr: false },
);

interface StoredPdfScene {
  version: 1;
  source: "pdf-annotation";
  elements: readonly OrderedExcalidrawElement[];
  appState: Pick<AppState, "scrollX" | "scrollY" | "zoom">;
  files: BinaryFiles;
}

interface EditableProject {
  format: "note-taking-app-pdf-project";
  version: 1;
  title: string;
  originalFilename: string;
  annotations: PdfAnnotationRecord[];
}

interface PdfAnnotationEditorHandle {
  api: ExcalidrawImperativeAPI;
  element: HTMLDivElement;
  flush: () => Promise<void>;
}

interface PendingPdfScene {
  elements: readonly OrderedExcalidrawElement[];
  scrollX: number;
  scrollY: number;
  files: BinaryFiles;
}

interface PdfZoomViewportAnchor {
  surface: HTMLElement;
  clientX: number;
  clientY: number;
  xRatio: number;
  yRatio: number;
}

const SAVE_DELAY_MS = 750;
const MULTIPART_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024;
const EXPORT_PADDING_PX = 8;
const ANNOTATION_TOOLBAR_GUTTER_PX = 32;
const MIN_PDF_ZOOM = 0.25;
const PDF_ANNOTATION_EXPORT_SCALES = [1, 2, 3, 4, 6, 8, 12, 16] as const;
type PdfAnnotationExportScale = (typeof PDF_ANNOTATION_EXPORT_SCALES)[number];
const PDF_EXPORT_MOBILE_TILE_SIZE_PX = 2048;
const PDF_EXPORT_DESKTOP_TILE_SIZE_PX = 4096;
const PDF_EXPORT_MOBILE_CANVAS_MAX_DIMENSION_PX = 4096;
const PDF_EXPORT_MOBILE_CANVAS_MAX_AREA_PX = 16_000_000;
const PDF_EXPORT_DESKTOP_CANVAS_MAX_DIMENSION_PX = 8192;
const PDF_EXPORT_DESKTOP_CANVAS_MAX_AREA_PX = 32_000_000;

function loadSvgImage(svg: SVGSVGElement) {
  return new Promise<{ image: HTMLImageElement; url: string }>(
    (resolve, reject) => {
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      );
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not rasterize the annotation SVG"));
      };
      image.src = url;
    },
  );
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not create an annotation tile"));
    }, "image/png");
  });
}

function loadImageDimensions(source: File | string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const shouldRevokeUrl = source instanceof File;
    const url = shouldRevokeUrl ? URL.createObjectURL(source) : source;
    const image = new Image();
    image.onload = () => {
      if (shouldRevokeUrl) URL.revokeObjectURL(url);
      resolve({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });
    };
    image.onerror = () => {
      if (shouldRevokeUrl) URL.revokeObjectURL(url);
      reject(new Error("Could not read this image."));
    };
    image.src = url;
  });
}

function getImageContentType(filename: string): BinaryFileData["mimeType"] {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/png";
}

function parseScene(scene: string | undefined): StoredPdfScene | null {
  if (!scene) return null;
  try {
    const value = JSON.parse(scene) as Partial<StoredPdfScene>;
    return value.version === 1 &&
      value.source === "pdf-annotation" &&
      Array.isArray(value.elements) &&
      value.files &&
      typeof value.files === "object"
      ? (value as StoredPdfScene)
      : null;
  } catch {
    return null;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function annotationInitialData(
  scene: StoredPdfScene | null,
  width: number,
  height: number,
  viewerZoom: number,
  toolbarState: PdfAnnotationToolbarState,
  isTouchDrawingEnabled: boolean,
): ExcalidrawInitialDataState {
  const canonicalZoom =
    scene?.appState.zoom ?? ({ value: 1 } as AppState["zoom"]);
  return {
    elements: scene?.elements ?? [],
    files: scene?.files ?? {},
    appState: {
      ...(scene?.appState ?? {}),
      width,
      height,
      zoom: {
        ...canonicalZoom,
        value: (canonicalZoom.value * viewerZoom) as AppState["zoom"]["value"],
      },
      activeTool: {
        type: toolbarState.tool,
        customType: null,
        locked: toolbarState.toolLocked,
        lastActiveTool: null,
      },
      currentItemStrokeColor: toolbarState.strokeColor,
      currentItemBackgroundColor: toolbarState.backgroundColor,
      currentItemFillStyle: toolbarState.fillStyle,
      currentItemStrokeWidth: toolbarState.strokeWidth,
      currentItemStrokeStyle: toolbarState.strokeStyle,
      currentItemRoughness: toolbarState.roughness,
      currentItemOpacity: toolbarState.opacity,
      currentItemRoundness: toolbarState.roundness,
      currentItemFontFamily:
        toolbarState.fontFamily as AppState["currentItemFontFamily"],
      currentItemFontSize: toolbarState.fontSize,
      currentItemTextAlign: toolbarState.textAlign,
      currentItemStartArrowhead: toolbarState.startArrowhead,
      currentItemEndArrowhead: toolbarState.endArrowhead,
      viewBackgroundColor: "transparent",
      penMode: !isTouchDrawingEnabled,
      penDetected: true,
    },
  };
}

const PDF_ANNOTATION_TOOLS = new Set<PdfAnnotationToolbarState["tool"]>([
  "selection",
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
  "line",
  "freedraw",
  "text",
  "eraser",
]);

function applyPdfToolbarState(
  api: ExcalidrawImperativeAPI,
  toolbarState: PdfAnnotationToolbarState,
) {
  api.setActiveTool({
    type: toolbarState.tool,
    locked: toolbarState.toolLocked,
  });
  api.updateScene({
    appState: {
      currentItemStrokeColor: toolbarState.strokeColor,
      currentItemBackgroundColor: toolbarState.backgroundColor,
      currentItemFillStyle: toolbarState.fillStyle,
      currentItemStrokeWidth: toolbarState.strokeWidth,
      currentItemStrokeStyle: toolbarState.strokeStyle,
      currentItemRoughness: toolbarState.roughness,
      currentItemOpacity: toolbarState.opacity,
      currentItemRoundness: toolbarState.roundness,
      currentItemFontFamily:
        toolbarState.fontFamily as AppState["currentItemFontFamily"],
      currentItemFontSize: toolbarState.fontSize,
      currentItemTextAlign: toolbarState.textAlign,
      currentItemStartArrowhead: toolbarState.startArrowhead,
      currentItemEndArrowhead: toolbarState.endArrowhead,
    },
    captureUpdate: "NEVER",
  });
}

function applyPdfToolbarChangeToSelection(
  api: ExcalidrawImperativeAPI,
  change: Partial<PdfAnnotationToolbarState>,
) {
  const selectedElementIds = api.getAppState().selectedElementIds;
  if (!Object.keys(selectedElementIds).length) return;
  const originalElements = api.getSceneElementsIncludingDeleted();
  const targetElementIds = new Set(Object.keys(selectedElementIds));
  for (const element of originalElements) {
    if (!selectedElementIds[element.id]) continue;
    for (const binding of element.boundElements ?? []) {
      if (binding.type === "text") targetElementIds.add(binding.id);
    }
  }
  const hasStyleChange =
    change.strokeColor !== undefined ||
    change.backgroundColor !== undefined ||
    change.fillStyle !== undefined ||
    change.strokeWidth !== undefined ||
    change.strokeStyle !== undefined ||
    change.roughness !== undefined ||
    change.opacity !== undefined ||
    change.roundness !== undefined ||
    change.fontFamily !== undefined ||
    change.fontSize !== undefined ||
    change.textAlign !== undefined ||
    change.startArrowhead !== undefined ||
    change.endArrowhead !== undefined;
  if (!hasStyleChange) return;

  const updatedAt = Date.now();
  const elements = originalElements.map((element) => {
    if (!targetElementIds.has(element.id)) return element;
    const isText = element.type === "text";
    const isLinear = element.type === "arrow" || element.type === "line";
    const fontScale =
      isText && change.fontSize !== undefined
        ? change.fontSize / element.fontSize
        : 1;
    return {
      ...element,
      ...(change.strokeColor !== undefined
        ? { strokeColor: change.strokeColor }
        : {}),
      ...(change.backgroundColor !== undefined
        ? { backgroundColor: change.backgroundColor }
        : {}),
      ...(change.fillStyle !== undefined
        ? { fillStyle: change.fillStyle }
        : {}),
      ...(change.strokeWidth !== undefined
        ? { strokeWidth: change.strokeWidth }
        : {}),
      ...(change.strokeStyle !== undefined
        ? { strokeStyle: change.strokeStyle }
        : {}),
      ...(change.roughness !== undefined
        ? { roughness: change.roughness }
        : {}),
      ...(change.opacity !== undefined ? { opacity: change.opacity } : {}),
      ...(change.roundness !== undefined &&
      !["ellipse", "freedraw", "text", "image"].includes(element.type)
        ? {
            roundness:
              change.roundness === "round"
                ? { type: element.type === "rectangle" ? 3 : 2 }
                : null,
          }
        : {}),
      ...(isText && change.fontFamily !== undefined
        ? { fontFamily: change.fontFamily }
        : {}),
      ...(isText && change.fontSize !== undefined
        ? {
            fontSize: change.fontSize,
            width: element.width * fontScale,
            height: element.height * fontScale,
          }
        : {}),
      ...(isText && change.textAlign !== undefined
        ? { textAlign: change.textAlign }
        : {}),
      ...(isLinear && change.startArrowhead !== undefined
        ? { startArrowhead: change.startArrowhead }
        : {}),
      ...(isLinear && change.endArrowhead !== undefined
        ? { endArrowhead: change.endArrowhead }
        : {}),
      version: element.version + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      updated: updatedAt,
    } as OrderedExcalidrawElement;
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
  api.refresh();
}

function toolbarStateFromAppState(
  appState: AppState,
  fallback: PdfAnnotationToolbarState,
): PdfAnnotationToolbarState {
  const tool = PDF_ANNOTATION_TOOLS.has(
    appState.activeTool.type as PdfAnnotationToolbarState["tool"],
  )
    ? (appState.activeTool.type as PdfAnnotationToolbarState["tool"])
    : fallback.tool;
  return {
    tool,
    toolLocked: appState.activeTool.locked ?? fallback.toolLocked,
    strokeColor: appState.currentItemStrokeColor || fallback.strokeColor,
    backgroundColor:
      appState.currentItemBackgroundColor ?? fallback.backgroundColor,
    fillStyle:
      (appState.currentItemFillStyle as PdfAnnotationToolbarState["fillStyle"]) ??
      fallback.fillStyle,
    strokeWidth: PEN_STROKE_WIDTHS.includes(
      appState.currentItemStrokeWidth as PenStrokeWidth,
    )
      ? (appState.currentItemStrokeWidth as PenStrokeWidth)
      : fallback.strokeWidth,
    pressureMode: fallback.pressureMode,
    strokeStyle:
      (appState.currentItemStrokeStyle as PdfAnnotationToolbarState["strokeStyle"]) ??
      fallback.strokeStyle,
    roughness: ([0, 1, 2] as const).includes(
      appState.currentItemRoughness as 0 | 1 | 2,
    )
      ? (appState.currentItemRoughness as 0 | 1 | 2)
      : fallback.roughness,
    opacity: Number.isFinite(appState.currentItemOpacity)
      ? appState.currentItemOpacity
      : fallback.opacity,
    roundness: appState.currentItemRoundness ?? fallback.roundness,
    fontFamily: Number.isFinite(appState.currentItemFontFamily)
      ? appState.currentItemFontFamily
      : fallback.fontFamily,
    fontSize: Number.isFinite(appState.currentItemFontSize)
      ? appState.currentItemFontSize
      : fallback.fontSize,
    textAlign:
      (appState.currentItemTextAlign as PdfAnnotationToolbarState["textAlign"]) ??
      fallback.textAlign,
    startArrowhead:
      appState.currentItemStartArrowhead === undefined
        ? fallback.startArrowhead
        : (appState.currentItemStartArrowhead as PdfAnnotationToolbarState["startArrowhead"]),
    endArrowhead:
      appState.currentItemEndArrowhead === undefined
        ? fallback.endArrowhead
        : (appState.currentItemEndArrowhead as PdfAnnotationToolbarState["endArrowhead"]),
  };
}

function PdfAnnotationCanvas({
  scene,
  width,
  height,
  viewerZoom,
  toolbarState,
  isTouchDrawingEnabled,
  onDraftChange,
  onSave,
  onToolbarStateChange,
  onEditorReady,
}: {
  scene: string | undefined;
  width: number;
  height: number;
  viewerZoom: number;
  toolbarState: PdfAnnotationToolbarState;
  isTouchDrawingEnabled: boolean;
  onDraftChange: (scene: string) => void;
  onSave: (scene: string) => Promise<void>;
  onToolbarStateChange: (state: PdfAnnotationToolbarState) => void;
  onEditorReady: (editor: PdfAnnotationEditorHandle | null) => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const latestRef = useRef(scene ?? "");
  const initialSceneRef = useRef(scene);
  const committedRef = useRef(scene ?? "");
  const onSaveRef = useRef(onSave);
  const onDraftChangeRef = useRef(onDraftChange);
  const onToolbarStateChangeRef = useRef(onToolbarStateChange);
  const onEditorReadyRef = useRef(onEditorReady);
  const toolbarStateRef = useRef(toolbarState);
  const toolbarSignatureRef = useRef(JSON.stringify(toolbarState));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSceneRef = useRef<PendingPdfScene | null>(null);
  const pendingSaveRef = useRef<string | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const editorReadyFrameRef = useRef<number | null>(null);
  const coordinateRefreshFrameRef = useRef<number | null>(null);
  const isPointerActiveRef = useRef(false);
  const hasDeferredCoordinateRefreshRef = useRef(false);
  const viewportRef = useRef({ width, height, viewerZoom });
  const canonicalZoomRef = useRef<AppState["zoom"]>(
    parseScene(scene)?.appState.zoom ?? ({ value: 1 } as AppState["zoom"]),
  );
  const [initialData] = useState(() =>
    annotationInitialData(
      parseScene(latestRef.current || initialSceneRef.current),
      width,
      height,
      viewerZoom,
      toolbarStateRef.current,
      isTouchDrawingEnabled,
    ),
  );
  onSaveRef.current = onSave;
  onDraftChangeRef.current = onDraftChange;
  onToolbarStateChangeRef.current = onToolbarStateChange;
  onEditorReadyRef.current = onEditorReady;
  toolbarStateRef.current = toolbarState;
  toolbarSignatureRef.current = JSON.stringify(toolbarState);

  useEffect(() => {
    const api = apiRef.current;
    if (api) applyPdfToolbarState(api, toolbarState);
  }, [toolbarState]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const expectedPenMode = !isTouchDrawingEnabled;
    if (
      api.getAppState().penMode === expectedPenMode &&
      api.getAppState().penDetected
    )
      return;
    api.updateScene({
      appState: { penMode: expectedPenMode, penDetected: true },
      captureUpdate: "NEVER",
    });
  }, [isTouchDrawingEnabled]);

  const queueSave = useCallback((next: string) => {
    pendingSaveRef.current = next;
    if (!savePromiseRef.current) {
      savePromiseRef.current = (async () => {
        try {
          while (pendingSaveRef.current !== null) {
            const pending = pendingSaveRef.current;
            pendingSaveRef.current = null;
            await onSaveRef.current(pending);
            committedRef.current = pending;
          }
        } finally {
          savePromiseRef.current = null;
        }
      })();
    }
    return savePromiseRef.current;
  }, []);

  const serializePendingScene = useCallback(() => {
    const pending = pendingSceneRef.current;
    if (!pending) return latestRef.current;
    pendingSceneRef.current = null;
    const next = JSON.stringify({
      version: 1,
      source: "pdf-annotation",
      elements: pending.elements,
      appState: {
        scrollX: pending.scrollX,
        scrollY: pending.scrollY,
        zoom: canonicalZoomRef.current,
      },
      files: pending.files,
    } satisfies StoredPdfScene);
    if (next !== latestRef.current) {
      latestRef.current = next;
      onDraftChangeRef.current(next);
    }
    return next;
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const latest = serializePendingScene();
    if (latest && latest !== committedRef.current) {
      await queueSave(latest);
    } else if (savePromiseRef.current) {
      await savePromiseRef.current;
    }
  }, [queueSave, serializePendingScene]);

  const refreshCoordinates = useCallback(
    (api: ExcalidrawImperativeAPI | null = apiRef.current, force = false) => {
      if (!api || apiRef.current !== api) return;
      if (isPointerActiveRef.current && !force) {
        hasDeferredCoordinateRefreshRef.current = true;
        return;
      }
      hasDeferredCoordinateRefreshRef.current = false;
      if (coordinateRefreshFrameRef.current !== null) {
        cancelAnimationFrame(coordinateRefreshFrameRef.current);
        coordinateRefreshFrameRef.current = null;
      }

      // A stroke must use one stable DOM offset from pointer-down to pointer-up.
      // Recalculating it while Excalidraw is collecting points shifts the live
      // stroke, particularly on a scrolled, highly zoomed iPad page.
      api.refresh();
      if (force) return;
      coordinateRefreshFrameRef.current = requestAnimationFrame(() => {
        coordinateRefreshFrameRef.current = null;
        if (apiRef.current !== api) return;
        if (isPointerActiveRef.current) {
          hasDeferredCoordinateRefreshRef.current = true;
          return;
        }
        api.refresh();
        coordinateRefreshFrameRef.current = requestAnimationFrame(() => {
          coordinateRefreshFrameRef.current = null;
          if (apiRef.current !== api) return;
          if (isPointerActiveRef.current) {
            hasDeferredCoordinateRefreshRef.current = true;
            return;
          }
          api.refresh();
        });
      });
    },
    [],
  );

  const finishPointerInteraction = useCallback(() => {
    isPointerActiveRef.current = false;
    if (hasDeferredCoordinateRefreshRef.current) refreshCoordinates();
  }, [refreshCoordinates]);

  const synchronizeViewport = useCallback(
    (api: ExcalidrawImperativeAPI | null = apiRef.current) => {
      if (!api || apiRef.current !== api) return;
      const {
        width: nextWidth,
        height: nextHeight,
        viewerZoom: nextZoom,
      } = viewportRef.current;
      if (nextWidth <= 0 || nextHeight <= 0 || nextZoom <= 0) return;
      const canonicalZoom = canonicalZoomRef.current;
      const scaledZoom = {
        ...canonicalZoom,
        value: (canonicalZoom.value * nextZoom) as AppState["zoom"]["value"],
      };
      const appState = api.getAppState();
      if (
        Math.abs(appState.zoom.value - scaledZoom.value) <= 0.001 &&
        Math.abs(appState.width - nextWidth) <= 0.5 &&
        Math.abs(appState.height - nextHeight) <= 0.5
      )
        return;
      api.updateScene({
        appState: {
          height: nextHeight,
          width: nextWidth,
          zoom: scaledZoom,
        },
        captureUpdate: "NEVER",
      });
    },
    [],
  );

  useLayoutEffect(() => {
    // Expanded toolbar controls can wrap differently for each active tool,
    // shifting the PDF without changing the annotation layer's dimensions.
    // Re-read the DOM offset after that sibling layout change.
    if (toolbarState.tool) refreshCoordinates();
  }, [refreshCoordinates, toolbarState.tool]);

  const handleExcalidrawApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api;
      if (editorReadyFrameRef.current !== null) {
        cancelAnimationFrame(editorReadyFrameRef.current);
      }
      editorReadyFrameRef.current = requestAnimationFrame(() => {
        editorReadyFrameRef.current = null;
        const element = layerRef.current;
        if (apiRef.current !== api || !element) return;
        synchronizeViewport(api);
        refreshCoordinates(api);
        applyPdfToolbarState(api, toolbarStateRef.current);
        onEditorReadyRef.current({ api, element, flush });
      });
    },
    [flush, refreshCoordinates, synchronizeViewport],
  );

  useLayoutEffect(() => {
    viewportRef.current = { width, height, viewerZoom };
    synchronizeViewport();
    refreshCoordinates();
  }, [height, refreshCoordinates, synchronizeViewport, viewerZoom, width]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const observer = new ResizeObserver(() => refreshCoordinates());
    observer.observe(layer);
    const viewer = layer.closest<HTMLElement>("[data-pdf-viewer]");
    const pages = layer.closest<HTMLElement>("[data-pdf-pages]");
    if (viewer) observer.observe(viewer);
    if (pages) observer.observe(pages);

    let scrollFrame: number | null = null;
    const handleViewerScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        refreshCoordinates();
      });
    };
    viewer?.addEventListener("scroll", handleViewerScroll, { passive: true });

    return () => {
      observer.disconnect();
      viewer?.removeEventListener("scroll", handleViewerScroll);
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    };
  }, [refreshCoordinates]);

  useLayoutEffect(() => {
    return () => {
      if (editorReadyFrameRef.current !== null) {
        cancelAnimationFrame(editorReadyFrameRef.current);
        editorReadyFrameRef.current = null;
      }
      if (coordinateRefreshFrameRef.current !== null) {
        cancelAnimationFrame(coordinateRefreshFrameRef.current);
        coordinateRefreshFrameRef.current = null;
      }
      apiRef.current = null;
      onEditorReadyRef.current(null);
      void flush();
    };
  }, [flush]);

  return (
    <div
      ref={layerRef}
      className="pdf-annotation-layer absolute inset-0 z-10"
      style={{ width, height }}
      onPointerDownCapture={() => {
        const api = apiRef.current;
        if (!api) return;
        isPointerActiveRef.current = true;
        flushSync(() => refreshCoordinates(api, true));
      }}
      onPointerUp={finishPointerInteraction}
      onPointerCancel={() => {
        isPointerActiveRef.current = false;
        refreshCoordinates();
      }}
    >
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={handleExcalidrawApi}
        detectScroll={false}
        UIOptions={{
          tools: { image: false },
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            changeViewBackgroundColor: false,
          },
        }}
        onChange={(elements, appState, files) => {
          const expectedPenMode = !isTouchDrawingEnabled;
          if (appState.penMode !== expectedPenMode || !appState.penDetected) {
            queueMicrotask(() => {
              const api = apiRef.current;
              if (
                !api ||
                (api.getAppState().penMode === expectedPenMode &&
                  api.getAppState().penDetected)
              )
                return;
              api.updateScene({
                appState: { penMode: expectedPenMode, penDetected: true },
                captureUpdate: "NEVER",
              });
            });
          }
          const nextToolbarState = toolbarStateFromAppState(
            appState,
            toolbarStateRef.current,
          );
          const nextToolbarSignature = JSON.stringify(nextToolbarState);
          if (nextToolbarSignature !== toolbarSignatureRef.current) {
            toolbarSignatureRef.current = nextToolbarSignature;
            queueMicrotask(() =>
              onToolbarStateChangeRef.current(nextToolbarState),
            );
          }
          pendingSceneRef.current = {
            elements,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            files,
          };
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            const next = serializePendingScene();
            if (next && next !== committedRef.current) queueSave(next);
          }, SAVE_DELAY_MS);
        }}
        onPointerUp={(activeTool, pointerDownState) => {
          if (
            activeTool.type === "freedraw" &&
            toolbarStateRef.current.pressureMode === "constant" &&
            apiRef.current
          ) {
            const api = apiRef.current;
            window.requestAnimationFrame(() => {
              normalizeNewConstantWidthStroke(api, pointerDownState);
            });
          }
          finishPointerInteraction();
        }}
      />
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function PdfThumbnail({
  number,
  isActive,
  isAnnotated,
  onSelect,
}: {
  number: number;
  isActive: boolean;
  isAnnotated: boolean;
  onSelect: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || isVisible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`shrink-0 rounded border p-1 ${isActive ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white"}`}
    >
      <div
        ref={containerRef}
        className="flex h-[145px] w-28 items-center justify-center bg-slate-100 text-xs text-slate-400"
      >
        {isVisible ? (
          <Page
            pageNumber={number}
            width={112}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ) : (
          `Page ${number}`
        )}
      </div>
      <span className="block py-1 text-xs">
        {number}
        {isAnnotated ? " · annotated" : ""}
      </span>
    </button>
  );
}

function PdfEditablePage({
  documentId,
  pageNumber,
  scene,
  zoom,
  lazy,
  getIntersectionRoot,
  toolbarState,
  isTouchDrawingEnabled,
  onPageSizeChange,
  onActivate,
  onDraftChange,
  onSave,
  onToolbarStateChange,
  onEditorReady,
}: {
  documentId: string;
  pageNumber: number;
  scene: string | undefined;
  zoom: number;
  lazy: boolean;
  getIntersectionRoot: () => HTMLElement | null;
  toolbarState: PdfAnnotationToolbarState;
  isTouchDrawingEnabled: boolean;
  onPageSizeChange?: (width: number, height: number) => void;
  onActivate: () => void;
  onDraftChange: (scene: string) => void;
  onSave: (scene: string) => Promise<void>;
  onToolbarStateChange: (state: PdfAnnotationToolbarState) => void;
  onEditorReady: (editor: PdfAnnotationEditorHandle | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(!lazy);
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });

  useEffect(() => {
    if (!lazy) {
      setShouldRender(true);
      return;
    }
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShouldRender(entry.isIntersecting);
      },
      { root: getIntersectionRoot(), rootMargin: "1200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [getIntersectionRoot, lazy]);

  return (
    <div
      id={`pdf-page-${pageNumber}`}
      data-pdf-page-number={pageNumber}
      ref={containerRef}
      className="mx-auto"
      onPointerDownCapture={onActivate}
      style={{
        width: pageSize.width * zoom,
        height: pageSize.height * zoom + ANNOTATION_TOOLBAR_GUTTER_PX,
      }}
    >
      <div style={{ width: pageSize.width * zoom }}>
        <div
          className="pdf-annotation-toolbar-gutter flex items-center px-2 text-xs text-slate-500"
          style={{ height: ANNOTATION_TOOLBAR_GUTTER_PX }}
        >
          Page {pageNumber}
        </div>
        <div
          data-pdf-page-surface
          className="relative overflow-visible border border-slate-300 bg-white shadow-lg"
          style={{
            width: pageSize.width * zoom,
            height: pageSize.height * zoom,
          }}
        >
          {shouldRender ? (
            <>
              <Page
                pageNumber={pageNumber}
                scale={zoom}
                onLoadSuccess={(page) => {
                  const viewport = page.getViewport({ scale: 1 });
                  setPageSize({
                    width: viewport.width,
                    height: viewport.height,
                  });
                  onPageSizeChange?.(viewport.width, viewport.height);
                }}
              />
              <PdfAnnotationCanvas
                key={`${documentId}:${pageNumber}`}
                scene={scene}
                width={pageSize.width * zoom}
                height={pageSize.height * zoom}
                viewerZoom={zoom}
                toolbarState={toolbarState}
                isTouchDrawingEnabled={isTouchDrawingEnabled}
                onDraftChange={onDraftChange}
                onSave={onSave}
                onToolbarStateChange={onToolbarStateChange}
                onEditorReady={onEditorReady}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Loading page {pageNumber}…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PdfEditorApp() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const isCloud = Boolean(isSignedIn);
  const [documents, setDocuments] = useState<PdfDocumentRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<
    Record<number, PdfAnnotationRecord>
  >({});
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState<"fit-width" | "custom">("fit-width");
  const [isEditingZoom, setIsEditingZoom] = useState(false);
  const [zoomInput, setZoomInput] = useState("100");
  const [viewerWidth, setViewerWidth] = useState(0);
  const [activePageWidth, setActivePageWidth] = useState(612);
  const [viewMode, setViewMode] = useState<"single" | "continuous">("single");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [areThumbnailsOpen, setAreThumbnailsOpen] = useState(true);
  const [annotationToolbar, setAnnotationToolbar] =
    useState<PdfAnnotationToolbarState>(DEFAULT_PDF_ANNOTATION_TOOLBAR_STATE);
  const [annotationToolbarDock, setAnnotationToolbarDock] =
    useState<PdfToolbarDock>("top");
  const [isAnnotationToolbarCompact, setIsAnnotationToolbarCompact] =
    useState(false);
  const [pdfSource, setPdfSource] = useState<string | Blob | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [isBusy, setIsBusy] = useState(false);
  const [isImageLibraryOpen, setIsImageLibraryOpen] = useState(false);
  const [annotationExportScale, setAnnotationExportScale] =
    useState<PdfAnnotationExportScale>(3);
  const [settings, setSettings] = useState<UserSettings>(loadLocalSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const zoomInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const draftScenesRef = useRef(new Map<string, string>());
  const pageWidthsRef = useRef(new Map<number, number>());
  const viewerRef = useRef<HTMLElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const continuousScrollFrameRef = useRef<number | null>(null);
  const activeTouchPointersRef = useRef(
    new Map<number, { x: number; y: number }>(),
  );
  const touchPanSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const pinchSessionRef = useRef<{
    active: boolean;
    initialDistance: number;
    initialZoom: number;
    targetZoom: number;
    viewportAnchor: PdfZoomViewportAnchor | null;
  } | null>(null);
  const pinchZoomFrameRef = useRef<number | null>(null);
  const suppressTouchUntilClearRef = useRef(false);
  const pendingPinchZoomRef = useRef<number | null>(null);
  const pendingZoomAnchorRef = useRef<PdfZoomViewportAnchor | null>(null);
  const zoomAnchorFrameRef = useRef<number | null>(null);
  const annotationEditorsRef = useRef(
    new Map<number, PdfAnnotationEditorHandle>(),
  );
  const previousPageNumberRef = useRef(pageNumber);
  const fullscreenReturnFocusRef = useRef<HTMLElement | null>(null);
  const viewerScrollRef = useRef({ left: 0, top: 0 });
  const drawingViewportAnchorRef = useRef<{
    page: HTMLElement;
    left: number;
    top: number;
  } | null>(null);
  const drawingAnchorFrameRef = useRef<number | null>(null);
  const wasViewportFullscreenRef = useRef(false);
  const viewerResizeObserverRef = useRef<ResizeObserver | null>(null);
  const viewerWheelListenerRef = useRef<((event: WheelEvent) => void) | null>(
    null,
  );
  const viewerWheelHandlerRef = useRef<(event: WheelEvent) => void>(() => {});
  const viewerTouchCleanupRef = useRef<(() => void) | null>(null);
  const editorTouchCleanupRef = useRef<(() => void) | null>(null);
  const canvasRealignFrameRef = useRef<number | null>(null);
  const settingsChangedRef = useRef(false);
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const activeDocument =
    documents.find((document) => document.id === activeId) ?? null;

  useEffect(() => {
    applyAppearance(settings);
  }, [settings]);

  useEffect(() => {
    if (!isLoaded || !isCloud) return;
    let cancelled = false;
    void loadRemoteSettings()
      .then((remoteSettings) => {
        if (cancelled || settingsChangedRef.current) return;
        setSettings(remoteSettings);
        saveLocalSettings(remoteSettings);
        setSettingsSaveStatus("saved");
      })
      .catch(() => {
        if (!cancelled) setSettingsSaveStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [isCloud, isLoaded]);

  useEffect(
    () => () => {
      if (settingsSaveTimerRef.current) {
        clearTimeout(settingsSaveTimerRef.current);
      }
      if (canvasRealignFrameRef.current !== null) {
        cancelAnimationFrame(canvasRealignFrameRef.current);
      }
    },
    [],
  );

  const updateSettings = (nextSettings: UserSettings) => {
    settingsChangedRef.current = true;
    setSettings(nextSettings);
    saveLocalSettings(nextSettings);
    applyAppearance(nextSettings);
    if (!isCloud) {
      setSettingsSaveStatus("saved");
      return;
    }
    setSettingsSaveStatus("saving");
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
    }
    settingsSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveRemoteSettings(nextSettings);
        setSettingsSaveStatus("saved");
      } catch {
        setSettingsSaveStatus("error");
      }
    }, 400);
  };

  useEffect(() => {
    if (!isEditingZoom) return;
    zoomInputRef.current?.focus();
    zoomInputRef.current?.select();
  }, [isEditingZoom]);
  const maxPdfZoom =
    (settings.pdfMaxZoomPercent ?? DEFAULT_PDF_MAX_ZOOM_PERCENT) / 100;
  const fitWidthZoom = Math.min(
    maxPdfZoom,
    Math.max(
      MIN_PDF_ZOOM,
      viewerWidth > 0 ? (viewerWidth - 32) / activePageWidth : 1,
    ),
  );
  const effectivePdfZoom =
    zoomMode === "fit-width" ? fitWidthZoom : Math.min(pdfZoom, maxPdfZoom);
  const getViewerElement = useCallback(() => viewerRef.current, []);
  const captureZoomViewportAnchor = useCallback(
    (clientX?: number, clientY?: number): PdfZoomViewportAnchor | null => {
      const viewer = viewerRef.current;
      if (!viewer) return null;
      const viewerBounds = viewer.getBoundingClientRect();
      const anchorX = clientX ?? (viewerBounds.left + viewerBounds.right) / 2;
      const anchorY = clientY ?? (viewerBounds.top + viewerBounds.bottom) / 2;
      const pointTarget = document.elementFromPoint(anchorX, anchorY);
      const surface =
        pointTarget?.closest<HTMLElement>("[data-pdf-page-surface]") ??
        document.querySelector<HTMLElement>(
          `#pdf-page-${pageNumber} [data-pdf-page-surface]`,
        );
      if (!surface) return null;
      const surfaceBounds = surface.getBoundingClientRect();
      return {
        surface,
        clientX: anchorX,
        clientY: anchorY,
        xRatio: Math.min(
          1,
          Math.max(0, (anchorX - surfaceBounds.left) / surfaceBounds.width),
        ),
        yRatio: Math.min(
          1,
          Math.max(0, (anchorY - surfaceBounds.top) / surfaceBounds.height),
        ),
      };
    },
    [pageNumber],
  );

  useEffect(() => {
    const previousPageNumber = previousPageNumberRef.current;
    previousPageNumberRef.current = pageNumber;
    const pageWidth = pageWidthsRef.current.get(pageNumber);
    if (pageWidth) setActivePageWidth(pageWidth);
    if (previousPageNumber === pageNumber) return;
    void annotationEditorsRef.current
      .get(previousPageNumber)
      ?.flush()
      .catch(() => setStatus("Save failed"));
  }, [pageNumber]);

  const scheduleContinuousActivePageUpdate = useCallback(() => {
    if (viewMode !== "continuous" || continuousScrollFrameRef.current !== null)
      return;
    continuousScrollFrameRef.current = requestAnimationFrame(() => {
      continuousScrollFrameRef.current = null;
      const viewer = viewerRef.current;
      const pages = pagesRef.current;
      if (!viewer || !pages) return;

      const viewerRect = viewer.getBoundingClientRect();
      let bestPage: number | null = null;
      let bestVisibleHeight = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const page of pages.querySelectorAll<HTMLElement>(
        "[data-pdf-page-number]",
      )) {
        const rect = page.getBoundingClientRect();
        const visibleHeight = Math.max(
          0,
          Math.min(rect.bottom, viewerRect.bottom) -
            Math.max(rect.top, viewerRect.top),
        );
        const distance = Math.abs(rect.top - viewerRect.top);
        if (
          visibleHeight > bestVisibleHeight ||
          (visibleHeight === bestVisibleHeight && distance < bestDistance)
        ) {
          bestPage = Number(page.dataset.pdfPageNumber);
          bestVisibleHeight = visibleHeight;
          bestDistance = distance;
        }
      }
      if (bestPage && bestVisibleHeight > 0) {
        setPageNumber((current) => (current === bestPage ? current : bestPage));
      }
    });
  }, [viewMode]);

  useEffect(() => {
    scheduleContinuousActivePageUpdate();
    return () => {
      if (continuousScrollFrameRef.current !== null) {
        cancelAnimationFrame(continuousScrollFrameRef.current);
        continuousScrollFrameRef.current = null;
      }
    };
  }, [scheduleContinuousActivePageUpdate]);

  useEffect(
    () => () => {
      if (drawingAnchorFrameRef.current !== null) {
        cancelAnimationFrame(drawingAnchorFrameRef.current);
      }
      if (zoomAnchorFrameRef.current !== null) {
        cancelAnimationFrame(zoomAnchorFrameRef.current);
      }
      if (pinchZoomFrameRef.current !== null) {
        cancelAnimationFrame(pinchZoomFrameRef.current);
        pinchZoomFrameRef.current = null;
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const pendingZoom = pendingPinchZoomRef.current;
    if (
      pendingZoom === null ||
      Math.abs(pendingZoom - effectivePdfZoom) > 0.001
    )
      return;
    pendingPinchZoomRef.current = null;
    const viewportAnchor = pendingZoomAnchorRef.current;
    pendingZoomAnchorRef.current = null;
    if (pagesRef.current) {
      pagesRef.current.style.transform = "";
      pagesRef.current.style.transformOrigin = "";
      pagesRef.current.style.willChange = "";
    }
    if (!viewportAnchor) return;

    const restoreAnchor = () => {
      const viewer = viewerRef.current;
      if (!viewer || !viewportAnchor.surface.isConnected) return;
      const bounds = viewportAnchor.surface.getBoundingClientRect();
      const anchoredX = bounds.left + bounds.width * viewportAnchor.xRatio;
      const anchoredY = bounds.top + bounds.height * viewportAnchor.yRatio;
      viewer.scrollBy({
        left: anchoredX - viewportAnchor.clientX,
        top: anchoredY - viewportAnchor.clientY,
      });
    };

    restoreAnchor();
    if (zoomAnchorFrameRef.current !== null) {
      cancelAnimationFrame(zoomAnchorFrameRef.current);
    }
    zoomAnchorFrameRef.current = requestAnimationFrame(() => {
      restoreAnchor();
      zoomAnchorFrameRef.current = requestAnimationFrame(() => {
        zoomAnchorFrameRef.current = null;
        restoreAnchor();
      });
    });
  }, [effectivePdfZoom]);

  const observeViewer = useCallback((element: HTMLElement | null) => {
    if (viewerRef.current && viewerWheelListenerRef.current) {
      viewerRef.current.removeEventListener(
        "wheel",
        viewerWheelListenerRef.current,
        true,
      );
    }
    viewerResizeObserverRef.current?.disconnect();
    viewerTouchCleanupRef.current?.();
    viewerResizeObserverRef.current = null;
    viewerWheelListenerRef.current = null;
    viewerTouchCleanupRef.current = null;
    viewerRef.current = element;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewerWidth(entry.contentRect.width);
    });
    observer.observe(element);
    viewerResizeObserverRef.current = observer;
    const wheelListener = (event: WheelEvent) => {
      viewerWheelHandlerRef.current(event);
    };
    element.addEventListener("wheel", wheelListener, {
      capture: true,
      passive: false,
    });
    viewerWheelListenerRef.current = wheelListener;

    const isPdfPageGesture = (event: Event) => {
      const target = event.target;
      return (
        target instanceof Node && Boolean(pagesRef.current?.contains(target))
      );
    };
    const blockSafariPagePinch = (event: Event) => {
      if (!isPdfPageGesture(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const blockSafariMultiTouch = (event: TouchEvent) => {
      if (event.touches.length < 2 || !isPdfPageGesture(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const nonPassiveCapture = { capture: true, passive: false } as const;
    element.addEventListener(
      "touchstart",
      blockSafariMultiTouch,
      nonPassiveCapture,
    );
    element.addEventListener(
      "touchmove",
      blockSafariMultiTouch,
      nonPassiveCapture,
    );
    element.addEventListener(
      "gesturestart",
      blockSafariPagePinch,
      nonPassiveCapture,
    );
    element.addEventListener(
      "gesturechange",
      blockSafariPagePinch,
      nonPassiveCapture,
    );
    element.addEventListener(
      "gestureend",
      blockSafariPagePinch,
      nonPassiveCapture,
    );
    viewerTouchCleanupRef.current = () => {
      element.removeEventListener(
        "touchstart",
        blockSafariMultiTouch,
        nonPassiveCapture,
      );
      element.removeEventListener(
        "touchmove",
        blockSafariMultiTouch,
        nonPassiveCapture,
      );
      element.removeEventListener(
        "gesturestart",
        blockSafariPagePinch,
        nonPassiveCapture,
      );
      element.removeEventListener(
        "gesturechange",
        blockSafariPagePinch,
        nonPassiveCapture,
      );
      element.removeEventListener(
        "gestureend",
        blockSafariPagePinch,
        nonPassiveCapture,
      );
    };
  }, []);

  const observePdfEditorRoot = useCallback((element: HTMLElement | null) => {
    editorTouchCleanupRef.current?.();
    editorTouchCleanupRef.current = null;
    if (!element) return;

    const blockPdfEditorPinch = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const blockPdfEditorMultiTouch = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const nonPassiveCapture = { capture: true, passive: false } as const;

    window.addEventListener(
      "touchstart",
      blockPdfEditorMultiTouch,
      nonPassiveCapture,
    );
    window.addEventListener(
      "touchmove",
      blockPdfEditorMultiTouch,
      nonPassiveCapture,
    );
    window.addEventListener(
      "gesturestart",
      blockPdfEditorPinch,
      nonPassiveCapture,
    );
    window.addEventListener(
      "gesturechange",
      blockPdfEditorPinch,
      nonPassiveCapture,
    );
    window.addEventListener(
      "gestureend",
      blockPdfEditorPinch,
      nonPassiveCapture,
    );

    editorTouchCleanupRef.current = () => {
      window.removeEventListener(
        "touchstart",
        blockPdfEditorMultiTouch,
        nonPassiveCapture,
      );
      window.removeEventListener(
        "touchmove",
        blockPdfEditorMultiTouch,
        nonPassiveCapture,
      );
      window.removeEventListener(
        "gesturestart",
        blockPdfEditorPinch,
        nonPassiveCapture,
      );
      window.removeEventListener(
        "gesturechange",
        blockPdfEditorPinch,
        nonPassiveCapture,
      );
      window.removeEventListener(
        "gestureend",
        blockPdfEditorPinch,
        nonPassiveCapture,
      );
    };
  }, []);

  const realignAnnotationCanvases = useCallback((announce = true) => {
    pendingPinchZoomRef.current = null;
    pinchSessionRef.current = null;
    if (pinchZoomFrameRef.current !== null) {
      cancelAnimationFrame(pinchZoomFrameRef.current);
      pinchZoomFrameRef.current = null;
    }
    suppressTouchUntilClearRef.current = false;
    activeTouchPointersRef.current.clear();
    touchPanSessionRef.current = null;
    if (pagesRef.current) {
      pagesRef.current.style.transform = "";
      pagesRef.current.style.transformOrigin = "";
      pagesRef.current.style.willChange = "";
    }
    if (canvasRealignFrameRef.current !== null) {
      cancelAnimationFrame(canvasRealignFrameRef.current);
    }

    const refreshMountedEditors = () => {
      for (const editor of annotationEditorsRef.current.values()) {
        editor.api.refresh();
      }
    };
    refreshMountedEditors();
    canvasRealignFrameRef.current = requestAnimationFrame(() => {
      refreshMountedEditors();
      canvasRealignFrameRef.current = requestAnimationFrame(() => {
        canvasRealignFrameRef.current = null;
        refreshMountedEditors();
      });
    });
    if (announce) setStatus("Canvas realigned");
  }, []);

  useLayoutEffect(() => {
    const wasFullscreen = wasViewportFullscreenRef.current;
    wasViewportFullscreenRef.current = isFullscreen;
    if (wasFullscreen === isFullscreen) return;

    const targetScroll = { ...viewerScrollRef.current };
    let settledFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      viewerRef.current?.scrollTo(targetScroll);
      settledFrame = requestAnimationFrame(() => {
        viewerRef.current?.scrollTo(targetScroll);
        realignAnnotationCanvases(false);
      });
      if (wasFullscreen && !isFullscreen) {
        fullscreenReturnFocusRef.current?.focus({ preventScroll: true });
        fullscreenReturnFocusRef.current = null;
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      if (settledFrame !== null) cancelAnimationFrame(settledFrame);
    };
  }, [isFullscreen, realignAnnotationCanvases]);

  useEffect(() => {
    if (!isFullscreen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsFullscreen(false);
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      fullscreenReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      viewerScrollRef.current = {
        left: viewerRef.current?.scrollLeft ?? 0,
        top: viewerRef.current?.scrollTop ?? 0,
      };
    }
    setIsFullscreen((current) => !current);
  };

  const setAnchoredPdfZoom = (
    nextZoom: number,
    viewportAnchor = captureZoomViewportAnchor(),
  ) => {
    const normalizedZoom = Math.min(
      maxPdfZoom,
      Math.max(MIN_PDF_ZOOM, nextZoom),
    );
    const scheduledZoom = pendingPinchZoomRef.current ?? effectivePdfZoom;
    if (Math.abs(normalizedZoom - scheduledZoom) <= 0.001) return;
    pendingPinchZoomRef.current = normalizedZoom;
    pendingZoomAnchorRef.current = viewportAnchor;
    setZoomMode("custom");
    setPdfZoom(normalizedZoom);
  };

  const changePdfZoom = (change: number) => {
    setAnchoredPdfZoom(effectivePdfZoom + change);
  };

  const claimPdfTouchGesture = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  };

  const captureDrawingViewportAnchor = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      annotationToolbar.tool !== "freedraw" ||
      (event.pointerType !== "pen" &&
        !(event.pointerType === "touch" && settings.touchDrawingEnabled))
    )
      return;
    const target = event.target;
    const page =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-pdf-page-number]")
        : null;
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    drawingViewportAnchorRef.current = {
      page,
      left: bounds.left,
      top: bounds.top,
    };
    if (drawingAnchorFrameRef.current !== null) {
      cancelAnimationFrame(drawingAnchorFrameRef.current);
      drawingAnchorFrameRef.current = null;
    }
  };

  const restoreDrawingViewportAnchor = () => {
    const anchor = drawingViewportAnchorRef.current;
    drawingViewportAnchorRef.current = null;
    if (!anchor) return;

    const restore = () => {
      const viewer = viewerRef.current;
      if (!viewer || !anchor.page.isConnected) return;
      const bounds = anchor.page.getBoundingClientRect();
      const leftDelta = bounds.left - anchor.left;
      const topDelta = bounds.top - anchor.top;
      if (Math.abs(leftDelta) > 0.5 || Math.abs(topDelta) > 0.5) {
        viewer.scrollBy({ left: leftDelta, top: topDelta });
      }
    };

    drawingAnchorFrameRef.current = requestAnimationFrame(() => {
      restore();
      drawingAnchorFrameRef.current = requestAnimationFrame(() => {
        drawingAnchorFrameRef.current = null;
        restore();
      });
    });
  };

  const handlePdfPointerDownCapture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    captureDrawingViewportAnchor(event);
    if (
      event.pointerType !== "touch" ||
      !pagesRef.current?.contains(event.target as Node)
    )
      return;

    activeTouchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (
      settings.touchDrawingEnabled &&
      activeTouchPointersRef.current.size < 2
    ) {
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort on older iPadOS Safari releases.
    }
    claimPdfTouchGesture(event);
    if (
      activeTouchPointersRef.current.size === 1 &&
      !settings.touchDrawingEnabled
    ) {
      const viewer = viewerRef.current;
      if (viewer) {
        touchPanSessionRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startScrollLeft: viewer.scrollLeft,
          startScrollTop: viewer.scrollTop,
        };
      }
    }
    if (activeTouchPointersRef.current.size < 2) return;
    touchPanSessionRef.current = null;
    drawingViewportAnchorRef.current = null;
    if (suppressTouchUntilClearRef.current) {
      return;
    }

    const [first, second] = Array.from(activeTouchPointersRef.current.values());
    const initialDistance = Math.max(
      1,
      Math.hypot(second.x - first.x, second.y - first.y),
    );
    const initialCenterX = (first.x + second.x) / 2;
    const initialCenterY = (first.y + second.y) / 2;

    pinchSessionRef.current = {
      active: true,
      initialDistance,
      initialZoom: effectivePdfZoom,
      targetZoom: effectivePdfZoom,
      viewportAnchor: captureZoomViewportAnchor(initialCenterX, initialCenterY),
    };
    suppressTouchUntilClearRef.current = true;
  };

  const handlePdfPointerMoveCapture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      event.pointerType !== "touch" ||
      !activeTouchPointersRef.current.has(event.pointerId)
    )
      return;

    activeTouchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (settings.touchDrawingEnabled && !suppressTouchUntilClearRef.current) {
      return;
    }
    claimPdfTouchGesture(event);
    if (!suppressTouchUntilClearRef.current) {
      const viewer = viewerRef.current;
      const panSession = touchPanSessionRef.current;
      if (viewer && panSession?.pointerId === event.pointerId) {
        viewer.scrollTo({
          left: panSession.startScrollLeft + panSession.startX - event.clientX,
          top: panSession.startScrollTop + panSession.startY - event.clientY,
        });
      }
      return;
    }

    const session = pinchSessionRef.current;
    if (!session?.active || activeTouchPointersRef.current.size < 2) return;
    const [first, second] = Array.from(activeTouchPointersRef.current.values());
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    session.targetZoom = Math.min(
      maxPdfZoom,
      Math.max(
        MIN_PDF_ZOOM,
        session.initialZoom * (distance / session.initialDistance),
      ),
    );
    if (session.viewportAnchor) {
      session.viewportAnchor.clientX = centerX;
      session.viewportAnchor.clientY = centerY;
    }
    if (pinchZoomFrameRef.current !== null) return;
    pinchZoomFrameRef.current = requestAnimationFrame(() => {
      pinchZoomFrameRef.current = null;
      const liveSession = pinchSessionRef.current;
      if (!liveSession?.active) return;
      setAnchoredPdfZoom(
        liveSession.targetZoom,
        liveSession.viewportAnchor ? { ...liveSession.viewportAnchor } : null,
      );
    });
  };

  const handlePdfPointerEndCapture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.pointerType === "pen") restoreDrawingViewportAnchor();
    if (
      event.pointerType !== "touch" ||
      !activeTouchPointersRef.current.has(event.pointerId)
    )
      return;

    activeTouchPointersRef.current.delete(event.pointerId);
    if (touchPanSessionRef.current?.pointerId === event.pointerId) {
      touchPanSessionRef.current = null;
    }
    if (settings.touchDrawingEnabled && !suppressTouchUntilClearRef.current) {
      restoreDrawingViewportAnchor();
      return;
    }
    claimPdfTouchGesture(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const session = pinchSessionRef.current;
    if (session?.active && activeTouchPointersRef.current.size < 2) {
      session.active = false;
      if (pinchZoomFrameRef.current !== null) {
        cancelAnimationFrame(pinchZoomFrameRef.current);
        pinchZoomFrameRef.current = null;
      }
      if (Math.abs(session.targetZoom - session.initialZoom) > 0.001) {
        setAnchoredPdfZoom(
          session.targetZoom,
          session.viewportAnchor ? { ...session.viewportAnchor } : null,
        );
      } else if (pagesRef.current) {
        pagesRef.current.style.transform = "";
        pagesRef.current.style.transformOrigin = "";
        pagesRef.current.style.willChange = "";
      }
    }

    if (activeTouchPointersRef.current.size === 0) {
      suppressTouchUntilClearRef.current = false;
      pinchSessionRef.current = null;
      touchPanSessionRef.current = null;
    }
  };

  viewerWheelHandlerRef.current = (event) => {
    event.stopPropagation();
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changePdfZoom(event.deltaY < 0 ? 0.1 : -0.1);
  };

  const startEditingZoom = () => {
    setZoomInput(String(Math.round(effectivePdfZoom * 100)));
    setIsEditingZoom(true);
  };

  const commitZoomInput = () => {
    const percentage = Number(zoomInput);
    if (Number.isFinite(percentage)) {
      setAnchoredPdfZoom(percentage / 100);
    }
    setIsEditingZoom(false);
  };

  const runActivePageHistory = (redo: boolean) => {
    const editor = annotationEditorsRef.current.get(pageNumber);
    if (!editor) {
      setStatus(`Page ${pageNumber} is not ready`);
      return;
    }

    const target =
      editor.element.querySelector<HTMLElement>(".excalidraw") ??
      editor.element;
    target.focus({ preventScroll: true });
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        ctrlKey: !isMac,
        metaKey: isMac,
        shiftKey: redo,
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  const changeAnnotationToolbar = (
    change: Partial<PdfAnnotationToolbarState>,
  ) => {
    const normalizedChange =
      change.tool === "selection" || change.tool === "eraser"
        ? { ...change, toolLocked: false }
        : change;
    setAnnotationToolbar((current) => ({
      ...current,
      ...normalizedChange,
    }));
    const editor = annotationEditorsRef.current.get(pageNumber);
    if (!editor) return;
    if (
      normalizedChange.tool !== undefined ||
      normalizedChange.toolLocked !== undefined
    ) {
      editor.api.setActiveTool({
        type: normalizedChange.tool ?? annotationToolbar.tool,
        locked: normalizedChange.toolLocked ?? annotationToolbar.toolLocked,
      });
    }
    applyPdfToolbarChangeToSelection(editor.api, normalizedChange);
  };

  const handleImageInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeDocument) return;

    const editor = annotationEditorsRef.current.get(pageNumber);
    if (!editor) {
      setStatus(`Page ${pageNumber} is not ready`);
      return;
    }
    if (!isAllowedImageContentType(file.type)) {
      setStatus("Choose a JPEG, PNG, WebP, or GIF image");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setStatus("Images must be 10 MB or smaller");
      return;
    }

    setIsBusy(true);
    setStatus("Adding image…");
    try {
      const [{ width: naturalWidth, height: naturalHeight }, excalidraw] =
        await Promise.all([
          loadImageDimensions(file),
          import("@excalidraw/excalidraw"),
        ]);
      let dataURL: DataURL;
      if (isCloud) {
        if (!userId) throw new Error("Sign in before adding an image.");
        const blob = await upload(
          `users/${userId}/images/${activeDocument.id}/${sanitizeImageFilename(file.name)}`,
          file,
          {
            access: "private",
            handleUploadUrl: "/api/attachments/upload",
            clientPayload: JSON.stringify({
              kind: "pdf-annotation",
              documentId: activeDocument.id,
            }),
          },
        );
        dataURL = createPrivateImageUrl(blob.pathname) as DataURL;
      } else {
        dataURL = (await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error("Could not read this image."));
          reader.readAsDataURL(file);
        })) as DataURL;
      }

      const appState = editor.api.getAppState();
      const zoom = appState.zoom.value;
      const maximumWidth = Math.max(120, appState.width / zoom / 2);
      const maximumHeight = Math.max(120, appState.height / zoom / 2);
      const scale = Math.min(
        1,
        maximumWidth / naturalWidth,
        maximumHeight / naturalHeight,
      );
      const width = Math.max(1, naturalWidth * scale);
      const height = Math.max(1, naturalHeight * scale);
      const centerX = appState.width / (2 * zoom) - appState.scrollX;
      const centerY = appState.height / (2 * zoom) - appState.scrollY;
      const fileId = createId() as FileId;
      const [imageElement] = excalidraw.convertToExcalidrawElements(
        [
          {
            type: "image",
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
            fileId,
            status: "saved",
          },
        ],
        { regenerateIds: true },
      );
      editor.api.addFiles([
        {
          id: fileId,
          mimeType: file.type as BinaryFileData["mimeType"],
          dataURL,
          created: Date.now(),
          lastRetrieved: Date.now(),
        },
      ]);
      editor.api.updateScene({
        elements: [
          ...editor.api.getSceneElementsIncludingDeleted(),
          imageElement,
        ],
        appState: { selectedElementIds: { [imageElement.id]: true } },
        captureUpdate: excalidraw.CaptureUpdateAction.IMMEDIATELY,
      });
      setAnnotationToolbar((current) => ({
        ...current,
        tool: "selection",
        toolLocked: false,
      }));
      setStatus("Image added");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add image");
    } finally {
      setIsBusy(false);
    }
  };

  const insertLibraryImage = async (image: UploadedImage) => {
    setIsImageLibraryOpen(false);
    const editor = annotationEditorsRef.current.get(pageNumber);
    if (!editor) {
      setStatus(`Page ${pageNumber} is not ready`);
      return;
    }

    setIsBusy(true);
    setStatus("Adding library image…");
    try {
      const [{ width: naturalWidth, height: naturalHeight }, excalidraw] =
        await Promise.all([
          loadImageDimensions(image.url),
          import("@excalidraw/excalidraw"),
        ]);
      const appState = editor.api.getAppState();
      const zoom = appState.zoom.value;
      const maximumWidth = Math.max(120, appState.width / zoom / 2);
      const maximumHeight = Math.max(120, appState.height / zoom / 2);
      const scale = Math.min(
        1,
        maximumWidth / naturalWidth,
        maximumHeight / naturalHeight,
      );
      const width = Math.max(1, naturalWidth * scale);
      const height = Math.max(1, naturalHeight * scale);
      const centerX = appState.width / (2 * zoom) - appState.scrollX;
      const centerY = appState.height / (2 * zoom) - appState.scrollY;
      const fileId = createId() as FileId;
      const [imageElement] = excalidraw.convertToExcalidrawElements(
        [
          {
            type: "image",
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
            fileId,
            status: "saved",
          },
        ],
        { regenerateIds: true },
      );
      editor.api.addFiles([
        {
          id: fileId,
          mimeType: getImageContentType(image.originalFilename),
          dataURL: image.url as DataURL,
          created: image.uploadedAt,
          lastRetrieved: Date.now(),
        },
      ]);
      editor.api.updateScene({
        elements: [
          ...editor.api.getSceneElementsIncludingDeleted(),
          imageElement,
        ],
        appState: { selectedElementIds: { [imageElement.id]: true } },
        captureUpdate: excalidraw.CaptureUpdateAction.IMMEDIATELY,
      });
      setAnnotationToolbar((current) => ({
        ...current,
        tool: "selection",
        toolLocked: false,
      }));
      setStatus("Library image added");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not add the library image",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const reloadDocuments = useCallback(async () => {
    if (!isLoaded) return;
    const next = isCloud
      ? await listRemotePdfDocuments()
      : await listGuestPdfDocuments();
    setDocuments(next);
    setActiveId((current) =>
      current && next.some((document) => document.id === current)
        ? current
        : (next[0]?.id ?? null),
    );
    setStatus(next.length ? "Saved" : "No PDFs yet");
  }, [isCloud, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    setDocuments([]);
    setActiveId(null);
    reloadDocuments().catch(() => setStatus("Could not load PDFs"));
  }, [isLoaded, reloadDocuments]);

  useEffect(() => {
    let cancelled = false;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPdfSource(null);
    setAnnotations({});
    setPageNumber(1);
    if (!activeDocument) return;
    Promise.all([
      isCloud
        ? Promise.resolve(getRemotePdfUrl(activeDocument))
        : getGuestPdfBlob(activeDocument.id).then((blob) => {
            if (!blob) throw new Error("Missing local PDF");
            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;
            return url;
          }),
      isCloud
        ? loadRemotePdfAnnotations(activeDocument.id)
        : listGuestPdfAnnotations(activeDocument.id),
    ])
      .then(([source, records]) => {
        if (cancelled) return;
        setPdfSource(source);
        setAnnotations(
          Object.fromEntries(records.map((item) => [item.pageNumber, item])),
        );
      })
      .catch(() => setStatus("Could not open this PDF"));
    return () => {
      cancelled = true;
    };
  }, [activeDocument, isCloud]);

  const inspectPdf = useCallback(async (file: File) => {
    const bytes = await file.arrayBuffer();
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
      return { bytes, pageCount: pdf.getPageCount() };
    } catch (error) {
      throw new Error(
        error instanceof Error && /encrypt/i.test(error.message)
          ? "Password-protected PDFs are not supported yet."
          : "The selected file could not be read as a PDF.",
      );
    }
  }, []);

  const importPdf = useCallback(
    async (
      file: File,
      importedAnnotations: PdfAnnotationRecord[] = [],
      title?: string,
    ) => {
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        throw new Error("Choose a PDF file");
      }
      const { pageCount } = await inspectPdf(file);
      let limits = getGuestPdfLimits();
      if (isCloud) {
        try {
          const response = await fetch("/api/pdf-documents/limits", {
            credentials: "same-origin",
          });
          if (response.status === 401 || response.status === 403) {
            throw new Error(
              "Your sign-in session is not available to the server. Refresh the page and sign in again.",
            );
          }
          if (!response.ok) throw new Error("Could not read upload limits");
          limits = (await response.json()) as typeof limits;
        } catch (error) {
          if (error instanceof Error && /sign-in session/.test(error.message)) {
            throw error;
          }
          limits = {
            maximumSizeInBytes: DEFAULT_PDF_MAX_UPLOAD_BYTES,
            maximumPages: DEFAULT_PDF_MAX_PAGES,
          };
        }
      }
      if (
        limits.maximumSizeInBytes !== null &&
        file.size > limits.maximumSizeInBytes
      ) {
        throw new Error(
          `PDF is larger than ${formatBytes(limits.maximumSizeInBytes)}`,
        );
      }
      if (limits.maximumPages !== null && pageCount > limits.maximumPages) {
        throw new Error(`PDF has more than ${limits.maximumPages} pages`);
      }

      const id = createId();
      let documentRecord: PdfDocumentRecord;
      if (isCloud) {
        if (!userId) throw new Error("Sign in before uploading");
        const filename = sanitizePdfFilename(file.name);
        let blob: Awaited<ReturnType<typeof upload>>;
        try {
          blob = await upload(`users/${userId}/pdfs/${id}/${filename}`, file, {
            access: "private",
            contentType: "application/pdf",
            handleUploadUrl: "/api/pdf-documents/upload",
            clientPayload: JSON.stringify({ documentId: id }),
            multipart: file.size >= MULTIPART_UPLOAD_THRESHOLD_BYTES,
            onUploadProgress: ({ percentage }) => {
              setStatus(`Uploading PDF… ${Math.round(percentage)}%`);
            },
          });
        } catch (error) {
          throw new Error(
            `The PDF was read successfully, but the cloud upload failed: ${
              error instanceof Error ? error.message : "network request failed"
            }`,
          );
        }
        const pathname = blob.pathname;
        let response: Response;
        try {
          response = await fetch("/api/pdf-documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              title: title ?? filename.replace(/\.pdf$/i, ""),
              originalFilename: filename,
              pathname,
              sizeBytes: file.size,
              pageCount,
            }),
          });
        } catch (error) {
          throw new Error(
            `The PDF uploaded, but its document record could not be created: ${
              error instanceof Error ? error.message : "network request failed"
            }`,
          );
        }
        if (!response.ok) throw new Error("Could not save PDF metadata");
        documentRecord = (
          (await response.json()) as { document: PdfDocumentRecord }
        ).document;
        for (const annotation of importedAnnotations) {
          await saveRemotePdfAnnotation(
            id,
            annotation.pageNumber,
            annotation.scene,
          );
        }
      } else {
        const now = Date.now();
        documentRecord = {
          id,
          title: title ?? file.name.replace(/\.pdf$/i, ""),
          originalFilename: sanitizePdfFilename(file.name),
          pathname: null,
          sizeBytes: file.size,
          pageCount,
          createdAt: now,
          updatedAt: now,
        };
        await createGuestPdfDocument(documentRecord, file);
        for (const annotation of importedAnnotations) {
          await saveGuestPdfAnnotation(
            id,
            annotation.pageNumber,
            annotation.scene,
          );
        }
      }
      await reloadDocuments();
      setActiveId(documentRecord.id);
    },
    [inspectPdf, isCloud, reloadDocuments, userId],
  );

  const handlePdfInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsBusy(true);
    setStatus("Importing PDF…");
    try {
      await importPdf(file);
      setStatus("Saved");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not import PDF",
      );
      setStatus("Import failed");
    } finally {
      setIsBusy(false);
    }
  };

  const persistScene = useCallback(
    async (annotationPageNumber: number, scene: string) => {
      if (!activeDocument) return;
      setStatus("Saving…");
      setAnnotations((current) => ({
        ...current,
        [annotationPageNumber]: {
          pageNumber: annotationPageNumber,
          scene,
          revision: (current[annotationPageNumber]?.revision ?? 0) + 1,
          updatedAt: Date.now(),
        },
      }));
      try {
        if (isCloud)
          await saveRemotePdfAnnotation(
            activeDocument.id,
            annotationPageNumber,
            scene,
          );
        else
          await saveGuestPdfAnnotation(
            activeDocument.id,
            annotationPageNumber,
            scene,
          );
        setStatus("Saved");
      } catch {
        setStatus("Save failed");
      }
    },
    [activeDocument, isCloud],
  );

  const getPdfBytes = useCallback(async () => {
    if (!activeDocument) throw new Error("No PDF selected");
    if (isCloud) {
      const response = await fetch(getRemotePdfUrl(activeDocument));
      if (!response.ok) throw new Error("Could not download PDF");
      return new Uint8Array(await response.arrayBuffer());
    }
    const blob = await getGuestPdfBlob(activeDocument.id);
    if (!blob) throw new Error("Local PDF is missing");
    return new Uint8Array(await blob.arrayBuffer());
  }, [activeDocument, isCloud]);

  const exportEditable = async () => {
    if (!activeDocument) return;
    setIsBusy(true);
    setStatus("Creating editable project…");
    try {
      const { strToU8, zipSync } = await import("fflate");
      const project: EditableProject = {
        format: "note-taking-app-pdf-project",
        version: 1,
        title: activeDocument.title,
        originalFilename: activeDocument.originalFilename,
        annotations: Object.values(annotations),
      };
      const archive = zipSync({
        "project.json": strToU8(JSON.stringify(project)),
        "document.pdf": await getPdfBytes(),
      });
      downloadBlob(
        new Blob([archive as BlobPart], { type: "application/zip" }),
        `${activeDocument.title}.notepdf`,
      );
      setStatus("Saved");
    } catch {
      setStatus("Export failed");
    } finally {
      setIsBusy(false);
    }
  };

  const exportFlattened = async () => {
    if (!activeDocument) return;
    setIsBusy(true);
    setStatus(`Flattening annotations at ${annotationExportScale}×…`);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(await getPdfBytes());
      const { exportToBlob, exportToSvg, getCommonBounds } = await import(
        "@excalidraw/excalidraw"
      );
      const scenesByPage = new Map(
        Object.values(annotations).map((annotation) => [
          annotation.pageNumber,
          annotation.scene,
        ]),
      );
      const draftPrefix = `${activeDocument.id}:`;
      for (const [key, draftScene] of draftScenesRef.current) {
        if (!key.startsWith(draftPrefix)) continue;
        const draftPageNumber = Number(key.slice(draftPrefix.length));
        if (Number.isSafeInteger(draftPageNumber)) {
          scenesByPage.set(draftPageNumber, draftScene);
        }
      }
      const isAppleMobile =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      const isConstrainedMobile =
        isAppleMobile || /Android|Mobile/.test(navigator.userAgent);
      const tileSize = isConstrainedMobile
        ? PDF_EXPORT_MOBILE_TILE_SIZE_PX
        : PDF_EXPORT_DESKTOP_TILE_SIZE_PX;
      const singleCanvasMaxDimension = isConstrainedMobile
        ? PDF_EXPORT_MOBILE_CANVAS_MAX_DIMENSION_PX
        : PDF_EXPORT_DESKTOP_CANVAS_MAX_DIMENSION_PX;
      const singleCanvasMaxArea = isConstrainedMobile
        ? PDF_EXPORT_MOBILE_CANVAS_MAX_AREA_PX
        : PDF_EXPORT_DESKTOP_CANVAS_MAX_AREA_PX;
      for (const [annotationPageNumber, annotationScene] of scenesByPage) {
        const scene = parseScene(annotationScene);
        const elements =
          scene?.elements.filter((element) => !element.isDeleted) ?? [];
        if (!scene || elements.length === 0) continue;
        const [x1, y1, x2, y2] = getCommonBounds(elements);
        if (x2 <= x1 || y2 <= y1) continue;
        const page = pdf.getPage(annotationPageNumber - 1);
        const zoom = Math.max(0.01, scene.appState.zoom?.value ?? 1);
        const placement = getPdfAnnotationPlacement({
          bounds: [
            x1 - EXPORT_PADDING_PX,
            y1 - EXPORT_PADDING_PX,
            x2 + EXPORT_PADDING_PX,
            y2 + EXPORT_PADDING_PX,
          ],
          scrollX: scene.appState.scrollX,
          scrollY: scene.appState.scrollY,
          zoom,
          pageHeight: page.getHeight(),
        });
        const exportAppState = {
          viewBackgroundColor: "transparent",
          exportBackground: false,
          exportWithDarkMode: false,
        };
        const estimatedWidth = x2 - x1 + EXPORT_PADDING_PX * 2;
        const estimatedHeight = y2 - y1 + EXPORT_PADDING_PX * 2;
        const estimatedPixelWidth = Math.ceil(
          estimatedWidth * annotationExportScale,
        );
        const estimatedPixelHeight = Math.ceil(
          estimatedHeight * annotationExportScale,
        );
        const canUseSingleCanvas =
          annotationExportScale === 1 ||
          (estimatedPixelWidth <= singleCanvasMaxDimension &&
            estimatedPixelHeight <= singleCanvasMaxDimension &&
            estimatedPixelWidth * estimatedPixelHeight <= singleCanvasMaxArea);

        if (canUseSingleCanvas) {
          try {
            const overlay = await exportToBlob({
              elements,
              files: scene.files,
              appState: exportAppState,
              mimeType: "image/png",
              exportPadding: EXPORT_PADDING_PX,
              ...(annotationExportScale === 1
                ? {}
                : {
                    getDimensions: (width: number, height: number) => ({
                      width: Math.ceil(width * annotationExportScale),
                      height: Math.ceil(height * annotationExportScale),
                      scale: annotationExportScale,
                    }),
                  }),
            });
            const image = await pdf.embedPng(await overlay.arrayBuffer());
            page.drawImage(image, placement);
            continue;
          } catch (error) {
            if (annotationExportScale === 1) throw error;
            console.warn(
              "Single-canvas annotation export failed; using tiled export",
              error,
            );
          }
        }

        const svg = await exportToSvg({
          elements,
          files: scene.files,
          appState: exportAppState,
          exportPadding: EXPORT_PADDING_PX,
          skipInliningFonts: true,
        });
        const sourceViewBox = svg.viewBox.baseVal;
        const sceneWidth =
          sourceViewBox.width || x2 - x1 + EXPORT_PADDING_PX * 2;
        const sceneHeight =
          sourceViewBox.height || y2 - y1 + EXPORT_PADDING_PX * 2;
        const pixelWidth = Math.ceil(sceneWidth * annotationExportScale);
        const pixelHeight = Math.ceil(sceneHeight * annotationExportScale);
        for (let tileTop = 0; tileTop < pixelHeight; tileTop += tileSize) {
          for (let tileLeft = 0; tileLeft < pixelWidth; tileLeft += tileSize) {
            const tileWidth = Math.min(tileSize, pixelWidth - tileLeft);
            const tileHeight = Math.min(tileSize, pixelHeight - tileTop);
            const tileSvg = svg.cloneNode(true) as SVGSVGElement;
            tileSvg.setAttribute(
              "viewBox",
              `${sourceViewBox.x + tileLeft / annotationExportScale} ${
                sourceViewBox.y + tileTop / annotationExportScale
              } ${tileWidth / annotationExportScale} ${
                tileHeight / annotationExportScale
              }`,
            );
            tileSvg.setAttribute("width", String(tileWidth));
            tileSvg.setAttribute("height", String(tileHeight));
            const { image: tileSvgImage, url: tileSvgUrl } =
              await loadSvgImage(tileSvg);
            const canvas = document.createElement("canvas");
            canvas.width = tileWidth;
            canvas.height = tileHeight;
            const context = canvas.getContext("2d");
            if (!context)
              throw new Error("The browser could not create an export canvas");
            try {
              context.drawImage(tileSvgImage, 0, 0, tileWidth, tileHeight);
            } finally {
              URL.revokeObjectURL(tileSvgUrl);
            }
            const tileBlob = await canvasToPngBlob(canvas);
            const tileImage = await pdf.embedPng(await tileBlob.arrayBuffer());
            const pdfTileWidth = placement.width * (tileWidth / pixelWidth);
            const pdfTileHeight = placement.height * (tileHeight / pixelHeight);
            page.drawImage(tileImage, {
              x: placement.x + placement.width * (tileLeft / pixelWidth),
              y:
                placement.y +
                placement.height * (1 - (tileTop + tileHeight) / pixelHeight),
              width: pdfTileWidth,
              height: pdfTileHeight,
            });
            canvas.width = 0;
            canvas.height = 0;
          }
        }
      }
      const result = await pdf.save();
      downloadBlob(
        new Blob([result as BlobPart], { type: "application/pdf" }),
        `${activeDocument.title}-annotated.pdf`,
      );
      setStatus("Saved");
    } catch (error) {
      console.error("Annotated PDF export failed", error);
      setStatus(
        `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsBusy(false);
    }
  };

  const importEditable = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsBusy(true);
    try {
      const { strFromU8, unzipSync } = await import("fflate");
      const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const project = JSON.parse(
        strFromU8(archive["project.json"]),
      ) as EditableProject;
      if (
        project.format !== "note-taking-app-pdf-project" ||
        project.version !== 1 ||
        !archive["document.pdf"] ||
        !Array.isArray(project.annotations)
      ) {
        throw new Error("Invalid editable PDF project");
      }
      await importPdf(
        new File(
          [archive["document.pdf"] as BlobPart],
          project.originalFilename,
          {
            type: "application/pdf",
          },
        ),
        project.annotations,
        project.title,
      );
      setStatus("Saved");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not import project",
      );
      setStatus("Import failed");
    } finally {
      setIsBusy(false);
    }
  };

  const renameActive = async () => {
    if (!activeDocument) return;
    const title = window.prompt("PDF title", activeDocument.title)?.trim();
    if (!title || title === activeDocument.title) return;
    if (isCloud) await renameRemotePdfDocument(activeDocument.id, title);
    else await renameGuestPdfDocument(activeDocument.id, title);
    await reloadDocuments();
  };

  const deleteActive = async () => {
    if (!activeDocument || !window.confirm(`Delete “${activeDocument.title}”?`))
      return;
    if (isCloud) await deleteRemotePdfDocument(activeDocument.id);
    else await deleteGuestPdfDocument(activeDocument.id);
    await reloadDocuments();
  };

  const documentControls = activeDocument ? (
    <>
      <strong className="mr-auto max-w-72 truncate">
        {activeDocument.title}
      </strong>
      <button
        type="button"
        className={`rounded border px-2 py-1 text-xs ${zoomMode === "fit-width" ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-300"}`}
        onClick={() => setZoomMode("fit-width")}
      >
        Fit width
      </button>
      <div className="flex items-center rounded border border-slate-300">
        <button
          type="button"
          className="px-2 py-1 text-sm hover:bg-slate-100"
          onClick={() => changePdfZoom(-0.1)}
          aria-label="Zoom out"
        >
          &minus;
        </button>
        {isEditingZoom ? (
          <label className="flex items-center border-x border-slate-300 bg-white px-1 text-xs">
            <span className="sr-only">Custom zoom percentage</span>
            <input
              ref={zoomInputRef}
              type="number"
              inputMode="decimal"
              min={MIN_PDF_ZOOM * 100}
              max={maxPdfZoom * 100}
              step="1"
              value={zoomInput}
              onChange={(event) => setZoomInput(event.target.value)}
              onBlur={commitZoomInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setIsEditingZoom(false);
              }}
              onWheel={(event) => event.currentTarget.blur()}
              className="w-12 bg-transparent py-1 text-right outline-none"
            />
            <span>%</span>
          </label>
        ) : (
          <button
            type="button"
            className="min-w-14 border-x border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
            onClick={startEditingZoom}
            title="Enter a custom zoom percentage"
          >
            {Math.round(effectivePdfZoom * 100)}%
          </button>
        )}
        <button
          type="button"
          className="px-2 py-1 text-sm hover:bg-slate-100"
          onClick={() => changePdfZoom(0.1)}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        onClick={() => realignAnnotationCanvases()}
        title="Reset annotation canvas alignment"
      >
        Realign
      </button>
      <button
        type="button"
        className="rounded border px-2 py-1 text-sm"
        onClick={() =>
          setViewMode((current) =>
            current === "single" ? "continuous" : "single",
          )
        }
      >
        {viewMode === "single" ? "Continuous scroll" : "Single page"}
      </button>
      <button
        type="button"
        className="rounded border px-2 py-1 text-sm"
        aria-expanded={areThumbnailsOpen}
        onClick={() => setAreThumbnailsOpen((current) => !current)}
      >
        {areThumbnailsOpen ? "Hide pages" : "Show pages"}
      </button>
      <button
        type="button"
        className="rounded border px-2 py-1 text-sm"
        onClick={toggleFullscreen}
      >
        {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      </button>
      <button
        type="button"
        className="rounded border px-2 py-1 text-sm"
        onClick={renameActive}
      >
        Rename
      </button>
      <button
        type="button"
        disabled={isBusy}
        className="rounded border px-2 py-1 text-sm"
        onClick={exportEditable}
      >
        Editable project
      </button>
      <div className="flex items-stretch">
        <button
          type="button"
          disabled={isBusy}
          className="rounded-l border px-2 py-1 text-sm"
          onClick={exportFlattened}
        >
          Annotated PDF
        </button>
        <label
          className="flex items-center rounded-r border border-l-0 bg-white text-xs"
          title="Higher quality produces sharper annotations but uses more memory and creates a larger PDF. 8×–16× may exceed mobile browser limits for large drawings."
        >
          <span className="sr-only">Annotated PDF export quality</span>
          <select
            value={annotationExportScale}
            disabled={isBusy}
            className="bg-transparent px-1 py-1.5 outline-none disabled:opacity-50"
            onChange={(event) =>
              setAnnotationExportScale(
                Number(event.target.value) as PdfAnnotationExportScale,
              )
            }
            aria-label="Annotated PDF export quality"
          >
            {PDF_ANNOTATION_EXPORT_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {scale}×
                {scale === 3
                  ? " (recommended)"
                  : scale >= 8
                    ? " (high memory)"
                    : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="rounded border border-red-200 px-2 py-1 text-sm text-red-700"
        onClick={deleteActive}
      >
        Delete
      </button>
    </>
  ) : null;

  return (
    <main
      ref={observePdfEditorRoot}
      className="fixed inset-0 flex min-h-0 w-full flex-col overflow-hidden overscroll-none bg-slate-100 text-slate-900"
      style={{ touchAction: "pan-x pan-y" }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={handlePdfInput}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".notepdf,application/zip"
        hidden
        onChange={importEditable}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleImageInput}
      />
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Link href="/" className="rounded px-2 py-1 text-sm hover:bg-slate-100">
          ← Notebooks
        </Link>
        <h1 className="mr-auto font-semibold">PDF Editor</h1>
        <span className="text-xs text-slate-500">
          {isCloud ? "Cloud" : "Stored on this device"} · {status}
        </span>
        <button
          type="button"
          disabled={isBusy || !isLoaded}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
        >
          Import PDF
        </button>
        <button
          type="button"
          disabled={isBusy}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          onClick={() => projectInputRef.current?.click()}
        >
          Open project
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          onClick={() => setIsSettingsOpen(true)}
        >
          Settings
        </button>
        {isSignedIn && <UserButton />}
        {documentControls && !isFullscreen && (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
            {documentControls}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="min-h-0 w-full shrink-0 overflow-hidden border-b border-slate-200 bg-white p-3 md:w-64 md:border-r md:border-b-0">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            PDF documents
          </h2>
          <div className="max-h-40 space-y-1 overflow-auto md:h-[calc(100%_-_2rem)] md:max-h-none">
            {documents.map((document) => (
              <button
                key={document.id}
                type="button"
                onClick={() => setActiveId(document.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${document.id === activeId ? "bg-sky-600 text-white" : "hover:bg-slate-100"}`}
              >
                <span className="block truncate font-medium">
                  {document.title}
                </span>
                <span className="block text-xs opacity-70">
                  {document.pageCount} pages · {formatBytes(document.sizeBytes)}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {!activeDocument || !pdfSource ? (
          <section className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
            <div>
              <p className="font-medium">Import a PDF to start annotating.</p>
              <p className="mt-1 text-sm">
                Drawings remain editable and can also be flattened into a
                shareable PDF.
              </p>
            </div>
          </section>
        ) : (
          <div
            className={`pdf-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-100 ${
              isFullscreen ? "fixed inset-0 z-50" : "h-full"
            }`}
          >
            {isFullscreen && documentControls && (
              <div className="z-30 flex w-full shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
                {documentControls}
              </div>
            )}
            <Document
              className="flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row"
              file={pdfSource}
              loading={<div className="p-8">Loading PDF…</div>}
            >
              {areThumbnailsOpen && (
                <aside className="min-h-0 w-full shrink-0 overflow-auto border-b border-slate-200 bg-slate-50 p-2 md:w-40 md:border-r md:border-b-0">
                  <div className="flex gap-2 md:flex-col">
                    {Array.from(
                      { length: activeDocument.pageCount },
                      (_, index) => index + 1,
                    ).map((number) => (
                      <PdfThumbnail
                        key={number}
                        number={number}
                        isActive={number === pageNumber}
                        isAnnotated={Boolean(annotations[number])}
                        onSelect={() => {
                          setPageNumber(number);
                          if (viewMode === "continuous") {
                            requestAnimationFrame(() =>
                              document
                                .getElementById(`pdf-page-${number}`)
                                ?.scrollIntoView({
                                  behavior: "auto",
                                  block: "start",
                                }),
                            );
                          }
                        }}
                      />
                    ))}
                  </div>
                </aside>
              )}
              <div
                className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
                style={{
                  gridTemplateAreas:
                    annotationToolbarDock === "top"
                      ? '"toolbar" "viewer"'
                      : annotationToolbarDock === "bottom"
                        ? '"viewer" "toolbar"'
                        : annotationToolbarDock === "left"
                          ? '"toolbar viewer"'
                          : '"viewer toolbar"',
                  gridTemplateColumns:
                    annotationToolbarDock === "left" ||
                    annotationToolbarDock === "right"
                      ? annotationToolbarDock === "left"
                        ? "auto minmax(0, 1fr)"
                        : "minmax(0, 1fr) auto"
                      : "minmax(0, 1fr)",
                  gridTemplateRows:
                    annotationToolbarDock === "top" ||
                    annotationToolbarDock === "bottom"
                      ? annotationToolbarDock === "top"
                        ? "auto minmax(0, 1fr)"
                        : "minmax(0, 1fr) auto"
                      : "minmax(0, 1fr)",
                }}
              >
                <PdfAnnotationToolbar
                  state={annotationToolbar}
                  dock={annotationToolbarDock}
                  activePage={pageNumber}
                  isCompact={isAnnotationToolbarCompact}
                  onChange={changeAnnotationToolbar}
                  onCompactChange={setIsAnnotationToolbarCompact}
                  onDockChange={setAnnotationToolbarDock}
                  onInsertImage={() => imageInputRef.current?.click()}
                  onOpenImageLibrary={() => setIsImageLibraryOpen(true)}
                  onUndo={() => runActivePageHistory(false)}
                  onRedo={() => runActivePageHistory(true)}
                />
                <section
                  ref={observeViewer}
                  data-pdf-viewer
                  className="min-h-0 min-w-0 overscroll-contain overflow-auto p-4 [grid-area:viewer] [overflow-anchor:none]"
                  onScroll={(event) => {
                    viewerScrollRef.current = {
                      left: event.currentTarget.scrollLeft,
                      top: event.currentTarget.scrollTop,
                    };
                    scheduleContinuousActivePageUpdate();
                  }}
                  onPointerDownCapture={handlePdfPointerDownCapture}
                  onPointerMoveCapture={handlePdfPointerMoveCapture}
                  onPointerUpCapture={handlePdfPointerEndCapture}
                  onPointerCancelCapture={handlePdfPointerEndCapture}
                >
                  <div
                    ref={pagesRef}
                    data-pdf-pages
                    className={
                      viewMode === "continuous"
                        ? "touch-none space-y-6"
                        : "touch-none"
                    }
                  >
                    {(viewMode === "continuous"
                      ? Array.from(
                          { length: activeDocument.pageCount },
                          (_, index) => index + 1,
                        )
                      : [pageNumber]
                    ).map((number) => (
                      <PdfEditablePage
                        key={`${activeDocument.id}:${number}:${viewMode}`}
                        documentId={activeDocument.id}
                        pageNumber={number}
                        scene={
                          draftScenesRef.current.get(
                            `${activeDocument.id}:${number}`,
                          ) ?? annotations[number]?.scene
                        }
                        zoom={effectivePdfZoom}
                        lazy={viewMode === "continuous"}
                        getIntersectionRoot={getViewerElement}
                        toolbarState={annotationToolbar}
                        isTouchDrawingEnabled={settings.touchDrawingEnabled}
                        onPageSizeChange={(width) => {
                          pageWidthsRef.current.set(number, width);
                          if (number === pageNumber) setActivePageWidth(width);
                          scheduleContinuousActivePageUpdate();
                        }}
                        onActivate={() => {
                          setPageNumber((current) =>
                            current === number ? current : number,
                          );
                        }}
                        onDraftChange={(scene) => {
                          draftScenesRef.current.set(
                            `${activeDocument.id}:${number}`,
                            scene,
                          );
                        }}
                        onSave={(scene) => persistScene(number, scene)}
                        onToolbarStateChange={(state) => {
                          if (number === pageNumber) {
                            setAnnotationToolbar(state);
                          }
                        }}
                        onEditorReady={(editor) => {
                          if (editor) {
                            annotationEditorsRef.current.set(number, editor);
                          } else {
                            annotationEditorsRef.current.delete(number);
                          }
                        }}
                      />
                    ))}
                  </div>
                </section>
              </div>
            </Document>
          </div>
        )}
      </div>
      {isImageLibraryOpen && activeDocument && (
        <ImageLibraryDialog
          storageMode={isCloud ? "cloud" : "local"}
          notebooks={[]}
          selectedTextCellId={null}
          selectedExcalidrawCellId={null}
          selectedPdfPage={pageNumber}
          onInsertIntoPdf={(image) => void insertLibraryImage(image)}
          onClose={() => setIsImageLibraryOpen(false)}
        />
      )}
      {isSettingsOpen && (
        <SettingsDialog
          settings={settings}
          saveStatus={settingsSaveStatus}
          onChange={updateSettings}
          onClose={() => setIsSettingsOpen(false)}
          isLocalMode={!isCloud}
        />
      )}
    </main>
  );
}
