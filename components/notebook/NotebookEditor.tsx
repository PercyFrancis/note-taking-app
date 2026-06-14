"use client";
import CellList from "@/components/notebook/CellList";
import NotebookToolbar from "@/components/notebook/NotebookToolbar";
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
  onExportNotebooks: () => void;
  onImportNotebooks: (file: File) => void;
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
  onExportNotebooks,
  onImportNotebooks,
}: NotebookEditorProps) {
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white px-4 py-4 md:px-8">
        <p className="text-xs font-medium uppercase text-slate-400">Notebook</p>

        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={notebook.title}
            onChange={(event) =>
              onUpdateNotebook({ title: event.target.value })
            }
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-2xl font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          />

          <NotebookToolbar
            onAddTextCell={onAddTextCell}
            onAddDrawingCell={onAddDrawingCell}
            onExportNotebooks={onExportNotebooks}
            onImportNotebooks={onImportNotebooks}
          />
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
