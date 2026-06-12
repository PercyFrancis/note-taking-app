import { useSortable } from "@dnd-kit/react/sortable";
import DrawingCellEditor from "@/components/notebook/DrawingCellEditor";
import TextCellEditor from "@/components/notebook/TextCellEditor";
import {
  smallDangerButtonClass,
  smallSecondaryButtonClass,
} from "@/components/ui/buttonStyles";
import type { NotebookCell } from "@/lib/types";

interface CellFrameProps {
  cell: NotebookCell;
  index: number;
  focusedCellId: string | null;
  onUpdateTextCell: (cellId: string, content: string) => void;
  onUpdateDrawingCell: (cellId: string, drawing: string | null) => void;
  onUpdateCellHeight: (cellId: string, heightPx: number) => void;
  onAddTextCellAfter: (cellId: string) => void;
  onAddDrawingCellAfter: (cellId: string) => void;
  onRemoveCell: (cellId: string) => void;
  onCopyCell: (cellId: string) => void;
  onMoveCellUp: (cellId: string) => void;
  onMoveCellDown: (cellId: string) => void;
  onFocusedCellHandled: () => void;
}

export default function CellFrame({
  cell,
  index,
  focusedCellId,
  onUpdateTextCell,
  onUpdateDrawingCell,
  onUpdateCellHeight,
  onAddTextCellAfter,
  onAddDrawingCellAfter,
  onRemoveCell,
  onCopyCell,
  onMoveCellUp,
  onMoveCellDown,
  onFocusedCellHandled,
}: CellFrameProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: cell.id,
    index,
  });
  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;

    return (
      target.tagName === "TEXTAREA" ||
      target.tagName === "INPUT" ||
      target.isContentEditable
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const isModifierPressed = event.ctrlKey || event.metaKey;

    if (!isModifierPressed) return;

    const isTypingInEditableElement = isEditableTarget(event.target);

    if (event.key === "Enter") {
      event.preventDefault();
      onAddTextCellAfter(cell.id);
      return;
    }

    if (event.shiftKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      onAddDrawingCellAfter(cell.id);
      return;
    }

    if (event.key === "Backspace" && !isTypingInEditableElement) {
      event.preventDefault();

      const shouldDelete = window.confirm("Delete this cell?");
      if (shouldDelete) {
        onRemoveCell(cell.id);
      }
    }
  }

  return (
    <article
      ref={ref}
      onKeyDown={handleKeyDown}
      className={`mb-4 rounded-lg border border-slate-200 bg-white p-4 ${
        isDragging ? "opacity-60 shadow-lg" : ""
      }`}
    >
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
          <button
            ref={handleRef}
            type="button"
            className="h-8 shrink-0 cursor-grab rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-500
             active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label="Drag cell"
            title="Drag cell"
          >
            Drag
          </button>
          {cell.type === "text" ? "Text cell" : "Drawing cell"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-500">
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
              className="w-24 accent-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
            <span className="w-8 text-right tabular-nums">{cell.heightPx}</span>
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onAddTextCellAfter(cell.id)}
              className={smallSecondaryButtonClass}
            >
              + Text
            </button>

            <button
              type="button"
              onClick={() => onAddDrawingCellAfter(cell.id)}
              className={smallSecondaryButtonClass}
            >
              + Drawing
            </button>
            <button
              type="button"
              onClick={() => onMoveCellUp(cell.id)}
              className={smallSecondaryButtonClass}
            >
              Up
            </button>
            <button
              type="button"
              onClick={() => onMoveCellDown(cell.id)}
              className={smallSecondaryButtonClass}
            >
              Down
            </button>
            <button
              type="button"
              onClick={() => onCopyCell(cell.id)}
              className={smallSecondaryButtonClass}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => onRemoveCell(cell.id)}
              className={smallDangerButtonClass}
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
          shouldFocus={focusedCellId === cell.id}
          onFocusHandled={onFocusedCellHandled}
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
