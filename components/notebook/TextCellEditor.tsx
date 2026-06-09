"use client";

import type { TextCell } from "@/lib/types";
import { countWords } from "@/lib/utils";

interface TextCellEditorProps {
  cell: TextCell;
  onChange: (content: string) => void;
}

export default function TextCellEditor({
  cell,
  onChange,
}: TextCellEditorProps) {
  return (
    <div>
      <textarea
        value={cell.content}
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
