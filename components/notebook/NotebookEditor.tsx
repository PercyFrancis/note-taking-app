"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import CellList from "@/components/notebook/CellList";
import ImageLibraryDialog from "@/components/notebook/ImageLibraryDialog";
import NotebookFindReplace from "@/components/notebook/NotebookFindReplace";
import NotebookToolbar from "@/components/notebook/NotebookToolbar";
import type {
  ExcalidrawImageInsertionRequest,
  ExcalidrawSceneFlush,
  MarkdownInsertionRequest,
  Notebook,
  NotebookUpdate,
  TextCellMatch,
  TextSelectionRequest,
  UploadedImage,
  UserSettings,
} from "@/lib/types";

interface NotebookEditorProps {
  notebook: Notebook;
  notebooks: Notebook[];
  folderPath: string[];
  focusedCellId: string | null;
  onUpdateNotebook: (fields: NotebookUpdate) => void;
  onAddTextCell: () => void;
  onAddDrawingCell: () => void;
  onAddLegacyDrawingCell: () => void;
  onUpdateTextCell: (cellId: string, content: string) => void;
  onUpdateTextCells: (updates: ReadonlyMap<string, string>) => void;
  onUpdateDrawingCell: (cellId: string, drawing: string | null) => void;
  onUpdateCellHeight: (cellId: string, heightPx: number) => void;
  onAddTextCellAfter: (cellId: string) => void;
  onAddDrawingCellAfter: (cellId: string) => void;
  onAddLegacyDrawingCellAfter: (cellId: string) => void;
  onRemoveCell: (cellId: string) => void | Promise<void>;
  onCopyCell: (cellId: string) => void | Promise<void>;
  onMoveCellUp: (cellId: string) => void;
  onMoveCellDown: (cellId: string) => void;
  onReorderCells: (fromIndex: number, toIndex: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
  onFocusedCellHandled: () => void;
  onExportNotebooks: () => void;
  onRegisterExcalidrawFlush: (
    cellId: string,
    flush: ExcalidrawSceneFlush | null,
  ) => void;
  onImportNotebooks: (file: File) => void;
  settings: UserSettings;
  isDarkMode: boolean;
  storageMode: "cloud" | "local";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.tagName === "TEXTAREA" ||
    target.tagName === "INPUT" ||
    target.isContentEditable ||
    target.closest("[data-cell-editor='excalidraw']") !== null
  );
}

function getTargetCellId(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null;

  return target.closest<HTMLElement>("[data-cell-id]")?.dataset.cellId ?? null;
}

