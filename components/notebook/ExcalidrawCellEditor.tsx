"use client";

import "@excalidraw/excalidraw/index.css";
import { useAuth } from "@clerk/nextjs";
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
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import { upload } from "@vercel/blob/client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPrivateImageUrl,
  isAllowedImageContentType,
  MAX_IMAGE_SIZE_BYTES,
  sanitizeImageFilename,
} from "@/lib/attachments";
import { saveGuestImage } from "@/lib/client/guest-storage";
import type {
  ExcalidrawCell,
  ExcalidrawImageInsertionRequest,
  ExcalidrawSceneFlush,
} from "@/lib/types";
import { createId } from "@/lib/utils";
import { secondaryButtonClass } from "../ui/buttonStyles";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((module) => module.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading drawing editor...
      </div>
    ),
  },
);

interface StoredExcalidrawScene {
  version: 1;
  source: "excalidraw";
  elements: readonly OrderedExcalidrawElement[];
  appState: Pick<
    AppState,
    | "gridModeEnabled"
    | "gridSize"
    | "gridStep"
    | "scrollX"
    | "scrollY"
    | "viewBackgroundColor"
    | "zoom"
  >;
  files: BinaryFiles;
}

interface PendingSceneSnapshot {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}

interface ExcalidrawCellEditorProps {
  cell: ExcalidrawCell;
  isDarkMode: boolean;
  imageInsertion: ExcalidrawImageInsertionRequest | null;
  flushRef: { current: ExcalidrawSceneFlush | null };
  onChange: (drawing: string) => void;
  onImageInsertionHandled: (requestId: number) => void;
  storageMode: "cloud" | "local";
}

const CONTENT_SAVE_DELAY_MS = 200;
const VIEW_SAVE_DELAY_MS = 650;
const MAX_SAVE_WAIT_MS = 2000;

const EXCALIDRAW_UI_OPTIONS = {
  tools: { image: true },
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
  },
} satisfies ExcalidrawProps["UIOptions"];

const IMAGE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const IMAGE_CONTENT_TYPE_BY_EXTENSION: Record<
  string,
  BinaryFileData["mimeType"]
> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function getImageContentType(filename: string): BinaryFileData["mimeType"] {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_CONTENT_TYPE_BY_EXTENSION[extension] ?? "image/png";
}

function loadImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });
    };
    image.onerror = () =>
      reject(new Error("Could not load the library image."));
    image.src = url;
  });
}

function createContentRevisionKey(
  elements: readonly OrderedExcalidrawElement[],
  files: BinaryFiles,
): string {
  const elementKey = elements
    .map(
      (element) =>
        `${element.id}:${element.version}:${element.versionNonce}:${element.isDeleted ? 1 : 0}`,
    )
    .join("|");
  const fileKey = Object.values(files)
    .map(
      (file) =>
        `${file.id}:${file.version ?? 0}:${file.dataURL.length}:${file.dataURL.slice(-24)}`,
    )
    .sort()
    .join("|");

  return `${elementKey}#${fileKey}`;
}

function createViewRevisionKey(appState: AppState): string {
  return [
    appState.scrollX.toFixed(2),
    appState.scrollY.toFixed(2),
    appState.zoom.value.toFixed(4),
    appState.gridModeEnabled ? "1" : "0",
    appState.gridSize ?? "none",
    appState.gridStep,
    appState.viewBackgroundColor,
  ].join(":");
}

function parseScene(drawing: string | null): ExcalidrawInitialDataState | null {
  if (!drawing) return null;

  try {
    const scene = JSON.parse(drawing) as Partial<StoredExcalidrawScene>;

    if (
      scene.version !== 1 ||
      scene.source !== "excalidraw" ||
      !Array.isArray(scene.elements)
    ) {
      return null;
    }

    return {
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files ?? {},
    };
  } catch {
    return null;
  }
}

