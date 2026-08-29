"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  secondaryButtonClass,
  smallDangerButtonClass,
  smallSecondaryButtonClass,
} from "@/components/ui/buttonStyles";
import { createImageAltText } from "@/lib/attachments";
import {
  AttachmentReferenceError,
  loadUploadedImages,
  permanentlyDeleteUploadedImage,
  renameUploadedImage,
  restoreUploadedImage,
  trashUploadedImage,
} from "@/lib/client/attachment-api";
import {
  deleteGuestImage,
  listGuestImages,
  renameGuestImage,
  restoreGuestImage,
  trashGuestImage,
} from "@/lib/client/guest-storage";
import type { Notebook, UploadedImage } from "@/lib/types";

const IMAGES_PER_PAGE = 18;

interface ImageLibraryDialogProps {
  notebooks: Notebook[];
  selectedTextCellId: string | null;
  selectedExcalidrawCellId: string | null;
  selectedPdfPage?: number | null;
  onInsertIntoText?: (cellId: string, markdown: string) => void;
  onInsertIntoDrawing?: (cellId: string, image: UploadedImage) => void;
  onInsertIntoPdf?: (image: UploadedImage) => void;
  onClose: () => void;
  storageMode: "cloud" | "local";
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createImageMarkdown(image: UploadedImage): string {
  return `![${createImageAltText(image.filename)}](${image.url})`;
}

export default function ImageLibraryDialog({
  notebooks,
  selectedTextCellId,
  selectedExcalidrawCellId,
  selectedPdfPage = null,
  onInsertIntoText,
  onInsertIntoDrawing,
  onInsertIntoPdf,
  onClose,
  storageMode,
}: ImageLibraryDialogProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const [isTruncated, setIsTruncated] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<"active" | "trash">(
    "active",
  );
  const [actionStatus, setActionStatus] = useState("");
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [renamingImageId, setRenamingImageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadImages() {
      try {
        setIsLoading(true);
        setLoadError("");
        const result =
          storageMode === "local"
            ? { images: await listGuestImages(libraryStatus), truncated: false }
            : await loadUploadedImages(libraryStatus);

        if (!isCancelled) {
          setImages(result.images);
          setIsTruncated(result.truncated);
        }
      } catch {
        if (!isCancelled) {
          setLoadError("Could not load your image library.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadImages();
    return () => {
      isCancelled = true;
    };
  }, [libraryStatus, storageMode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const cellSources = useMemo(() => {
    const sources = new Map<
      string,
      { notebookTitle: string; cellNumber: number }
    >();

    for (const notebook of notebooks) {
      notebook.cells.forEach((cell, index) => {
        sources.set(cell.id, {
          notebookTitle: notebook.title || "Untitled notebook",
          cellNumber: index + 1,
        });
      });
    }

    return sources;
  }, [notebooks]);

  const filteredImages = images.filter((image) =>
    image.filename.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );
  const pageCount = Math.max(
    1,
    Math.ceil(filteredImages.length / IMAGES_PER_PAGE),
  );
  const visibleImages = filteredImages.slice(
    page * IMAGES_PER_PAGE,
    (page + 1) * IMAGES_PER_PAGE,
  );

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(successMessage);
    } catch {
      setCopyStatus("Could not copy to the clipboard.");
    }
  }

  function replaceImage(updatedImage: UploadedImage) {
    setImages((currentImages) =>
      currentImages.map((image) =>
        image.id === updatedImage.id ? updatedImage : image,
      ),
    );
  }

  async function renameImage(image: UploadedImage) {
    const displayName = renameValue.trim();

    if (!displayName) {
      setActionStatus("Enter a name for the image.");
      return;
    }

    setBusyImageId(image.id);
    setActionStatus("");
    try {
      const updatedImage =
        storageMode === "local"
          ? await renameGuestImage(image.id, displayName)
          : await renameUploadedImage(image.id, displayName);
      if (!updatedImage) throw new Error("Image not found");
      replaceImage(updatedImage);
      setRenamingImageId(null);
      setActionStatus("Image renamed. Existing links were not changed.");
    } catch {
      setActionStatus("Could not rename the image.");
    } finally {
      setBusyImageId(null);
    }
  }

  async function moveImageToTrash(image: UploadedImage) {
    if (!window.confirm(`Move “${image.filename}” to Trash?`)) return;

    setBusyImageId(image.id);
    setActionStatus("");
    try {
      if (storageMode === "local") await trashGuestImage(image.id);
      else await trashUploadedImage(image.id);
      setImages((currentImages) =>
        currentImages.filter((currentImage) => currentImage.id !== image.id),
      );
      setActionStatus("Image moved to Trash. Existing links still work.");
    } catch {
      setActionStatus("Could not move the image to Trash.");
    } finally {
      setBusyImageId(null);
    }
  }

  async function restoreImage(image: UploadedImage) {
    setBusyImageId(image.id);
    setActionStatus("");
    try {
      if (storageMode === "local") await restoreGuestImage(image.id);
      else await restoreUploadedImage(image.id);
      setImages((currentImages) =>
        currentImages.filter((currentImage) => currentImage.id !== image.id),
      );
      setActionStatus("Image restored to the library.");
    } catch {
      setActionStatus("Could not restore the image.");
    } finally {
      setBusyImageId(null);
    }
  }

  async function permanentlyDeleteImage(image: UploadedImage) {
    if (
      !window.confirm(
        `Permanently delete “${image.filename}”? This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusyImageId(image.id);
    setActionStatus("");
    try {
      if (storageMode === "local") {
        const isReferenced = notebooks.some((notebook) =>
          notebook.cells.some((cell) => {
            const value = cell.type === "text" ? cell.content : cell.drawing;
            return value?.includes(image.url);
          }),
        );
        if (isReferenced) {
          setActionStatus(
            "This image is still referenced by a notebook and cannot be permanently deleted.",
          );
          return;
        }
        await deleteGuestImage(image.id);
      } else {
        await permanentlyDeleteUploadedImage(image.id);
      }
      setImages((currentImages) =>
        currentImages.filter((currentImage) => currentImage.id !== image.id),
      );
      setActionStatus("Image permanently deleted.");
    } catch (error) {
      if (error instanceof AttachmentReferenceError) {
        const locations = error.references
          .slice(0, 4)
          .map((reference) =>
            reference.kind === "pdf"
              ? `${reference.pdfTitle}, page ${reference.pageNumber}`
              : `${reference.notebookTitle}, cell ${reference.cellNumber}`,
          )
          .join("; ");
        setActionStatus(
          `Deletion blocked because the image is still used in ${error.references.length} ${error.references.length === 1 ? "place" : "places"}${locations ? `: ${locations}` : ""}.`,
        );
      } else {
        setActionStatus("Could not permanently delete the image.");
      }
    } finally {
      setBusyImageId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 md:p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-library-title"
        aria-describedby="image-library-description"
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl"
      >
        <header className="border-b border-slate-200 p-4 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="image-library-title"
                className="text-xl font-semibold text-slate-950"
              >
                Image library
              </h2>
              <p
                id="image-library-description"
                className="mt-1 text-sm text-slate-600"
              >
                Browse, rename, recover, and safely remove your private images.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={secondaryButtonClass}
              title="Close image library (Escape)"
            >
              Close
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex-1">
              <span className="sr-only">Search images by filename</span>
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(0);
                }}
                placeholder="Search filenames..."
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              />
            </label>
            <p className="text-sm text-slate-500">
              {filteredImages.length}{" "}
              {filteredImages.length === 1 ? "image" : "images"}
            </p>
          </div>

          <div
            className="mt-3 flex gap-2"
            role="tablist"
            aria-label="Image library view"
          >
            {(["active", "trash"] as const).map((status) => (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={libraryStatus === status}
                onClick={() => {
                  setLibraryStatus(status);
                  setPage(0);
                  setActionStatus("");
                  setRenamingImageId(null);
                }}
                className={
                  libraryStatus === status
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                    : smallSecondaryButtonClass
                }
              >
                {status === "active" ? "Library" : "Trash"}
              </button>
            ))}
          </div>

          {!selectedTextCellId &&
            !selectedExcalidrawCellId &&
            !selectedPdfPage && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Select an insertion target to enable image insertion. Preview
                and copy actions are still available.
              </p>
            )}
          {isTruncated && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Only the first 20,000 images could be loaded. A database-backed
              attachment index is recommended for libraries this large.
            </p>
          )}
          {copyStatus && (
            <p aria-live="polite" className="mt-3 text-sm text-slate-600">
              {copyStatus}
            </p>
          )}
          {actionStatus && (
            <p aria-live="polite" className="mt-3 text-sm text-slate-700">
              {actionStatus}
            </p>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {isLoading && (
            <p className="py-12 text-center text-sm text-slate-500">
              Loading images...
            </p>
          )}
          {loadError && (
            <p role="alert" className="py-12 text-center text-sm text-red-600">
              {loadError}
            </p>
          )}
          {!isLoading && !loadError && filteredImages.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500">
              {images.length === 0
                ? libraryStatus === "trash"
                  ? "Trash is empty."
                  : "You have not uploaded any images yet."
                : "No filenames match your search."}
            </p>
          )}

          {!isLoading && !loadError && visibleImages.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleImages.map((image) => {
                const source = image.cellId
                  ? cellSources.get(image.cellId)
                  : undefined;
                const markdown = createImageMarkdown(image);
                const isBusy = busyImageId === image.id;

                return (
                  <article
                    key={image.pathname}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                  >
                    <a
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-video bg-slate-100"
                      title={`Preview ${image.filename}`}
                    >
                      {/* biome-ignore lint/performance/noImgElement: Private authenticated images cannot use server-side image optimization. */}
                      <img
                        src={image.url}
                        alt={image.filename}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    </a>
                    <div className="p-3">
                      <h3
                        className="truncate text-sm font-medium text-slate-900"
                        title={image.filename}
                      >
                        {image.filename}
                      </h3>
                      {image.filename !== image.originalFilename && (
                        <p
                          className="mt-1 truncate text-xs text-slate-500"
                          title={image.originalFilename}
                        >
                          Original file: {image.originalFilename}
                        </p>
                      )}
                      {renamingImageId === image.id && (
                        <form
                          className="mt-2 flex gap-1.5"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void renameImage(image);
                          }}
                        >
                          <input
                            value={renameValue}
                            onChange={(event) =>
                              setRenameValue(event.target.value)
                            }
                            maxLength={120}
                            disabled={isBusy}
                            aria-label={`New name for ${image.filename}`}
                            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                          />
                          <button
                            type="submit"
                            disabled={isBusy}
                            className={smallSecondaryButtonClass}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setRenamingImageId(null)}
                            className={smallSecondaryButtonClass}
                          >
                            Cancel
                          </button>
                        </form>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        {formatFileSize(image.size)} |{" "}
                        {new Date(image.uploadedAt).toLocaleString()}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {source
                          ? `${source.notebookTitle} | Cell ${source.cellNumber}`
                          : "Unattached"}
                      </p>
                      {image.trashedAt !== null && (
                        <p className="mt-1 text-xs text-amber-700">
                          Trashed {new Date(image.trashedAt).toLocaleString()} |
                          links remain active for 30 days and while referenced
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <a
                          href={image.url}
                          target="_blank"
                          rel="noreferrer"
                          className={smallSecondaryButtonClass}
                        >
                          Preview
                        </a>
                        <button
                          type="button"
                          className={smallSecondaryButtonClass}
                          onClick={() =>
                            copyText(
                              new URL(image.url, window.location.origin).href,
                              "Image URL copied.",
                            )
                          }
                        >
                          Copy URL
                        </button>
                        <button
                          type="button"
                          className={smallSecondaryButtonClass}
                          onClick={() =>
                            copyText(markdown, "Image Markdown copied.")
                          }
                        >
                          Copy Markdown
                        </button>
                        {libraryStatus === "active" ? (
                          <>
                            <button
                              type="button"
                              className={smallSecondaryButtonClass}
                              disabled={isBusy}
                              onClick={() => {
                                setRenamingImageId(image.id);
                                setRenameValue(image.filename);
                              }}
                            >
                              Rename
                            </button>
                            {onInsertIntoText && (
                              <button
                                type="button"
                                className={smallSecondaryButtonClass}
                                disabled={!selectedTextCellId || isBusy}
                                onClick={() => {
                                  if (selectedTextCellId) {
                                    onInsertIntoText(
                                      selectedTextCellId,
                                      markdown,
                                    );
                                  }
                                }}
                              >
                                Insert into text
                              </button>
                            )}
                            {onInsertIntoDrawing && (
                              <button
                                type="button"
                                className={smallSecondaryButtonClass}
                                disabled={!selectedExcalidrawCellId || isBusy}
                                onClick={() => {
                                  if (selectedExcalidrawCellId) {
                                    onInsertIntoDrawing(
                                      selectedExcalidrawCellId,
                                      image,
                                    );
                                  }
                                }}
                              >
                                Insert into drawing
                              </button>
                            )}
                            {onInsertIntoPdf && (
                              <button
                                type="button"
                                className={smallSecondaryButtonClass}
                                disabled={!selectedPdfPage || isBusy}
                                onClick={() => onInsertIntoPdf(image)}
                              >
                                Insert into PDF page {selectedPdfPage}
                              </button>
                            )}
                            <button
                              type="button"
                              className={smallDangerButtonClass}
                              disabled={isBusy}
                              onClick={() => void moveImageToTrash(image)}
                            >
                              Trash
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={smallSecondaryButtonClass}
                              disabled={isBusy}
                              onClick={() => void restoreImage(image)}
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              className={smallDangerButtonClass}
                              disabled={isBusy}
                              onClick={() => void permanentlyDeleteImage(image)}
                            >
                              Delete permanently
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 md:px-6">
          <p className="text-xs text-slate-500">
            Page {Math.min(page + 1, pageCount)} of {pageCount}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={page === 0}
              onClick={() => setPage((currentPage) => currentPage - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