export default function NotebookEditor({
  notebook,
  notebooks,
  folderPath,
  focusedCellId,
  onUpdateNotebook,
  onAddTextCell,
  onAddDrawingCell,
  onAddLegacyDrawingCell,
  onUpdateTextCell,
  onUpdateTextCells,
  onUpdateDrawingCell,
  onUpdateCellHeight,
  onAddTextCellAfter,
  onAddDrawingCellAfter,
  onAddLegacyDrawingCellAfter,
  onRemoveCell,
  onCopyCell,
  onMoveCellUp,
  onMoveCellDown,
  onReorderCells,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  onFocusedCellHandled,
  onExportNotebooks,
  onRegisterExcalidrawFlush,
  onImportNotebooks,
  settings,
  isDarkMode,
  storageMode,
}: NotebookEditorProps) {
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isImageLibraryOpen, setIsImageLibraryOpen] = useState(false);
  const [findFocusRequestId, setFindFocusRequestId] = useState(0);
  const [findQuery, setFindQuery] = useState("");
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [textSelection, setTextSelection] =
    useState<TextSelectionRequest | null>(null);
  const selectionRequestIdRef = useRef(0);
  const insertionRequestIdRef = useRef(0);
  const [markdownInsertion, setMarkdownInsertion] =
    useState<MarkdownInsertionRequest | null>(null);
  const [excalidrawImageInsertion, setExcalidrawImageInsertion] =
    useState<ExcalidrawImageInsertionRequest | null>(null);
  const imageInsertionNotebookIdRef = useRef(notebook.id);
  const handleExcalidrawImageInsertionHandled = useCallback(
    (requestId: number) => {
      setExcalidrawImageInsertion((currentRequest) =>
        currentRequest?.requestId === requestId ? null : currentRequest,
      );
    },
    [],
  );

  useEffect(() => {
    if (imageInsertionNotebookIdRef.current !== notebook.id) {
      imageInsertionNotebookIdRef.current = notebook.id;
      setExcalidrawImageInsertion(null);
    }
  }, [notebook.id]);
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
      if (
        document.querySelector(
          '[role="dialog"][aria-modal="true"], [data-fullscreen-drawing-editor="true"]',
        )
      ) {
        return;
      }

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
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;
      const isTypingInEditableElement = isEditableTarget(event.target);

      if (
        isModifierPressed &&
        event.key.toLowerCase() === "z" &&
        !isTypingInEditableElement
      ) {
        const shouldRedo = event.shiftKey;

        if ((shouldRedo && canRedo) || (!shouldRedo && canUndo)) {
          event.preventDefault();
          shouldRedo ? onRedo() : onUndo();
        }

        return;
      }

      if (!selectedCellId) {
        return;
      }

      const targetCellId = getTargetCellId(event.target);

      if (isTypingInEditableElement && targetCellId !== selectedCellId) {
        return;
      }

      if (event.altKey && !isModifierPressed && !isTypingInEditableElement) {
        if (event.key === "Enter") {
          event.preventDefault();
          onAddDrawingCellAfter(selectedCellId);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          onMoveCellUp(selectedCellId);
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          onMoveCellDown(selectedCellId);
          return;
        }
      }

      if (!isModifierPressed) {
        return;
      }

      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        onCopyCell(selectedCellId);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        onAddTextCellAfter(selectedCellId);
        return;
      }

      if (event.key === "Backspace" && !isTypingInEditableElement) {
        event.preventDefault();

        if (window.confirm("Delete this cell?")) {
          onRemoveCell(selectedCellId);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    isFindOpen,
    canRedo,
    canUndo,
    selectedCellId,
    onAddTextCellAfter,
    onAddDrawingCellAfter,
    onCopyCell,
    onMoveCellDown,
    onMoveCellUp,
    onRedo,
    onRemoveCell,
    onUndo,
  ]);

  useEffect(() => {
    if (
      selectedCellId &&
      !notebook.cells.some((cell) => cell.id === selectedCellId)
    ) {
      setSelectedCellId(null);
    }
  }, [notebook.cells, selectedCellId]);

  function navigateToMatch(match: TextCellMatch) {
    setSelectedCellId(match.cellId);
    selectionRequestIdRef.current += 1;
    setTextSelection({
      ...match,
      requestId: selectionRequestIdRef.current,
    });
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white px-4 py-4 md:px-8">
        <p className="text-xs font-medium text-slate-400">
          {folderPath.length > 0 ? folderPath.join(" / ") : "Unfiled"}
        </p>

        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={notebook.title}
            onChange={(event) =>
              onUpdateNotebook({ title: event.target.value })
            }
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-2xl font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          />

          <NotebookToolbar
            canUndo={canUndo}
            canRedo={canRedo}
            undoLabel={undoLabel}
            redoLabel={redoLabel}
            onUndo={onUndo}
            onRedo={onRedo}
            onAddTextCell={onAddTextCell}
            onAddDrawingCell={onAddDrawingCell}
            onAddLegacyDrawingCell={onAddLegacyDrawingCell}
            showLegacyDrawingControls={settings.legacyCanvasToolsVisible}
            onOpenFind={openFind}
            onOpenImageLibrary={() => setIsImageLibraryOpen(true)}
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
        selectedCellId={selectedCellId}
        findQuery={findQuery}
        textSelection={textSelection}
        markdownInsertion={markdownInsertion}
        excalidrawImageInsertion={excalidrawImageInsertion}
        isTouchDrawingEnabled={settings.touchDrawingEnabled}
        showLegacyDrawingControls={settings.legacyCanvasToolsVisible}
        isDarkMode={isDarkMode}
        storageMode={storageMode}
        onUpdateTextCell={onUpdateTextCell}
        onUpdateDrawingCell={onUpdateDrawingCell}
        onUpdateCellHeight={onUpdateCellHeight}
        onAddTextCellAfter={onAddTextCellAfter}
        onAddDrawingCellAfter={onAddDrawingCellAfter}
        onAddLegacyDrawingCellAfter={onAddLegacyDrawingCellAfter}
        onRemoveCell={onRemoveCell}
        onCopyCell={onCopyCell}
        onMoveCellUp={onMoveCellUp}
        onMoveCellDown={onMoveCellDown}
        onSelectCell={setSelectedCellId}
        onRegisterExcalidrawFlush={onRegisterExcalidrawFlush}
        onExcalidrawImageInsertionHandled={
          handleExcalidrawImageInsertionHandled
        }
        onReorderCells={onReorderCells}
        onFocusedCellHandled={onFocusedCellHandled}
      />
      {isImageLibraryOpen && (
        <ImageLibraryDialog
          storageMode={storageMode}
          notebooks={notebooks}
          selectedTextCellId={
            notebook.cells.find((cell) => cell.id === selectedCellId)?.type ===
            "text"
              ? selectedCellId
              : null
          }
          selectedExcalidrawCellId={
            notebook.cells.find((cell) => cell.id === selectedCellId)?.type ===
            "excalidraw"
              ? selectedCellId
              : null
          }
          onInsertIntoText={(cellId, markdown) => {
            insertionRequestIdRef.current += 1;
            setMarkdownInsertion({
              cellId,
              markdown,
              requestId: insertionRequestIdRef.current,
            });
            setSelectedCellId(cellId);
            setIsImageLibraryOpen(false);
          }}
          onInsertIntoDrawing={(cellId, image: UploadedImage) => {
            insertionRequestIdRef.current += 1;
            setExcalidrawImageInsertion({
              cellId,
              image,
              requestId: insertionRequestIdRef.current,
            });
            setSelectedCellId(cellId);
            setIsImageLibraryOpen(false);
          }}
          onClose={() => setIsImageLibraryOpen(false)}
        />
      )}
    </section>
  );
}