export default function ExcalidrawCellEditor({
  cell,
  isDarkMode,
  imageInsertion,
  flushRef,
  onChange,
  onImageInsertionHandled,
  storageMode,
}: ExcalidrawCellEditorProps) {
  const { userId } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [excalidrawApi, setExcalidrawApi] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [initialData] = useState(() => parseScene(cell.drawing));
  const onChangeRef = useRef(onChange);
  const userIdRef = useRef(userId);
  const isMountedRef = useRef(true);
  const lastSerializedSceneRef = useRef(cell.drawing);
  const sceneRevisionRef = useRef(0);
  const pendingUploadCountRef = useRef(0);
  const handledImageInsertionRequestIdRef = useRef<number | null>(null);
  const insertingImageRequestIdRef = useRef<number | null>(null);
  const hostedFilePromisesRef = useRef(
    new Map<string, Promise<BinaryFileData>>(),
  );
  const latestSceneSnapshotRef = useRef<PendingSceneSnapshot | null>(null);
  const activeSceneCommitRef = useRef<Promise<string | null> | null>(null);
  const lastContentRevisionKeyRef = useRef<string | null>(null);
  const lastViewRevisionKeyRef = useRef<string | null>(null);
  const contentSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const viewSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maximumSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const flushLatestSceneRef = useRef<ExcalidrawSceneFlush | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    lastSerializedSceneRef.current = cell.drawing;
  }, [cell.drawing]);

  useEffect(() => {
    if (!isFullscreen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        flushLatestSceneRef.current?.();
        setIsFullscreen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [isFullscreen]);

  useEffect(() => {
    if (
      !excalidrawApi ||
      !imageInsertion ||
      imageInsertion.cellId !== cell.id ||
      handledImageInsertionRequestIdRef.current === imageInsertion.requestId ||
      insertingImageRequestIdRef.current === imageInsertion.requestId
    ) {
      return;
    }

    insertingImageRequestIdRef.current = imageInsertion.requestId;
    let isCancelled = false;

    void Promise.all([
      loadImageDimensions(imageInsertion.image.url),
      import("@excalidraw/excalidraw"),
    ])
      .then(([{ width: naturalWidth, height: naturalHeight }, excalidraw]) => {
        if (isCancelled) return;

        const maximumWidth = 520;
        const maximumHeight = 360;
        const scale = Math.min(
          1,
          maximumWidth / naturalWidth,
          maximumHeight / naturalHeight,
        );
        const width = Math.max(1, naturalWidth * scale);
        const height = Math.max(1, naturalHeight * scale);
        const appState = excalidrawApi.getAppState();
        const zoom = appState.zoom.value;
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

        excalidrawApi.addFiles([
          {
            id: fileId,
            mimeType: getImageContentType(
              imageInsertion.image.originalFilename,
            ),
            dataURL: imageInsertion.image.url as DataURL,
            created: imageInsertion.image.uploadedAt,
            lastRetrieved: Date.now(),
          },
        ]);
        excalidrawApi.updateScene({
          elements: [
            ...excalidrawApi.getSceneElementsIncludingDeleted(),
            imageElement,
          ],
          appState: {
            selectedElementIds: { [imageElement.id]: true },
          },
          captureUpdate: excalidraw.CaptureUpdateAction.IMMEDIATELY,
        });
        handledImageInsertionRequestIdRef.current = imageInsertion.requestId;
        insertingImageRequestIdRef.current = null;
        setImageUploadError("");
        onImageInsertionHandled(imageInsertion.requestId);
      })
      .catch((error: unknown) => {
        if (isCancelled) return;

        setImageUploadError(
          error instanceof Error
            ? error.message
            : "Could not insert the library image.",
        );
        insertingImageRequestIdRef.current = null;
        onImageInsertionHandled(imageInsertion.requestId);
      });

    return () => {
      isCancelled = true;
      if (insertingImageRequestIdRef.current === imageInsertion.requestId) {
        insertingImageRequestIdRef.current = null;
      }
      onImageInsertionHandled(imageInsertion.requestId);
    };
  }, [cell.id, excalidrawApi, imageInsertion, onImageInsertionHandled]);

  const getHostedFile = useCallback(
    (file: BinaryFileData): Promise<BinaryFileData> => {
      if (!file.dataURL.startsWith("data:")) {
        return Promise.resolve(file);
      }

      const cacheKey = `${file.id}:${file.version ?? 0}:${file.dataURL.length}:${file.dataURL.slice(-32)}`;
      const existingPromise = hostedFilePromisesRef.current.get(cacheKey);

      if (existingPromise) {
        return existingPromise;
      }

      pendingUploadCountRef.current += 1;
      setIsUploadingImage(true);
      setImageUploadError("");

      const uploadPromise = (async () => {
        const currentUserId = userIdRef.current;

        if (storageMode === "cloud" && !currentUserId) {
          throw new Error("Sign in before adding an image.");
        }

        if (!isAllowedImageContentType(file.mimeType)) {
          throw new Error("Paste a JPEG, PNG, WebP, or GIF image.");
        }

        const imageBlob = await fetch(file.dataURL).then((response) =>
          response.blob(),
        );

        if (imageBlob.size > MAX_IMAGE_SIZE_BYTES) {
          throw new Error("Images must be 10 MB or smaller.");
        }

        const extension = IMAGE_EXTENSION_BY_CONTENT_TYPE[file.mimeType];
        const filename = sanitizeImageFilename(
          `pasted-image-${file.created}.${extension}`,
        );
        if (storageMode === "local") {
          await saveGuestImage(imageBlob, filename, cell.id, String(file.id));
          return file;
        }

        const blob = await upload(
          `users/${currentUserId}/images/${cell.id}/${filename}`,
          imageBlob,
          {
            access: "private",
            handleUploadUrl: "/api/attachments/upload",
            clientPayload: JSON.stringify({ cellId: cell.id }),
          },
        );

        return {
          ...file,
          dataURL: createPrivateImageUrl(blob.pathname) as DataURL,
          lastRetrieved: Date.now(),
        };
      })()
        .catch((error: unknown) => {
          hostedFilePromisesRef.current.delete(cacheKey);
          throw error;
        })
        .finally(() => {
          pendingUploadCountRef.current -= 1;

          if (isMountedRef.current && pendingUploadCountRef.current === 0) {
            setIsUploadingImage(false);
          }
        });

      hostedFilePromisesRef.current.set(cacheKey, uploadPromise);
      return uploadPromise;
    },
    [cell.id, storageMode],
  );

  const clearSaveTimers = useCallback(() => {
    if (contentSaveTimerRef.current) {
      clearTimeout(contentSaveTimerRef.current);
      contentSaveTimerRef.current = null;
    }

    if (viewSaveTimerRef.current) {
      clearTimeout(viewSaveTimerRef.current);
      viewSaveTimerRef.current = null;
    }

    if (maximumSaveTimerRef.current) {
      clearTimeout(maximumSaveTimerRef.current);
      maximumSaveTimerRef.current = null;
    }
  }, []);

  const commitScene = useCallback(
    async ({
      elements,
      appState,
      files,
    }: PendingSceneSnapshot): Promise<string | null> => {
      const revision = sceneRevisionRef.current + 1;
      sceneRevisionRef.current = revision;

      const persistHostedScene = (hostedFiles: BinaryFiles): string => {
        const scene: StoredExcalidrawScene = {
          version: 1,
          source: "excalidraw",
          elements,
          appState: {
            gridModeEnabled: appState.gridModeEnabled,
            gridSize: appState.gridSize,
            gridStep: appState.gridStep,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            viewBackgroundColor: appState.viewBackgroundColor,
            zoom: appState.zoom,
          },
          files: hostedFiles,
        };
        const serializedScene = JSON.stringify(scene);

        if (serializedScene === lastSerializedSceneRef.current) {
          return serializedScene;
        }

        lastSerializedSceneRef.current = serializedScene;
        setImageUploadError("");
        onChangeRef.current(serializedScene);
        return serializedScene;
      };

      const fileEntries = Object.entries(files);
      const hasUnhostedImage = fileEntries.some(([, file]) =>
        file.dataURL.startsWith("data:"),
      );

      if (!hasUnhostedImage) {
        return persistHostedScene(files);
      }

      try {
        const hostedFileEntries = await Promise.all(
          fileEntries.map(
            async ([fileId, file]) =>
              [fileId, await getHostedFile(file)] as const,
          ),
        );
        if (!isMountedRef.current || sceneRevisionRef.current !== revision) {
          return lastSerializedSceneRef.current;
        }
        return persistHostedScene(
          Object.fromEntries(hostedFileEntries) as BinaryFiles,
        );
      } catch (error: unknown) {
        if (isMountedRef.current) {
          setImageUploadError(
            error instanceof Error
              ? error.message
              : "Could not upload the pasted image.",
          );
        }
        throw error;
      }
    },
    [getHostedFile],
  );

  const flushPendingScene = useCallback(async (): Promise<string | null> => {
    clearSaveTimers();
    let serializedScene = lastSerializedSceneRef.current;

    if (activeSceneCommitRef.current) {
      serializedScene = await activeSceneCommitRef.current;
    }

    while (latestSceneSnapshotRef.current) {
      const snapshot = latestSceneSnapshotRef.current;
      latestSceneSnapshotRef.current = null;
      const commitPromise = commitScene(snapshot);
      activeSceneCommitRef.current = commitPromise;
      try {
        serializedScene = await commitPromise;
      } finally {
        if (activeSceneCommitRef.current === commitPromise) {
          activeSceneCommitRef.current = null;
        }
      }
    }

    return serializedScene;
  }, [clearSaveTimers, commitScene]);

  const persistScene = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      latestSceneSnapshotRef.current = { elements, appState, files };

      const contentRevisionKey = createContentRevisionKey(elements, files);
      const viewRevisionKey = createViewRevisionKey(appState);
      const contentChanged =
        lastContentRevisionKeyRef.current !== contentRevisionKey;
      const viewChanged = lastViewRevisionKeyRef.current !== viewRevisionKey;

      lastContentRevisionKeyRef.current = contentRevisionKey;
      lastViewRevisionKeyRef.current = viewRevisionKey;

      if (!contentChanged && !viewChanged) return;

      if (contentChanged) {
        if (contentSaveTimerRef.current) {
          clearTimeout(contentSaveTimerRef.current);
        }

        contentSaveTimerRef.current = setTimeout(() => {
          void flushPendingScene().catch(() => undefined);
        }, CONTENT_SAVE_DELAY_MS);
      } else if (viewChanged) {
        if (viewSaveTimerRef.current) {
          clearTimeout(viewSaveTimerRef.current);
        }

        viewSaveTimerRef.current = setTimeout(() => {
          void flushPendingScene().catch(() => undefined);
        }, VIEW_SAVE_DELAY_MS);
      }

      if (!maximumSaveTimerRef.current) {
        maximumSaveTimerRef.current = setTimeout(() => {
          void flushPendingScene().catch(() => undefined);
        }, MAX_SAVE_WAIT_MS);
      }
    },
    [flushPendingScene],
  );

  useEffect(() => {
    isMountedRef.current = true;
    flushRef.current = flushPendingScene;
    flushLatestSceneRef.current = flushPendingScene;

    function flushWhenPageIsHidden() {
      if (document.visibilityState === "hidden") {
        void flushPendingScene().catch(() => undefined);
      }
    }

    const flushOnPageHide = () => {
      void flushPendingScene().catch(() => undefined);
    };

    window.addEventListener("pagehide", flushOnPageHide);
    document.addEventListener("visibilitychange", flushWhenPageIsHidden);

    return () => {
      void flushPendingScene().catch(() => undefined);
      clearSaveTimers();
      if (flushRef.current === flushPendingScene) {
        flushRef.current = null;
      }
      if (flushLatestSceneRef.current === flushPendingScene) {
        flushLatestSceneRef.current = null;
      }
      isMountedRef.current = false;
      window.removeEventListener("pagehide", flushOnPageHide);
      document.removeEventListener("visibilitychange", flushWhenPageIsHidden);
    };
  }, [clearSaveTimers, flushPendingScene, flushRef]);

  return (
    <div
      data-cell-editor="excalidraw"
      data-fullscreen-drawing-editor={isFullscreen ? "true" : undefined}
      className={
        isFullscreen ? "fixed inset-0 z-50 flex flex-col bg-white" : ""
      }
    >
      <div
        className={`flex items-center justify-between gap-3 ${
          isFullscreen ? "border-b border-slate-200 px-4 py-2" : "mb-2"
        }`}
      >
        <div className="text-xs text-slate-500">
          <p>
            Vector drawing |{" "}
            {isUploadingImage
              ? "uploading image..."
              : "changes save automatically"}
          </p>
          {imageUploadError && (
            <p role="alert" className="mt-1 text-red-600">
              {imageUploadError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            flushPendingScene();
            setIsFullscreen((currentValue) => !currentValue);
          }}
          className={secondaryButtonClass}
        >
          {isFullscreen ? "Close fullscreen" : "Open fullscreen"}
        </button>
      </div>

      <div
        className={`overflow-hidden bg-white ${
          isFullscreen ? "min-h-0 flex-1" : "rounded-md border border-slate-300"
        }`}
        style={isFullscreen ? undefined : { height: cell.heightPx }}
      >
        <Excalidraw
          initialData={initialData}
          theme={isDarkMode ? "dark" : "light"}
          excalidrawAPI={setExcalidrawApi}
          onChange={persistScene}
          autoFocus={false}
          handleKeyboardGlobally={false}
          UIOptions={EXCALIDRAW_UI_OPTIONS}
        />
      </div>
    </div>
  );
}
