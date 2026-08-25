"use client";

import "@excalidraw/excalidraw/index.css";
import { useAuth } from "@clerk/nextjs";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  DataURL,
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
import type { ExcalidrawCell } from "@/lib/types";
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
  appState: Pick<AppState, "viewBackgroundColor">;
  files: BinaryFiles;
}

interface ExcalidrawCellEditorProps {
  cell: ExcalidrawCell;
  onChange: (drawing: string) => void;
}

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
  onChange,
}: ExcalidrawCellEditorProps) {
  const { userId } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [initialData] = useState(() => parseScene(cell.drawing));
  const onChangeRef = useRef(onChange);
  const userIdRef = useRef(userId);
  const isMountedRef = useRef(true);
  const lastSerializedSceneRef = useRef(cell.drawing);
  const sceneRevisionRef = useRef(0);
  const pendingUploadCountRef = useRef(0);
  const hostedFilePromisesRef = useRef(
    new Map<string, Promise<BinaryFileData>>(),
  );

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
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [isFullscreen]);

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

        if (!currentUserId) {
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
    [cell.id],
  );

  const persistScene = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      const revision = sceneRevisionRef.current + 1;
      sceneRevisionRef.current = revision;

      void Promise.all(
        Object.entries(files).map(
          async ([fileId, file]) =>
            [fileId, await getHostedFile(file)] as const,
        ),
      )
        .then((hostedFileEntries) => {
          if (!isMountedRef.current || sceneRevisionRef.current !== revision) {
            return;
          }

          const scene: StoredExcalidrawScene = {
            version: 1,
            source: "excalidraw",
            elements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
            },
            files: Object.fromEntries(hostedFileEntries) as BinaryFiles,
          };
          const serializedScene = JSON.stringify(scene);

          if (serializedScene === lastSerializedSceneRef.current) {
            return;
          }

          lastSerializedSceneRef.current = serializedScene;
          setImageUploadError("");
          onChangeRef.current(serializedScene);
        })
        .catch((error: unknown) => {
          if (!isMountedRef.current) return;

          setImageUploadError(
            error instanceof Error
              ? error.message
              : "Could not upload the pasted image.",
          );
        });
    },
    [getHostedFile],
  );

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
          onClick={() => setIsFullscreen((currentValue) => !currentValue)}
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
          onChange={persistScene}
          autoFocus={false}
          handleKeyboardGlobally={false}
          UIOptions={EXCALIDRAW_UI_OPTIONS}
        />
      </div>
    </div>
  );
}
