import { useSortable } from "@dnd-kit/react/sortable";
import type { Notebook } from "@/lib/types";

interface NotebookSidebarRowProps {
  notebook: Notebook;
  index: number;
  isActive: boolean;
  searchPreview: string | null;
  isReorderDisabled: boolean;
  onSelectNotebook: (id: string) => void;
  onDeleteNotebook: (id: string) => void;
}

export default function NotebookSidebarRow({
  notebook,
  index,
  isActive,
  searchPreview,
  isReorderDisabled,
  onSelectNotebook,
  onDeleteNotebook,
}: NotebookSidebarRowProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: notebook.id,
    index,
    disabled: isReorderDisabled,
  });
  return (
    <div
      ref={ref}
      className={`group flex items-center gap-2 rounded-md px-2 py-1 transition-colors ${
        isActive ? "bg-slate-900" : "hover:bg-slate-100"
      }
        ${isDragging ? "opacity-60 shadow-lg" : ""}`}
    >
      <button
        ref={handleRef}
        type="button"
        className={`h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium ${
          isReorderDisabled
            ? "cursor-not-allowed text-slate-300"
            : "cursor-grab text-slate-500 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        }`}
        aria-label="Drag notebook"
        title={
          isReorderDisabled
            ? "Clear search to reorder notebooks"
            : "Drag notebook"
        }
        disabled={isReorderDisabled}
      >
        Drag
      </button>
      <button
        type="button"
        onClick={() => onSelectNotebook(notebook.id)}
        className={`min-w-0 flex-1 rounded px-1 py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
          isActive ? "text-white" : "text-slate-700"
        }`}
      >
        <span className="block truncate font-medium">{notebook.title}</span>

        {searchPreview ? (
          <span
            className={`mt-1 block truncate text-xs ${
              isActive ? "text-slate-300" : "text-slate-500"
            }`}
          >
            {searchPreview}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => onDeleteNotebook(notebook.id)}
        className={`h-8 w-8 shrink-0 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
          isActive
            ? "text-slate-300 hover:bg-slate-800 hover:text-white"
            : "text-slate-400 hover:bg-red-50 hover:text-red-600"
        }`}
        aria-label={`Delete ${notebook.title}`}
      >
        x
      </button>
    </div>
  );
}
