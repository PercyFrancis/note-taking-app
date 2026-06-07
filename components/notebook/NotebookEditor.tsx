"use client";
import CellList from "@/components/notebook/CellList";
import type { Notebook, NotebookUpdate } from "@/lib/types";

interface NotebookEditorProps {
  notebook: Notebook;
  onUpdateNotebook: (fields: NotebookUpdate) => void;
  onAddTextCell: () => void;
  onAddDrawingCell: () => void;
  onUpdateTextCell: (cellId: string, content: string) => void;
  onUpdateDrawingCell: (cellId: string, drawing: string | null) => void;
}

export default function NotebookEditor({
  notebook,
  onUpdateNotebook,
  onAddTextCell,
  onAddDrawingCell,
  onUpdateTextCell,
  onUpdateDrawingCell,
}: NotebookEditorProps) {
  return (
    <section className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white px-8 py-5">
        <p className="text-sm text-slate-500">Notebook</p>
        <input
          value={notebook.title}
          onChange={(event) => onUpdateNotebook({ title: event.target.value })}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAddTextCell}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Add text cell
          </button>

          <button
            type="button"
            onClick={onAddDrawingCell}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700"
          >
            Add drawing cell
          </button>
        </div>
      </header>
      <CellList
        cells={notebook.cells}
        onUpdateTextCell={onUpdateTextCell}
        onUpdateDrawingCell={onUpdateDrawingCell}
      />
    </section>
  );
}
