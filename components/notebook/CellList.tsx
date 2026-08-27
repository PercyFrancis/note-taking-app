import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import CellFrame from "@/components/notebook/CellFrame";
import type {
  ExcalidrawImageInsertionRequest,
  ExcalidrawSceneFlush,
  MarkdownInsertionRequest,
  NotebookCell,
  TextSelectionRequest,
} from "@/lib/types";

interface CellListProps {
  cells: NotebookCell[];
  focusedCellId: string | null;
  selectedCellId: string | null;
  findQuery: string;
  textSelection: TextSelectionRequest | null;
  markdownInsertion: MarkdownInsertionRequest | null;
  excalidrawImageInsertion: ExcalidrawImageInsertionRequest | null;
  isTouchDrawingEnabled: boolean;
  showLegacyDrawingControls: boolean;
  isDarkMode: boolean;
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
  onReorderCells: (fromIndex: number, toIndex: number) => void;
  onFocusedCellHandled: () => void;
}

export default function CellList({
  cells,
  focusedCellId,
  selectedCellId,
  findQuery,
  textSelection,
  markdownInsertion,
  excalidrawImageInsertion,
  isTouchDrawingEnabled,
  showLegacyDrawingControls,
  isDarkMode,
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
  onReorderCells,
  onFocusedCellHandled,
}: CellListProps) {
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return;

        const { source } = event.operation;

        if (!isSortable(source)) return;

        const { initialIndex, index } = source;

        if (initialIndex === index) return;

        onReorderCells(initialIndex, index);
      }}
    >
      <div
        data-cell-scroll-container
        className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6"
      >
        {cells.map((cell, index) => (
          <CellFrame
            key={cell.id}
            cell={cell}
            index={index}
            focusedCellId={focusedCellId}
            isSelected={selectedCellId === cell.id}
            findQuery={findQuery}
            textSelection={
              textSelection?.cellId === cell.id ? textSelection : null
            }
            markdownInsertion={
              markdownInsertion?.cellId === cell.id ? markdownInsertion : null
            }
            excalidrawImageInsertion={
              excalidrawImageInsertion?.cellId === cell.id
                ? excalidrawImageInsertion
                : null
            }
            isDarkMode={isDarkMode}
            isTouchDrawingEnabled={isTouchDrawingEnabled}
            showLegacyDrawingControls={showLegacyDrawingControls}
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
            onSelectCell={onSelectCell}
            onRegisterExcalidrawFlush={onRegisterExcalidrawFlush}
            onExcalidrawImageInsertionHandled={
              onExcalidrawImageInsertionHandled
            }
            onFocusedCellHandled={onFocusedCellHandled}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
