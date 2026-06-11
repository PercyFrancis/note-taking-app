import { useSortable } from "@dnd-kit/react/sortable";
import DrawingCellEditor from "@/components/notebook/DrawingCellEditor";
import TextCellEditor from "@/components/notebook/TextCellEditor";
import type { NotebookCell } from "@/lib/types";

interface CellFrameProps {
  cell: NotebookCell;
  index: number;
  onUpdateTextCell: (cellId: string, content: string) => void;
  onUpdateDrawingCell: (cellId: string, drawing: string | null) => void;
  onUpdateCellHeight: (cellId: string, heightPx: number) => void;
  onAddTextCellAfter: (cellId: string) => void;
  onAddDrawingCellAfter: (cellId: string) => void;
  onRemoveCell: (cellId: string) => void;
  onCopyCell: (cellId: string) => void;
  onMoveCellUp: (cellId: string) => void;
  onMoveCellDown: (cellId: string) => void;
}

export default function CellFrame({
  cell,
  index,
  onUpdateTextCell,
  onUpdateDrawingCell,
  onUpdateCellHeight,
  onAddTextCellAfter,
  onAddDrawingCellAfter,
  onRemoveCell,
  onCopyCell,
  onMoveCellUp,
  onMoveCellDown,
}: CellFrameProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: cell.id,
    index,
  });
  return (
    <article
      ref={ref}
      className={`mb-4 rounded-lg border border-slate-200 bg-white p-4 ${
        isDragging ? "opacity-60 shadow-lg" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase text-slate-400">
          <button
            ref={handleRef}
            type="button"
            className="mr-2 cursor-grab rounded border border-slate-200 px-2 py-1 text-slate-500 active:cursor-grabbing"
            aria-label="Drag cell"
            title="Drag cell"
          >
            Drag
          </button>
          {cell.type === "text" ? "Text cell" : "Drawing cell"}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Height
            <input
              type="range"
              min={120}
              max={720}
              step={20}
              value={cell.heightPx}
              onChange={(event) =>
                onUpdateCellHeight(cell.id, Number(event.target.value))
              }
              className="w-28 accent-slate-900"
            />
            <span className="w-8 text-right">{cell.heightPx}</span>
          </label>

          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onAddTextCellAfter(cell.id)}
              className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              + Text
            </button>

            <button
              type="button"
              onClick={() => onAddDrawingCellAfter(cell.id)}
              className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              + Drawing
            </button>
            <button
              type="button"
              onClick={() => onMoveCellUp(cell.id)}
              className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Up
            </button>
            <button
              type="button"
              onClick={() => onMoveCellDown(cell.id)}
              className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Down
            </button>
            <button
              type="button"
              onClick={() => onCopyCell(cell.id)}
              className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => onRemoveCell(cell.id)}
              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
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
