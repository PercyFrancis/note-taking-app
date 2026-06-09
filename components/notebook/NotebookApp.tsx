"use client";

import { useState } from "react";
import NotebookEditor from "@/components/notebook/NotebookEditor";
import NotebookSidebar from "@/components/notebook/NotebookSidebar";
import type { Notebook, NotebookUpdate } from "@/lib/types";
import {
  applyCellHeightUpdate,
  applyDrawingCellUpdate,
  applyNotebookUpdate,
  applyTextCellUpdate,
  createDefaultNotebook,
  createDrawingCell,
  createTextCell,
} from "@/lib/utils";

export default function NotebookApp() {
  function createNotebook() {
    const notebook = createDefaultNotebook();

    setNotebooks((currentNotebooks) => [notebook, ...currentNotebooks]);
    setActiveNotebookId(notebook.id);
  }

  function deleteNotebook(id: string) {
    const shouldDelete = window.confirm("Delete this notebook?");

    if (!shouldDelete) {
      return;
    }

    setNotebooks((currentNotebooks) => {
      const remaining = currentNotebooks.filter(
        (notebook) => notebook.id !== id,
      );

      if (remaining.length === 0) {
        const replacement = createDefaultNotebook();
        setActiveNotebookId(replacement.id);
        return [replacement];
      }

      if (activeNotebookId === id) {
        setActiveNotebookId(remaining[0].id);
      }

      return remaining;
    });
  }

  function updateNotebook(fields: NotebookUpdate) {
    setNotebooks((currentNotebooks) =>
      currentNotebooks.map((notebook) =>
        notebook.id === activeNotebookId
          ? applyNotebookUpdate(notebook, fields)
          : notebook,
      ),
    );
  }

  function addTextCell() {
    updateNotebook({
      cells: [...activeNotebook.cells, createTextCell()],
    });
  }

  function addDrawingCell() {
    updateNotebook({
      cells: [...activeNotebook.cells, createDrawingCell()],
    });
  }

  function updateTextCell(cellId: string, content: string) {
    updateNotebook({
      cells: activeNotebook.cells.map((cell) =>
        cell.id === cellId && cell.type === "text"
          ? applyTextCellUpdate(cell, content)
          : cell,
      ),
    });
  }

  function updateDrawingCell(cellId: string, drawing: string | null) {
    updateNotebook({
      cells: activeNotebook.cells.map((cell) =>
        cell.id === cellId && cell.type === "drawing"
          ? applyDrawingCellUpdate(cell, drawing)
          : cell,
      ),
    });
  }

  function updateCellHeight(cellId: string, heightPx: number) {
    updateNotebook({
      cells: activeNotebook.cells.map((cell) =>
        cell.id === cellId ? applyCellHeightUpdate(cell, heightPx) : cell,
      ),
    });
  }

  const [notebooks, setNotebooks] = useState<Notebook[]>(() => {
    const notebook = createDefaultNotebook();
    return [notebook];
  });

  const [activeNotebookId, setActiveNotebookId] = useState<string>(() => {
    return notebooks[0].id;
  });

  const activeNotebook =
    notebooks.find((notebook) => notebook.id === activeNotebookId) ??
    notebooks[0];

  const [searchQuery, setSearchQuery] = useState("");
  const filteredNotebooks = notebooks.filter((notebook) =>
    notebook.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <NotebookSidebar
        notebooks={filteredNotebooks}
        activeNotebookId={activeNotebookId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectNotebook={setActiveNotebookId}
        onCreateNotebook={createNotebook}
        onDeleteNotebook={deleteNotebook}
      />

      <NotebookEditor
        notebook={activeNotebook}
        onUpdateNotebook={updateNotebook}
        onAddTextCell={addTextCell}
        onUpdateTextCell={updateTextCell}
        onAddDrawingCell={addDrawingCell}
        onUpdateDrawingCell={updateDrawingCell}
        onUpdateCellHeight={updateCellHeight}
      />
    </main>
  );
}
