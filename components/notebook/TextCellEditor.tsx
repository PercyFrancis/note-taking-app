"use client";

import { useAuth } from "@clerk/nextjs";
import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { secondaryButtonClass } from "@/components/ui/buttonStyles";
import {
  createImageAltText,
  createPrivateImageUrl,
  isAllowedImageContentType,
  MAX_IMAGE_SIZE_BYTES,
  sanitizeImageFilename,
} from "@/lib/attachments";
import type {
  MarkdownInsertionRequest,
  TextCell,
  TextSelectionRequest,
} from "@/lib/types";
import { countWords, findTextCellMatches } from "@/lib/utils";

interface TextCellEditorProps {
  cell: TextCell;
  shouldFocus: boolean;
  findQuery: string;
  textSelection: TextSelectionRequest | null;
  markdownInsertion: MarkdownInsertionRequest | null;
  onChange: (content: string) => void;
  onFocusHandled: () => void;
}

export default function TextCellEditor({
  cell,
  shouldFocus,
  findQuery,
  textSelection,
  markdownInsertion,
  onChange,
  onFocusHandled,
}: TextCellEditorProps) {
  const { userId } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const highlightLayerRef = useRef<HTMLDivElement | null>(null);
  const activeMatchRef = useRef<HTMLElement | null>(null);
  const handledSelectionRequestIdRef = useRef<number | null>(null);
  const handledInsertionRequestIdRef = useRef<number | null>(null);
  const insertionPositionRef = useRef(0);
  const lastCaretPositionRef = useRef(cell.content.length);
  const latestContentRef = useRef(cell.content);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [pendingCaretPosition, setPendingCaretPosition] = useState<
    number | null
  >(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const highlightMatches = findTextCellMatches([cell], findQuery);
  latestContentRef.current = cell.content;
  useEffect(() => {
    if (!shouldFocus) return;

    textareaRef.current?.focus();
    onFocusHandled();
  }, [shouldFocus, onFocusHandled]);

  useEffect(() => {
    if (!textSelection || textSelection.cellId !== cell.id) {
      return;
    }

    if (handledSelectionRequestIdRef.current === textSelection.requestId) {
      return;
    }

    if (mode !== "write") {
      setMode("write");
      return;
    }

    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.setSelectionRange(textSelection.start, textSelection.end);
    textarea.scrollIntoView({ behavior: "smooth", block: "center" });

    const activeMatch = activeMatchRef.current;

    if (activeMatch) {
      textarea.scrollTop = Math.max(
        0,
        activeMatch.offsetTop -
          textarea.clientHeight / 2 +
          activeMatch.offsetHeight / 2,
      );

      if (highlightLayerRef.current) {
        highlightLayerRef.current.scrollTop = textarea.scrollTop;
      }
    }

    handledSelectionRequestIdRef.current = textSelection.requestId;
  }, [cell.id, mode, textSelection]);

  useEffect(() => {
    if (
      !markdownInsertion ||
      markdownInsertion.cellId !== cell.id ||
      handledInsertionRequestIdRef.current === markdownInsertion.requestId
    ) {
      return;
    }

    if (mode !== "write") {
      setMode("write");
      return;
    }

    const currentContent = latestContentRef.current;
    const insertionPosition = Math.min(
      lastCaretPositionRef.current,
      currentContent.length,
    );
    const nextContent = `${currentContent.slice(0, insertionPosition)}${markdownInsertion.markdown}${currentContent.slice(insertionPosition)}`;

    handledInsertionRequestIdRef.current = markdownInsertion.requestId;
    lastCaretPositionRef.current =
      insertionPosition + markdownInsertion.markdown.length;
    setPendingCaretPosition(lastCaretPositionRef.current);
    onChange(nextContent);
  }, [cell.id, markdownInsertion, mode, onChange]);

  useEffect(() => {
    if (pendingCaretPosition === null || mode !== "write") {
      return;
    }

    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(pendingCaretPosition, pendingCaretPosition);
    setPendingCaretPosition(null);
  }, [mode, pendingCaretPosition]);

  function chooseImage() {
    insertionPositionRef.current =
      textareaRef.current?.selectionStart ?? cell.content.length;
    setUploadError("");
    imageInputRef.current?.click();
  }

  async function insertImage(file: File) {
    if (!userId) {
      setUploadError("Sign in before uploading an image.");
      return;
    }

    if (!isAllowedImageContentType(file.type)) {
      setUploadError("Choose a JPEG, PNG, WebP, or GIF image.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setUploadError("Images must be 10 MB or smaller.");
      return;
    }

    setIsUploadingImage(true);
    setUploadProgress(0);
    setUploadError("");

    try {
      const filename = sanitizeImageFilename(file.name);
      const blob = await upload(
        `users/${userId}/images/${cell.id}/${filename}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/attachments/upload",
          clientPayload: JSON.stringify({ cellId: cell.id }),
          onUploadProgress: ({ percentage }) => {
            setUploadProgress(Math.round(percentage));
          },
        },
      );
      const imageUrl = createPrivateImageUrl(blob.pathname);
      const imageMarkdown = `![${createImageAltText(file.name)}](${imageUrl})`;
      const currentContent = latestContentRef.current;
      const insertionPosition = Math.min(
        textareaRef.current?.selectionStart ?? insertionPositionRef.current,
        currentContent.length,
      );
      const nextContent = `${currentContent.slice(0, insertionPosition)}${imageMarkdown}${currentContent.slice(insertionPosition)}`;

      setPendingCaretPosition(insertionPosition + imageMarkdown.length);
      setMode("write");
      onChange(nextContent);
    } catch {
      setUploadError(
        "Could not upload the image. Confirm that private Vercel Blob storage is connected.",
      );
    } finally {
      setIsUploadingImage(false);
      setUploadProgress(0);
    }
  }

  function renderHighlightedContent() {
    if (findQuery === "" || highlightMatches.length === 0) {
      return cell.content;
    }

    const content: React.ReactNode[] = [];
    let cursor = 0;

    for (const match of highlightMatches) {
      const isActive =
        textSelection?.cellId === cell.id &&
        textSelection.start === match.start &&
        textSelection.end === match.end;

      content.push(cell.content.slice(cursor, match.start));
      content.push(
        <mark
          key={`${match.start}-${match.end}`}
          ref={isActive ? activeMatchRef : undefined}
          className={
            isActive
              ? "rounded-sm bg-orange-300/70 text-transparent ring-1 ring-orange-500"
              : "rounded-sm bg-yellow-200/70 text-transparent"
          }
        >
          {cell.content.slice(match.start, match.end)}
        </mark>,
      );
      cursor = match.end;
    }

    content.push(cell.content.slice(cursor));
    return content;
  }

  const getModeButtonClass = (targetMode: "write" | "preview") => {
    const isActive = mode === targetMode;
    return [
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2",
      isActive
        ? "bg-slate-900 text-white shadow-sm"
        : "text-slate-500 hover:bg-white hover:text-slate-900",
    ].join(" ");
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <fieldset className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
          <legend className="sr-only">Text cell editor mode</legend>

          <button
            type="button"
            aria-pressed={mode === "write"}
            className={getModeButtonClass("write")}
            onClick={() => setMode("write")}
          >
            Write
          </button>

          <button
            type="button"
            aria-pressed={mode === "preview"}
            className={getModeButtonClass("preview")}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
        </fieldset>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";

            if (file) {
              insertImage(file);
            }
          }}
        />
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={isUploadingImage}
          onClick={chooseImage}
        >
          {isUploadingImage ? `Uploading ${uploadProgress}%` : "Insert image"}
        </button>
      </div>
      {uploadError && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {uploadError}
        </p>
      )}
      {mode === "write" ? (
        <div className="relative" style={{ height: cell.heightPx }}>
          {findQuery !== "" && (
            <div
              ref={highlightLayerRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 box-border overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent p-3 text-sm leading-6 text-transparent [overflow-wrap:break-word]"
            >
              {renderHighlightedContent()}
            </div>
          )}
          <textarea
            value={cell.content}
            ref={textareaRef}
            onChange={(event) => onChange(event.target.value)}
            onSelect={(event) => {
              lastCaretPositionRef.current = event.currentTarget.selectionStart;
            }}
            onScroll={(event) => {
              if (!highlightLayerRef.current) {
                return;
              }

              highlightLayerRef.current.scrollTop =
                event.currentTarget.scrollTop;
              highlightLayerRef.current.scrollLeft =
                event.currentTarget.scrollLeft;
            }}
            placeholder="Write something..."
            className="relative block h-full w-full resize-none overflow-auto rounded-md border border-slate-200 p-3 text-sm leading-6 text-slate-800 outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          />
        </div>
      ) : (
        <div
          style={{ height: cell.heightPx }}
          className="box-border break-words [overflow-wrap:anywhere] block min-w-0 overflow-auto rounded-md border border-slate-200 bg-white p-3"
        >
          <div
            className="
              prose prose-slate prose-sm max-w-none
              prose-table:w-full
              prose-table:border-collapse
              prose-th:border prose-th:border-slate-300 prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2
              prose-td:border prose-td:border-slate-200 prose-td:px-3 prose-td:py-2
            "
          >
            <Markdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {cell.content.trim() || "_Empty text cell_"}
            </Markdown>
          </div>
        </div>
      )}

      <div className="mt-2 flex gap-3 text-xs text-slate-400">
        <span>{countWords(cell.content)} words</span>
        <span>{cell.content.length} characters</span>
      </div>
    </div>
  );
}
