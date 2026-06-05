import type { NotebookCell } from "@/lib/types";

interface CellFrameProps {
  cell: NotebookCell;
}

export default function CellFrame({ cell }: CellFrameProps) {
  return (
    <article className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase text-slate-400">
          {cell.type === "text" ? "Text cell" : "Drawing cell"}
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            disabled
            className="rounded border px-2 py-1 text-xs text-slate-400"
          >
            Up
          </button>
          <button
            type="button"
            disabled
            className="rounded border px-2 py-1 text-xs text-slate-400"
          >
            Down
          </button>
          <button
            type="button"
            disabled
            className="rounded border px-2 py-1 text-xs text-slate-400"
          >
            Copy
          </button>
          <button
            type="button"
            disabled
            className="rounded border px-2 py-1 text-xs text-slate-400"
          >
            Delete
          </button>
        </div>
      </div>

      {cell.type === "text" ? (
        <p className="leading-7 text-slate-700">
          {cell.content || "Empty text cell"}
        </p>
      ) : (
        <div className="h-48 rounded-md border border-dashed border-slate-300 bg-slate-50" />
      )}
    </article>
  );
}
