"use client";
import CellList from "@/components/notebook/CellList";
import type { Notebook, NotebookUpdate } from "@/lib/types";

interface NotebookEditorProps {
  notebook: Notebook;
  focusedCellId: string | null;
  onUpdateNotebook: (fields: NotebookUpdate) => void;
  onAddTextCell: () => void;
  onAddDrawingCell: () => void;
  onUpdateTextCell: (cellId: string, content: string) => void;
  onUpdateDrawingCell: (cellId: string, drawing: string | null) => void;
  onUpdateCellHeight: (cellId: string, heightPx: number) => void;
  onAddTextCellAfter: (cellId: string) => void;
  onAddDrawingCellAfter: (cellId: string) => void;
  onRemoveCell: (cellId: string) => void;
  onCopyCell: (cellId: string) => void;
  onMoveCellUp: (cellId: string) => void;
  onMoveCellDown: (cellId: string) => void;
  onReorderCells: (fromIndex: number, toIndex: number) => void;
  onFocusedCellHandled: () => void;
}

export default function NotebookEditor({
  notebook,
  focusedCellId,
  onUpdateNotebook,
  onAddTextCell,
  onAddDrawingCell,
  onUpdateTextCell,
  onUpdateDrawingCell,
  onUpdateCellHeight,
  onAddTextCellAfter,
  onAddDrawingCellAfter,
  onRemoveCell,
  onCopyCell,
  onMoveCellUp,
  onMoveCellDown,
  onReorderCells,
  onFocusedCellHandled,
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
        focusedCellId={focusedCellId}
        onUpdateTextCell={onUpdateTextCell}
        onUpdateDrawingCell={onUpdateDrawingCell}
        onUpdateCellHeight={onUpdateCellHeight}
        onAddTextCellAfter={onAddTextCellAfter}
        onAddDrawingCellAfter={onAddDrawingCellAfter}
        onRemoveCell={onRemoveCell}
        onCopyCell={onCopyCell}
        onMoveCellUp={onMoveCellUp}
        onMoveCellDown={onMoveCellDown}
        onReorderCells={onReorderCells}
        onFocusedCellHandled={onFocusedCellHandled}
      />
    </section>
  );
}
