"use client";
import { primaryButtonClass } from "@/components/ui/buttonStyles";
import type { Notebook } from "@/lib/types";
import { getNotebookSearchPreview } from "@/lib/utils";

interface NotebookSidebarProps {
  notebooks: Notebook[];
  activeNotebookId: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: () => void;
  onDeleteNotebook: (id: string) => void;
}

export default function NotebookSidebar({
  notebooks,
  activeNotebookId,
  searchQuery,
  onSearchChange,
  onSelectNotebook,
  onCreateNotebook,
  onDeleteNotebook,
}: NotebookSidebarProps) {
  return (
    <aside className="w-full border-b border-slate-200 bg-white md:w-72 md:border-r md:border-b-0">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Notebook</h1>
          <button
            type="button"
            onClick={onCreateNotebook}
            className={primaryButtonClass}
          >
            + New Notebook
          </button>
        </div>
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search notebooks..."
          className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        />
      </div>
      <nav className="space-y-1 p-2">
        {notebooks.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-400">
            No notebooks found.
          </p>
        ) : (
          notebooks.map((notebook) => {
            const isActive = notebook.id === activeNotebookId;
            const searchPreview = getNotebookSearchPreview(
              notebook,
              searchQuery,
            );
            return (
              <div
                key={notebook.id}
                className={`group flex items-center gap-2 rounded-md px-2 py-1 transition-colors ${
                  isActive ? "bg-slate-900" : "hover:bg-slate-100"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectNotebook(notebook.id)}
                  className={`min-w-0 flex-1 rounded px-1 py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                    isActive ? "text-white" : "text-slate-700"
                  }`}
                >
                  <span className="block truncate font-medium">
                    {notebook.title}
                  </span>

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
          })
        )}
      </nav>
    </aside>
  );
}
