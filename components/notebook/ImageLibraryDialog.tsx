"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  secondaryButtonClass,
  smallSecondaryButtonClass,
} from "@/components/ui/buttonStyles";
import { createImageAltText } from "@/lib/attachments";
import { loadUploadedImages } from "@/lib/client/attachment-api";
import type { Notebook, UploadedImage } from "@/lib/types";

const IMAGES_PER_PAGE = 18;

interface ImageLibraryDialogProps {
  notebooks: Notebook[];
  selectedTextCellId: string | null;
  onInsert: (cellId: string, markdown: string) => void;
  onClose: () => void;
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
  onInsert,
  onClose,
}: ImageLibraryDialogProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const [isTruncated, setIsTruncated] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadImages() {
      try {
        const result = await loadUploadedImages();

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
  }, []);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 md:p-6">
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
                Browse every private image uploaded to your account.
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

          {!selectedTextCellId && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Select a text cell to enable image insertion. Preview and copy
              actions are still available.
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
                ? "You have not uploaded any images yet."
                : "No filenames match your search."}
            </p>
          )}

          {!isLoading && !loadError && visibleImages.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleImages.map((image) => {
                const source = cellSources.get(image.cellId);
                const markdown = createImageMarkdown(image);

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
                      <p className="mt-1 text-xs text-slate-500">
                        {formatFileSize(image.size)} |{" "}
                        {new Date(image.uploadedAt).toLocaleString()}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {source
                          ? `${source.notebookTitle} | Cell ${source.cellNumber}`
                          : "Unattached"}
                      </p>

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
                        <button
                          type="button"
                          className={smallSecondaryButtonClass}
                          disabled={!selectedTextCellId}
                          onClick={() => {
                            if (selectedTextCellId) {
                              onInsert(selectedTextCellId, markdown);
                            }
                          }}
                        >
                          Insert
                        </button>
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
