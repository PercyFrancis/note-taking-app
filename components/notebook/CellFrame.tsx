import DrawingCellEditor from "@/components/notebook/DrawingCellEditor";
import TextCellEditor from "@/components/notebook/TextCellEditor";
import type { NotebookCell } from "@/lib/types";

interface CellFrameProps {
  cell: NotebookCell;
  onUpdateTextCell: (cellId: string, content: string) => void;
  onUpdateDrawingCell: (cellId: string, drawing: string | null) => void;
}

export default function CellFrame({
  cell,
  onUpdateTextCell,
  onUpdateDrawingCell,
}: CellFrameProps) {
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
        <TextCellEditor
          cell={cell}
          onChange={(content) => onUpdateTextCell(cell.id, content)}
        />
      ) : (
        <DrawingCellEditor
          cell={cell}
          onChange={(drawing) => onUpdateDrawingCell(cell.id, drawing)}
        />
      )}
    </article>
  );
}
