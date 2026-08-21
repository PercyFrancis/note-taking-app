"use client";
import { useEffect, useRef, useState } from "react";
import CellList from "@/components/notebook/CellList";
import NotebookFindReplace from "@/components/notebook/NotebookFindReplace";
import NotebookToolbar from "@/components/notebook/NotebookToolbar";
import type {
  Notebook,
  NotebookUpdate,
  TextCellMatch,
  TextSelectionRequest,
} from "@/lib/types";

interface NotebookEditorProps {
  notebook: Notebook;
  focusedCellId: string | null;
  onUpdateNotebook: (fields: NotebookUpdate) => void;
  onAddTextCell: () => void;
  onAddDrawingCell: () => void;
  onUpdateTextCell: (cellId: string, content: string) => void;
  onUpdateTextCells: (updates: ReadonlyMap<string, string>) => void;
  onUpdateDrawingCell: (cellId: string, drawing: string | null) => void;
  onUpdateCellHeight: (cellId: string, heightPx: number) => void;
  onAddTextCellAfter: (cellId: string) => void;
  onAddDrawingCellAfter: (cellId: string) => void;
  onRemoveCell: (cellId: string) => void | Promise<void>;
  onCopyCell: (cellId: string) => void | Promise<void>;
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
  onUpdateTextCells,
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
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findFocusRequestId, setFindFocusRequestId] = useState(0);
  const [findQuery, setFindQuery] = useState("");
  const [textSelection, setTextSelection] =
    useState<TextSelectionRequest | null>(null);
  const selectionRequestIdRef = useRef(0);

  function openFind() {
    setIsFindOpen(true);
    setFindFocusRequestId((currentRequestId) => currentRequestId + 1);
  }

  function closeFind() {
    setIsFindOpen(false);
    setFindQuery("");
    setTextSelection(null);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsFindOpen(true);
        setFindFocusRequestId((currentRequestId) => currentRequestId + 1);
        return;
      }

      if (event.key === "Escape" && isFindOpen) {
        event.preventDefault();
        setIsFindOpen(false);
        setFindQuery("");
        setTextSelection(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFindOpen]);

  function navigateToMatch(match: TextCellMatch) {
    selectionRequestIdRef.current += 1;
    setTextSelection({
      ...match,
      requestId: selectionRequestIdRef.current,
    });
  }

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
            onOpenFind={openFind}
            onExportNotebooks={onExportNotebooks}
            onImportNotebooks={onImportNotebooks}
          />
        </div>
      </header>
      {isFindOpen && (
        <NotebookFindReplace
          key={notebook.id}
          cells={notebook.cells}
          focusRequestId={findFocusRequestId}
          query={findQuery}
          onQueryChange={(query) => {
            setFindQuery(query);
            setTextSelection(null);
          }}
          onUpdateTextCell={onUpdateTextCell}
          onUpdateTextCells={onUpdateTextCells}
          onNavigate={navigateToMatch}
          onClose={closeFind}
        />
      )}
      <CellList
        cells={notebook.cells}
        focusedCellId={focusedCellId}
        findQuery={findQuery}
        textSelection={textSelection}
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
