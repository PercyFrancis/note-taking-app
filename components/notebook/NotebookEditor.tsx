"use client";
import type { Notebook, NotebookUpdate } from "@/lib/types";

interface NotebookEditorProps {
  notebook: Notebook;
  onUpdateNotebook: (fields: NotebookUpdate) => void;
  onAddTextCell: () => void; // temp
  onAddDrawingCell: () => void; // temp
}

export default function NotebookEditor({
  notebook,
  onUpdateNotebook,
  onAddTextCell,
  onAddDrawingCell,
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
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {notebook.cells.map((cell) => (
          <article
            key={cell.id}
            className="mb-4 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="mb-3 text-xs font-medium uppercase text-slate-400">
              {cell.type === "text" ? "Text cell" : "Drawing cell"}
            </div>
            {cell.type === "text" ? (
              <p className="leading-7 text-slate-700">
                {cell.content || "Empty text cell"}
              </p>
            ) : (
              <div className="h-48 rounded-md border border-dashed border-slate-300 bg-slate-50" />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
