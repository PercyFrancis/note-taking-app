"use client";

import "@excalidraw/excalidraw/index.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { UserButton, useAuth } from "@clerk/nextjs";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
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
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  DEFAULT_PDF_ANNOTATION_TOOLBAR_STATE,
  PdfAnnotationToolbar,
  type PdfAnnotationToolbarState,
  type PdfToolbarDock,
} from "@/components/pdf/PdfAnnotationToolbar";
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
  DEFAULT_PDF_MAX_PAGES,
  DEFAULT_PDF_MAX_UPLOAD_BYTES,
  getGuestPdfLimits,
  getPdfAnnotationPlacement,
  type PdfAnnotationRecord,
  type PdfDocumentRecord,
  sanitizePdfFilename,
} from "@/lib/pdf";
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

const SAVE_DELAY_MS = 750;
const MULTIPART_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024;
const EXPORT_PADDING_PX = 8;
const ANNOTATION_TOOLBAR_GUTTER_PX = 32;
const MIN_PDF_ZOOM = 0.25;
const MAX_PDF_ZOOM = 3;

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
  viewerZoom: number,
  toolbarState: PdfAnnotationToolbarState,
): ExcalidrawInitialDataState {
  const canonicalZoom =
    scene?.appState.zoom ?? ({ value: 1 } as AppState["zoom"]);
  return {
    elements: scene?.elements ?? [],
    files: scene?.files ?? {},
    appState: {
      ...(scene?.appState ?? {}),
      zoom: {
        ...canonicalZoom,
        value: (canonicalZoom.value * viewerZoom) as AppState["zoom"]["value"],
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
    strokeWidth: ([1, 2, 4] as const).includes(
      appState.currentItemStrokeWidth as 1 | 2 | 4,
    )
      ? (appState.currentItemStrokeWidth as 1 | 2 | 4)
      : fallback.strokeWidth,
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
  onDraftChange: (scene: string) => void;
  onSave: (scene: string) => Promise<void>;
  onToolbarStateChange: (state: PdfAnnotationToolbarState) => void;
  onEditorReady: (
    api: ExcalidrawImperativeAPI | null,
    element: HTMLDivElement | null,
  ) => void;
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
  const pendingSaveRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const canonicalZoomRef = useRef<AppState["zoom"]>(
    parseScene(scene)?.appState.zoom ?? ({ value: 1 } as AppState["zoom"]),
  );
  const initialData = useMemo(
    () =>
      annotationInitialData(
        parseScene(latestRef.current || initialSceneRef.current),
        viewerZoom,
        toolbarStateRef.current,
      ),
    [viewerZoom],
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

  const handleExcalidrawApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    requestAnimationFrame(() => {
      if (apiRef.current !== api) return;
      applyPdfToolbarState(api, toolbarStateRef.current);
      onEditorReadyRef.current(api, layerRef.current);
    });
  }, []);

  const queueSave = useCallback((next: string) => {
    committedRef.current = next;
    pendingSaveRef.current = next;
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    void (async () => {
      try {
        while (pendingSaveRef.current !== null) {
          const pending = pendingSaveRef.current;
          pendingSaveRef.current = null;
          await onSaveRef.current(pending);
        }
      } finally {
        isSavingRef.current = false;
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      onEditorReadyRef.current(null, null);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (latestRef.current && latestRef.current !== committedRef.current) {
        queueSave(latestRef.current);
      }
    };
  }, [queueSave]);

  return (
    <div
      ref={layerRef}
      className="pdf-annotation-layer absolute inset-0 z-10"
      style={{ width, height }}
    >
      <Excalidraw
        key={`viewer-zoom-${viewerZoom}`}
        initialData={initialData}
        excalidrawAPI={handleExcalidrawApi}
        UIOptions={{
          tools: { image: false },
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            changeViewBackgroundColor: false,
          },
        }}
        onChange={(elements, appState, files) => {
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
          const next = JSON.stringify({
            version: 1,
            source: "pdf-annotation",
            elements,
            appState: {
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
              zoom: canonicalZoomRef.current,
            },
            files,
          } satisfies StoredPdfScene);
          if (next === latestRef.current) return;
          latestRef.current = next;
          onDraftChangeRef.current(next);
          if (timerRef.current) clearTimeout(timerRef.current);
          if (next === committedRef.current) return;
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            queueSave(next);
          }, SAVE_DELAY_MS);
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
  toolbarState,
  onPageSizeChange,
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
  toolbarState: PdfAnnotationToolbarState;
  onPageSizeChange?: (width: number, height: number) => void;
  onDraftChange: (scene: string) => void;
  onSave: (scene: string) => Promise<void>;
  onToolbarStateChange: (state: PdfAnnotationToolbarState) => void;
  onEditorReady: (
    api: ExcalidrawImperativeAPI | null,
    element: HTMLDivElement | null,
  ) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(!lazy);
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });

  useEffect(() => {
    if (!lazy || shouldRender) return;
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: "900px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy, shouldRender]);

  return (
    <div
      id={`pdf-page-${pageNumber}`}
      ref={containerRef}
      className="mx-auto"
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
  const [pdfSource, setPdfSource] = useState<string | Blob | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const zoomInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const draftScenesRef = useRef(new Map<string, string>());
  const workspaceRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const activeTouchPointersRef = useRef(
    new Map<number, { x: number; y: number }>(),
  );
  const pinchSessionRef = useRef<{
    active: boolean;
    initialDistance: number;
    initialZoom: number;
    targetZoom: number;
  } | null>(null);
  const suppressTouchUntilClearRef = useRef(false);
  const pendingPinchZoomRef = useRef<number | null>(null);
  const annotationEditorsRef = useRef(
    new Map<
      number,
      { api: ExcalidrawImperativeAPI; element: HTMLDivElement }
    >(),
  );
  const fullscreenReturnFocusRef = useRef<HTMLElement | null>(null);
  const viewerScrollRef = useRef({ left: 0, top: 0 });
  const wasWorkspaceFullscreenRef = useRef(false);
  const viewerResizeObserverRef = useRef<ResizeObserver | null>(null);
  const viewerWheelListenerRef = useRef<((event: WheelEvent) => void) | null>(
    null,
  );
  const viewerWheelHandlerRef = useRef<(event: WheelEvent) => void>(() => {});

  const activeDocument =
    documents.find((document) => document.id === activeId) ?? null;

  useEffect(() => {
    if (!isEditingZoom) return;
    zoomInputRef.current?.focus();
    zoomInputRef.current?.select();
  }, [isEditingZoom]);
  const fitWidthZoom = Math.min(
    MAX_PDF_ZOOM,
    Math.max(
      MIN_PDF_ZOOM,
      viewerWidth > 0 ? (viewerWidth - 32) / activePageWidth : 1,
    ),
  );
  const effectivePdfZoom = zoomMode === "fit-width" ? fitWidthZoom : pdfZoom;

  useLayoutEffect(() => {
    const pendingZoom = pendingPinchZoomRef.current;
    if (
      pendingZoom === null ||
      Math.abs(pendingZoom - effectivePdfZoom) > 0.001
    )
      return;
    pendingPinchZoomRef.current = null;
    if (pagesRef.current) {
      pagesRef.current.style.transform = "";
      pagesRef.current.style.transformOrigin = "";
      pagesRef.current.style.willChange = "";
    }
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
    viewerResizeObserverRef.current = null;
    viewerWheelListenerRef.current = null;
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
  }, []);

  useEffect(() => {
    const updateFullscreenState = () => {
      const nextIsFullscreen =
        document.fullscreenElement === workspaceRef.current;
      const wasFullscreen = wasWorkspaceFullscreenRef.current;
      wasWorkspaceFullscreenRef.current = nextIsFullscreen;
      setIsFullscreen(nextIsFullscreen);

      requestAnimationFrame(() => {
        viewerRef.current?.scrollTo(viewerScrollRef.current);
        if (wasFullscreen && !nextIsFullscreen) {
          fullscreenReturnFocusRef.current?.focus({ preventScroll: true });
          fullscreenReturnFocusRef.current = null;
        }
      });
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    try {
      if (document.fullscreenElement === workspace) {
        await document.exitFullscreen();
      } else {
        fullscreenReturnFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        viewerScrollRef.current = {
          left: viewerRef.current?.scrollLeft ?? 0,
          top: viewerRef.current?.scrollTop ?? 0,
        };
        await workspace.requestFullscreen();
      }
    } catch {
      setStatus("Fullscreen is unavailable in this browser");
    }
  };

  const changePdfZoom = (change: number) => {
    setZoomMode("custom");
    setPdfZoom(
      Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, effectivePdfZoom + change)),
    );
  };

  const stopExcalidrawTouchGesture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  };

  const handlePdfPointerDownCapture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      event.pointerType !== "touch" ||
      !pagesRef.current?.contains(event.target as Node)
    )
      return;

    activeTouchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (activeTouchPointersRef.current.size < 2) return;
    if (suppressTouchUntilClearRef.current) {
      stopExcalidrawTouchGesture(event);
      return;
    }

    const [first, second] = Array.from(activeTouchPointersRef.current.values());
    const initialDistance = Math.max(
      1,
      Math.hypot(second.x - first.x, second.y - first.y),
    );

    pinchSessionRef.current = {
      active: true,
      initialDistance,
      initialZoom: effectivePdfZoom,
      targetZoom: effectivePdfZoom,
    };
    suppressTouchUntilClearRef.current = true;

    const pagesBounds = pagesRef.current.getBoundingClientRect();
    pagesRef.current.style.transformOrigin = `${(first.x + second.x) / 2 - pagesBounds.left}px ${(first.y + second.y) / 2 - pagesBounds.top}px`;
    pagesRef.current.style.willChange = "transform";
    stopExcalidrawTouchGesture(event);
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
    if (!suppressTouchUntilClearRef.current) return;
    stopExcalidrawTouchGesture(event);

    const session = pinchSessionRef.current;
    if (!session?.active || activeTouchPointersRef.current.size < 2) return;
    const [first, second] = Array.from(activeTouchPointersRef.current.values());
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    session.targetZoom = Math.min(
      MAX_PDF_ZOOM,
      Math.max(
        MIN_PDF_ZOOM,
        session.initialZoom * (distance / session.initialDistance),
      ),
    );
    if (pagesRef.current) {
      pagesRef.current.style.transform = `scale(${session.targetZoom / session.initialZoom})`;
    }
  };

  const handlePdfPointerEndCapture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      event.pointerType !== "touch" ||
      !activeTouchPointersRef.current.has(event.pointerId)
    )
      return;

    activeTouchPointersRef.current.delete(event.pointerId);
    const session = pinchSessionRef.current;
    if (session?.active && activeTouchPointersRef.current.size < 2) {
      session.active = false;
      if (Math.abs(session.targetZoom - session.initialZoom) > 0.001) {
        pendingPinchZoomRef.current = session.targetZoom;
        setZoomMode("custom");
        setPdfZoom(session.targetZoom);
      } else if (pagesRef.current) {
        pagesRef.current.style.transform = "";
        pagesRef.current.style.transformOrigin = "";
        pagesRef.current.style.willChange = "";
      }
    }

    if (activeTouchPointersRef.current.size === 0) {
      suppressTouchUntilClearRef.current = false;
      pinchSessionRef.current = null;
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
      setPdfZoom(
        Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, percentage / 100)),
      );
      setZoomMode("custom");
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
    setStatus("Flattening annotations…");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(await getPdfBytes());
      const { exportToBlob, getCommonBounds } = await import(
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
      for (const [annotationPageNumber, annotationScene] of scenesByPage) {
        const scene = parseScene(annotationScene);
        const elements =
          scene?.elements.filter((element) => !element.isDeleted) ?? [];
        if (!scene || elements.length === 0) continue;
        const [x1, y1, x2, y2] = getCommonBounds(elements);
        if (x2 <= x1 || y2 <= y1) continue;
        const overlay = await exportToBlob({
          elements,
          files: scene.files,
          appState: {
            viewBackgroundColor: "transparent",
            exportBackground: false,
            exportWithDarkMode: false,
            exportScale: 1,
          },
          mimeType: "image/png",
          quality: 1,
          exportPadding: EXPORT_PADDING_PX,
        });
        const image = await pdf.embedPng(await overlay.arrayBuffer());
        const page = pdf.getPage(annotationPageNumber - 1);
        const zoom = Math.max(0.01, scene.appState.zoom?.value ?? 1);
        page.drawImage(
          image,
          getPdfAnnotationPlacement({
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
          }),
        );
      }
      const result = await pdf.save();
      downloadBlob(
        new Blob([result as BlobPart], { type: "application/pdf" }),
        `${activeDocument.title}-annotated.pdf`,
      );
      setStatus("Saved");
    } catch {
      setStatus("Export failed");
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

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-900">
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
        {isSignedIn && <UserButton />}
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
            ref={workspaceRef}
            className="pdf-workspace flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-100"
          >
            <Document
              className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row"
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
                                  behavior: "smooth",
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
                className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${
                  annotationToolbarDock === "top" ||
                  annotationToolbarDock === "bottom"
                    ? "flex-col"
                    : "flex-row"
                }`}
              >
                {(annotationToolbarDock === "top" ||
                  annotationToolbarDock === "left") && (
                  <PdfAnnotationToolbar
                    state={annotationToolbar}
                    dock={annotationToolbarDock}
                    activePage={pageNumber}
                    onChange={changeAnnotationToolbar}
                    onDockChange={setAnnotationToolbarDock}
                    onUndo={() => runActivePageHistory(false)}
                    onRedo={() => runActivePageHistory(true)}
                  />
                )}
                <section
                  ref={observeViewer}
                  className="min-h-0 min-w-0 flex-1 overscroll-contain overflow-auto p-4"
                  onScroll={(event) => {
                    viewerScrollRef.current = {
                      left: event.currentTarget.scrollLeft,
                      top: event.currentTarget.scrollTop,
                    };
                  }}
                  onPointerDownCapture={handlePdfPointerDownCapture}
                  onPointerMoveCapture={handlePdfPointerMoveCapture}
                  onPointerUpCapture={handlePdfPointerEndCapture}
                  onPointerCancelCapture={handlePdfPointerEndCapture}
                >
                  <div className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                    <strong className="mr-auto truncate">
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
                        −
                      </button>
                      {isEditingZoom ? (
                        <label className="flex items-center border-x border-slate-300 bg-white px-1 text-xs">
                          <span className="sr-only">
                            Custom zoom percentage
                          </span>
                          <input
                            ref={zoomInputRef}
                            type="number"
                            inputMode="decimal"
                            min={MIN_PDF_ZOOM * 100}
                            max={MAX_PDF_ZOOM * 100}
                            step="1"
                            value={zoomInput}
                            onChange={(event) =>
                              setZoomInput(event.target.value)
                            }
                            onBlur={commitZoomInput}
                            onKeyDown={(event) => {
                              if (event.key === "Enter")
                                event.currentTarget.blur();
                              if (event.key === "Escape") {
                                setIsEditingZoom(false);
                              }
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
                      className="rounded border px-2 py-1 text-sm"
                      onClick={() =>
                        setViewMode((current) =>
                          current === "single" ? "continuous" : "single",
                        )
                      }
                    >
                      {viewMode === "single"
                        ? "Continuous scroll"
                        : "Single page"}
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-sm"
                      aria-expanded={areThumbnailsOpen}
                      onClick={() =>
                        setAreThumbnailsOpen((current) => !current)
                      }
                    >
                      {areThumbnailsOpen ? "Hide pages" : "Show pages"}
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-sm"
                      onClick={() => void toggleFullscreen()}
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
                    <button
                      type="button"
                      disabled={isBusy}
                      className="rounded border px-2 py-1 text-sm"
                      onClick={exportFlattened}
                    >
                      Annotated PDF
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-1 text-sm text-red-700"
                      onClick={deleteActive}
                    >
                      Delete
                    </button>
                  </div>
                  <div
                    ref={pagesRef}
                    className={viewMode === "continuous" ? "space-y-6" : ""}
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
                        scene={annotations[number]?.scene}
                        zoom={effectivePdfZoom}
                        lazy={viewMode === "continuous"}
                        toolbarState={annotationToolbar}
                        onPageSizeChange={(width) => {
                          if (number === pageNumber) setActivePageWidth(width);
                        }}
                        onDraftChange={(scene) => {
                          draftScenesRef.current.set(
                            `${activeDocument.id}:${number}`,
                            scene,
                          );
                        }}
                        onSave={(scene) => persistScene(number, scene)}
                        onToolbarStateChange={setAnnotationToolbar}
                        onEditorReady={(api, element) => {
                          if (api && element) {
                            annotationEditorsRef.current.set(number, {
                              api,
                              element,
                            });
                          } else {
                            annotationEditorsRef.current.delete(number);
                          }
                        }}
                      />
                    ))}
                  </div>
                </section>
                {(annotationToolbarDock === "bottom" ||
                  annotationToolbarDock === "right") && (
                  <PdfAnnotationToolbar
                    state={annotationToolbar}
                    dock={annotationToolbarDock}
                    activePage={pageNumber}
                    onChange={changeAnnotationToolbar}
                    onDockChange={setAnnotationToolbarDock}
                    onUndo={() => runActivePageHistory(false)}
                    onRedo={() => runActivePageHistory(true)}
                  />
                )}
              </div>
            </Document>
          </div>
        )}
      </div>
    </main>
  );
}
