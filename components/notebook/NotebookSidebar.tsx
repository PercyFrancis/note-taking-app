"use client";
import type { Notebook } from "@/lib/types";

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
    <aside className="w-72 border-r border-slate-200 bg-white">
      <div className="p-4">
        <h1 className="text-lg font-semibold">Notebook</h1>
      </div>
      <button
        type="button"
        onClick={onCreateNotebook}
        className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        + New Notebook
      </button>

      <input
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search notebooks..."
        className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
      <nav className="space-y-2 p-3">
        {notebooks.map((notebook) => {
          const isActive = notebook.id === activeNotebookId;

          return (
            <div
              key={notebook.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                isActive ? "bg-slate-900" : "hover:bg-slate-100"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectNotebook(notebook.id)}
                className={`min-w-0 flex-1 px-1 py-1 text-left text-sm ${
                  isActive ? "text-white" : "text-slate-700"
                }`}
              >
                <span className="block truncate">{notebook.title}</span>
              </button>

              <button
                type="button"
                onClick={() => onDeleteNotebook(notebook.id)}
                className={`rounded px-2 py-1 text-sm ${
                  isActive
                    ? "text-slate-300 hover:text-white"
                    : "text-slate-400 hover:text-red-600"
                }`}
                aria-label={`Delete ${notebook.title}`}
              >
                x
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
