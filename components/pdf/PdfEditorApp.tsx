"use client";

import "@excalidraw/excalidraw/index.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { UserButton, useAuth } from "@clerk/nextjs";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { upload } from "@vercel/blob/client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
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
): ExcalidrawInitialDataState {
  return {
    elements: scene?.elements ?? [],
    files: scene?.files ?? {},
    appState: {
      ...(scene?.appState ?? {}),
      viewBackgroundColor: "transparent",
    },
  };
}

function PdfAnnotationCanvas({
  scene,
  width,
  height,
  onSave,
}: {
  scene: string | undefined;
  width: number;
  height: number;
  onSave: (scene: string) => Promise<void>;
}) {
  const latestRef = useRef(scene ?? "");
  const committedRef = useRef(scene ?? "");
  const onSaveRef = useRef(onSave);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const [initialData] = useState(() =>
    annotationInitialData(parseScene(scene)),
  );
  onSaveRef.current = onSave;

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
      if (timerRef.current) clearTimeout(timerRef.current);
      if (latestRef.current && latestRef.current !== committedRef.current) {
        queueSave(latestRef.current);
      }
    };
  }, [queueSave]);

  return (
    <div
      className="pdf-annotation-layer absolute inset-0 z-10"
      style={{ width, height }}
    >
      <Excalidraw
        initialData={initialData}
        UIOptions={{
          tools: { image: false },
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            changeViewBackgroundColor: false,
          },
        }}
        onChange={(elements, appState, files) => {
          const next = JSON.stringify({
            version: 1,
            source: "pdf-annotation",
            elements,
            appState: {
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
              zoom: appState.zoom,
            },
            files,
          } satisfies StoredPdfScene);
          if (next === latestRef.current) return;
          latestRef.current = next;
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

export default function PdfEditorApp() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const isCloud = Boolean(isSignedIn);
  const [documents, setDocuments] = useState<PdfDocumentRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<
    Record<number, PdfAnnotationRecord>
  >({});
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [pdfSource, setPdfSource] = useState<string | Blob | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const activeDocument =
    documents.find((document) => document.id === activeId) ?? null;

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
    async (scene: string) => {
      if (!activeDocument) return;
      setStatus("Saving…");
      setAnnotations((current) => ({
        ...current,
        [pageNumber]: {
          pageNumber,
          scene,
          revision: (current[pageNumber]?.revision ?? 0) + 1,
          updatedAt: Date.now(),
        },
      }));
      try {
        if (isCloud)
          await saveRemotePdfAnnotation(activeDocument.id, pageNumber, scene);
        else await saveGuestPdfAnnotation(activeDocument.id, pageNumber, scene);
        setStatus("Saved");
      } catch {
        setStatus("Save failed");
      }
    },
    [activeDocument, isCloud, pageNumber],
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
      for (const annotation of Object.values(annotations)) {
        const scene = parseScene(annotation.scene);
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
          exportPadding: 0,
        });
        const image = await pdf.embedPng(await overlay.arrayBuffer());
        const page = pdf.getPage(annotation.pageNumber - 1);
        page.drawImage(image, {
          x: x1,
          y: page.getHeight() - y2,
          width: x2 - x1,
          height: y2 - y1,
        });
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
    <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
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
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
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

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-white p-3 md:w-64 md:border-r md:border-b-0">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            PDF documents
          </h2>
          <div className="max-h-40 space-y-1 overflow-auto md:max-h-[calc(100vh-8rem)]">
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
          <Document
            className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row"
            file={pdfSource}
            loading={<div className="p-8">Loading PDF…</div>}
          >
            <aside className="w-full shrink-0 overflow-auto border-b border-slate-200 bg-slate-50 p-2 md:w-40 md:border-r md:border-b-0">
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
                    onSelect={() => setPageNumber(number)}
                  />
                ))}
              </div>
            </aside>
            <section className="min-w-0 flex-1 overflow-auto p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                <strong className="mr-auto truncate">
                  {activeDocument.title}
                </strong>
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
              <div className="mx-auto w-fit overflow-hidden border border-slate-300 bg-white shadow-lg">
                <div
                  className="relative"
                  style={{ width: pageSize.width, height: pageSize.height }}
                >
                  <Page
                    key={pageNumber}
                    pageNumber={pageNumber}
                    scale={1}
                    onLoadSuccess={(page) => {
                      const viewport = page.getViewport({ scale: 1 });
                      setPageSize({
                        width: viewport.width,
                        height: viewport.height,
                      });
                    }}
                  />
                  <PdfAnnotationCanvas
                    key={`${activeDocument.id}:${pageNumber}`}
                    scene={annotations[pageNumber]?.scene}
                    width={pageSize.width}
                    height={pageSize.height}
                    onSave={persistScene}
                  />
                </div>
              </div>
            </section>
          </Document>
        )}
      </div>
    </main>
  );
}
