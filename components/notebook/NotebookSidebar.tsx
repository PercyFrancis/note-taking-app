"use client";
import { UserButton } from "@clerk/nextjs";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { primaryButtonClass } from "@/components/ui/buttonStyles";
import type { Notebook } from "@/lib/types";
import { getNotebookSearchPreview } from "@/lib/utils";
import NotebookSidebarRow from "./NotebookSidebarRow";

interface NotebookSidebarProps {
  notebooks: Notebook[];
  activeNotebookId: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: () => void;
  onDeleteNotebook: (id: string) => void;
  onReorderNotebooks: (fromIndex: number, toIndex: number) => void;
}

export default function NotebookSidebar({
  notebooks,
  activeNotebookId,
  searchQuery,
  onSearchChange,
  onSelectNotebook,
  onCreateNotebook,
  onDeleteNotebook,
  onReorderNotebooks,
}: NotebookSidebarProps) {
  const isReorderDisabled = searchQuery.trim() !== "";
  return (
    <aside className="w-full border-b border-slate-200 bg-white md:w-72 md:border-r md:border-b-0">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Notebook</h1>
          <UserButton />
        </div>
        <div className="flex items-center justify-between mt-3">
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
          <DragDropProvider
            onDragEnd={(event) => {
              if (isReorderDisabled) return;

              if (event.canceled) return;

              const { source } = event.operation;

              if (!isSortable(source)) return;

              const { initialIndex, index } = source;

              if (initialIndex === index) return;

              onReorderNotebooks(initialIndex, index);
            }}
          >
            {notebooks.map((notebook, index) => {
              const isActive = notebook.id === activeNotebookId;
              const searchPreview = getNotebookSearchPreview(
                notebook,
                searchQuery,
              );

              return (
                <NotebookSidebarRow
                  key={notebook.id}
                  notebook={notebook}
                  index={index}
                  isActive={isActive}
                  searchPreview={searchPreview}
                  isReorderDisabled={isReorderDisabled}
                  onDeleteNotebook={onDeleteNotebook}
                  onSelectNotebook={onSelectNotebook}
                />
              );
            })}
          </DragDropProvider>
        )}
      </nav>
    </aside>
  );
}
