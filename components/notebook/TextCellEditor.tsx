"use client";

import { useEffect, useRef } from "react";
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
  useEffect(() => {
    if (!shouldFocus) return;

    textareaRef.current?.focus();
    onFocusHandled();
  }, [shouldFocus, onFocusHandled]);

  return (
    <div>
      <textarea
        value={cell.content}
        ref={textareaRef}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Write something..."
        style={{ height: cell.heightPx }}
        className="w-full resize-none rounded-md border border-slate-200 p-3 text-sm leading-6 text-slate-800 outline-none focus:border-slate-400"
      />

      <div className="mt-2 flex gap-3 text-xs text-slate-400">
        <span>{countWords(cell.content)} words</span>
        <span>{cell.content.length} characters</span>
      </div>
    </div>
  );
}
