import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import CellFrame from "@/components/notebook/CellFrame";
import type { NotebookCell } from "@/lib/types";

interface CellListProps {
  cells: NotebookCell[];
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
  onReorderCells: (fromIndex: number, toIndex: number) => void;
  onFocusedCellHandled: () => void;
}

export default function CellList({
  cells,
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
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
        {cells.map((cell, index) => (
          <CellFrame
            key={cell.id}
            cell={cell}
            index={index}
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
            onFocusedCellHandled={onFocusedCellHandled}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
