import CellFrame from "@/components/notebook/CellFrame";
import type { NotebookCell } from "@/lib/types";

interface CellListProps {
  cells: NotebookCell[];
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

export default function CellList({
  cells,
  onUpdateTextCell,
  onUpdateDrawingCell,
  onUpdateCellHeight,
  onAddTextCellAfter,
  onAddDrawingCellAfter,
  onRemoveCell,
  onCopyCell,
  onMoveCellUp,
  onMoveCellDown,
}: CellListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      {cells.map((cell) => (
        <CellFrame
          key={cell.id}
          cell={cell}
          onUpdateTextCell={onUpdateTextCell}
          onUpdateDrawingCell={onUpdateDrawingCell}
          onUpdateCellHeight={onUpdateCellHeight}
          onAddTextCellAfter={onAddTextCellAfter}
          onAddDrawingCellAfter={onAddDrawingCellAfter}
          onRemoveCell={onRemoveCell}
          onCopyCell={onCopyCell}
          onMoveCellUp={onMoveCellUp}
          onMoveCellDown={onMoveCellDown}
        />
      ))}
    </div>
  );
}
