"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { TextCell } from "@/lib/types";
import { countWords } from "@/lib/utils";

interface TextCellEditorProps {
  cell: TextCell;
  shouldFocus: boolean;
  onChange: (content: string) => void;
  onFocusHandled: () => void;
}

export default function TextCellEditor({
  cell,
  shouldFocus,
  onChange,
  onFocusHandled,
}: TextCellEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  useEffect(() => {
    if (!shouldFocus) return;

    textareaRef.current?.focus();
    onFocusHandled();
  }, [shouldFocus, onFocusHandled]);

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
        <textarea
          value={cell.content}
          ref={textareaRef}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write something..."
          style={{ height: cell.heightPx }}
          className="box-border block overflow-auto w-full resize-none rounded-md border border-slate-200 p-3 text-sm leading-6 text-slate-800 
          outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        />
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
