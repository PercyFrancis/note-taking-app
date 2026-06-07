import CellFrame from "@/components/notebook/CellFrame";
import type { NotebookCell } from "@/lib/types";

interface CellListProps {
  cells: NotebookCell[];
  onUpdateTextCell: (cellId: string, content: string) => void;
}

export default function CellList({ cells, onUpdateTextCell }: CellListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      {cells.map((cell) => (
        <CellFrame
          key={cell.id}
          cell={cell}
          onUpdateTextCell={onUpdateTextCell}
        />
      ))}
    </div>
  );
}
