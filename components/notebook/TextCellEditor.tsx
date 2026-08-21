"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { TextCell, TextSelectionRequest } from "@/lib/types";
import { countWords, findTextCellMatches } from "@/lib/utils";

interface TextCellEditorProps {
  cell: TextCell;
  shouldFocus: boolean;
  findQuery: string;
  textSelection: TextSelectionRequest | null;
  onChange: (content: string) => void;
  onFocusHandled: () => void;
}

export default function TextCellEditor({
  cell,
  shouldFocus,
  findQuery,
  textSelection,
  onChange,
  onFocusHandled,
}: TextCellEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightLayerRef = useRef<HTMLDivElement | null>(null);
  const activeMatchRef = useRef<HTMLElement | null>(null);
  const handledSelectionRequestIdRef = useRef<number | null>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const highlightMatches = findTextCellMatches([cell], findQuery);
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
      <fieldset className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
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
