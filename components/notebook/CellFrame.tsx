import { useSortable } from "@dnd-kit/react/sortable";
import { useEffect, useRef } from "react";
import DrawingCellEditor from "@/components/notebook/DrawingCellEditor";
import ExcalidrawCellEditor from "@/components/notebook/ExcalidrawCellEditor";
import TextCellEditor from "@/components/notebook/TextCellEditor";
import {
  smallDangerButtonClass,
  smallSecondaryButtonClass,
} from "@/components/ui/buttonStyles";
import type {
  ExcalidrawImageInsertionRequest,
  ExcalidrawSceneFlush,
  MarkdownInsertionRequest,
  NotebookCell,
  TextSelectionRequest,
} from "@/lib/types";

interface CellFrameProps {
  cell: NotebookCell;
  index: number;
  focusedCellId: string | null;
  isSelected: boolean;
  findQuery: string;
  textSelection: TextSelectionRequest | null;
  markdownInsertion: MarkdownInsertionRequest | null;
  excalidrawImageInsertion: ExcalidrawImageInsertionRequest | null;
  isTouchDrawingEnabled: boolean;
  showLegacyDrawingControls: boolean;
  onUpdateTextCell: (cellId: string, content: string) => void;
  onUpdateDrawingCell: (cellId: string, drawing: string | null) => void;
  onUpdateCellHeight: (cellId: string, heightPx: number) => void;
  onAddTextCellAfter: (cellId: string) => void;
  onAddDrawingCellAfter: (cellId: string) => void;
  onAddLegacyDrawingCellAfter: (cellId: string) => void;
  onRemoveCell: (cellId: string) => void | Promise<void>;
  onCopyCell: (cellId: string) => void | Promise<void>;
  onMoveCellUp: (cellId: string) => void;
  onMoveCellDown: (cellId: string) => void;
  onSelectCell: (cellId: string) => void;
  onRegisterExcalidrawFlush: (
    cellId: string,
    flush: ExcalidrawSceneFlush | null,
  ) => void;
  onExcalidrawImageInsertionHandled: (requestId: number) => void;
  onFocusedCellHandled: () => void;
}

export default function CellFrame({
  cell,
  index,
  focusedCellId,
  isSelected,
  findQuery,
  textSelection,
  markdownInsertion,
  excalidrawImageInsertion,
  isTouchDrawingEnabled,
  showLegacyDrawingControls,
  onUpdateTextCell,
  onUpdateDrawingCell,
  onUpdateCellHeight,
  onAddTextCellAfter,
  onAddDrawingCellAfter,
  onAddLegacyDrawingCellAfter,
  onRemoveCell,
  onCopyCell,
  onMoveCellUp,
  onMoveCellDown,
  onSelectCell,
  onRegisterExcalidrawFlush,
  onExcalidrawImageInsertionHandled,
  onFocusedCellHandled,
}: CellFrameProps) {
  const excalidrawFlushRef = useRef<ExcalidrawSceneFlush | null>(null);
  const excalidrawDrawing = cell.type === "excalidraw" ? cell.drawing : null;
  useEffect(() => {
    if (cell.type !== "excalidraw") return;

    const flush: ExcalidrawSceneFlush = () =>
      excalidrawFlushRef.current?.() ?? Promise.resolve(excalidrawDrawing);
    onRegisterExcalidrawFlush(cell.id, flush);
    return () => onRegisterExcalidrawFlush(cell.id, null);
  }, [cell.id, cell.type, excalidrawDrawing, onRegisterExcalidrawFlush]);
  const { ref, handleRef, isDragging } = useSortable({
    id: cell.id,
    index,
  });
  return (
    <article
      ref={ref}
      tabIndex={-1}
      data-cell-id={cell.id}
      data-selected={isSelected ? "true" : "false"}
      onPointerDownCapture={(event) => {
        onSelectCell(cell.id);

        if (!(event.target instanceof HTMLElement)) {
          return;
        }

        const interactiveTarget = event.target.closest(
          "button, input, textarea, select, a, label, [contenteditable='true'], [data-cell-editor]",
        );

        if (!interactiveTarget) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      onFocusCapture={() => onSelectCell(cell.id)}
      className={`mb-4 rounded-lg border border-slate-200 bg-white p-4 ${
        isDragging ? "opacity-60 shadow-lg" : ""
      } ${isSelected ? "ring-2 ring-sky-500 ring-offset-2" : ""}`}
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
          {cell.type === "text"
            ? "Text cell"
            : cell.type === "drawing"
              ? "Legacy canvas cell"
              : "Excalidraw cell"}
          {isSelected && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-700">
              Selected
            </span>
          )}
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
              title="Add text cell after this cell (Ctrl/Cmd + Enter)"
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
            {showLegacyDrawingControls && (
              <button
                type="button"
                onClick={() => onAddLegacyDrawingCellAfter(cell.id)}
                className={smallSecondaryButtonClass}
                title="Add a legacy bitmap canvas after this cell"
              >
                + Legacy canvas
              </button>
            )}
            <button
              type="button"
              onClick={() => onMoveCellUp(cell.id)}
              className={smallSecondaryButtonClass}
              title="Move cell up (Alt + Arrow Up)"
            >
              Up
            </button>
            <button
              type="button"
              onClick={() => onMoveCellDown(cell.id)}
              className={smallSecondaryButtonClass}
              title="Move cell down (Alt + Arrow Down)"
            >
              Down
            </button>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  await excalidrawFlushRef.current?.();
                  await onCopyCell(cell.id);
                })();
              }}
              className={smallSecondaryButtonClass}
              title="Duplicate cell (Ctrl/Cmd + Shift + Enter)"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  await excalidrawFlushRef.current?.();
                  await onRemoveCell(cell.id);
                })();
              }}
              className={smallDangerButtonClass}
              title="Delete cell (Ctrl/Cmd + Backspace)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {cell.type === "text" ? (
        <TextCellEditor
          cell={cell}
          findQuery={findQuery}
          onChange={(content) => onUpdateTextCell(cell.id, content)}
          shouldFocus={focusedCellId === cell.id}
          textSelection={textSelection}
          markdownInsertion={markdownInsertion}
          onFocusHandled={onFocusedCellHandled}
        />
      ) : cell.type === "drawing" ? (
        <DrawingCellEditor
          cell={cell}
          isTouchDrawingEnabled={isTouchDrawingEnabled}
          onChange={(drawing) => onUpdateDrawingCell(cell.id, drawing)}
        />
      ) : (
        <ExcalidrawCellEditor
          cell={cell}
          imageInsertion={excalidrawImageInsertion}
          flushRef={excalidrawFlushRef}
          onChange={(drawing) => onUpdateDrawingCell(cell.id, drawing)}
          onImageInsertionHandled={onExcalidrawImageInsertionHandled}
        />
      )}
    </article>
  );
}
