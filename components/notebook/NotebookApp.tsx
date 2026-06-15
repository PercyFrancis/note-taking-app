"use client";

import { useEffect, useState } from "react";
import NotebookEditor from "@/components/notebook/NotebookEditor";
import NotebookSidebar from "@/components/notebook/NotebookSidebar";
import {
  createNotebookExport,
  loadStoredNotebooks,
  parseNotebookExport,
  saveStoredNotebooks,
} from "@/lib/notebook-storage";
import type { Notebook, NotebookUpdate } from "@/lib/types";
import {
  applyCellHeightUpdate,
  applyDrawingCellUpdate,
  applyNotebookUpdate,
  applyTextCellUpdate,
  createDefaultNotebook,
  createDrawingCell,
  createTextCell,
  deleteCell,
  duplicateCell,
  insertCellAfter,
  moveCellDown,
  moveCellUp,
  moveItem,
  notebookMatchesSearch,
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
    const newCell = createTextCell();

    updateNotebook({
      cells: [...activeNotebook.cells, newCell],
    });

    setFocusedCellId(newCell.id);
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

  function addTextCellAfter(cellId: string) {
    const newCell = createTextCell();

    updateNotebook({
      cells: insertCellAfter(activeNotebook.cells, cellId, newCell),
    });

    setFocusedCellId(newCell.id);
  }

  function addDrawingCellAfter(cellId: string) {
    updateNotebook({
      cells: insertCellAfter(activeNotebook.cells, cellId, createDrawingCell()),
    });
  }

  function removeCell(cellId: string) {
    const nextCells = deleteCell(activeNotebook.cells, cellId);

    updateNotebook({
      cells: nextCells.length > 0 ? nextCells : [createTextCell()],
    });
  }

  function copyCell(cellId: string) {
    updateNotebook({
      cells: duplicateCell(activeNotebook.cells, cellId),
    });
  }

  function moveCellEarlier(cellId: string) {
    updateNotebook({
      cells: moveCellUp(activeNotebook.cells, cellId),
    });
  }

  function moveCellLater(cellId: string) {
    updateNotebook({
      cells: moveCellDown(activeNotebook.cells, cellId),
    });
  }

  function reorderCells(fromIndex: number, toIndex: number) {
    updateNotebook({
      cells: moveItem(activeNotebook.cells, fromIndex, toIndex),
    });
  }

  const [notebooks, setNotebooks] = useState<Notebook[]>(() => {
    const notebook = createDefaultNotebook();
    return [notebook];
  });

  const [activeNotebookId, setActiveNotebookId] = useState<string>(() => {
    return notebooks[0].id;
  });

  function exportNotebooks() {
    const exportData = createNotebookExport(notebooks);
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `notebooks-${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  async function importNotebooks(file: File) {
    try {
      const fileText = await file.text();
      const importedNotebooks = parseNotebookExport(fileText);

      if (!importedNotebooks) {
        window.alert("This file is not a valid notebook export.");
        return;
      }

      const shouldImport = window.confirm(
        "Importing will replace your current notebooks. Continue?",
      );

      if (!shouldImport) {
        return;
      }

      setNotebooks(importedNotebooks);
      setActiveNotebookId(importedNotebooks[0].id);
    } catch {
      window.alert("The selected file could not be read.");
    }
  }

  const activeNotebook =
    notebooks.find((notebook) => notebook.id === activeNotebookId) ??
    notebooks[0];

  const [searchQuery, setSearchQuery] = useState("");
  const filteredNotebooks = notebooks.filter((notebook) =>
    notebookMatchesSearch(notebook, searchQuery),
  );
  const [focusedCellId, setFocusedCellId] = useState<string | null>(null);

  const [hasLoadedStoredNotebooks, setHasLoadedStoredNotebooks] =
    useState(false);

  useEffect(() => {
    const storedNotebooks = loadStoredNotebooks();

    if (storedNotebooks && storedNotebooks.length > 0) {
      setNotebooks(storedNotebooks);
      setActiveNotebookId(storedNotebooks[0].id);
    }

    setHasLoadedStoredNotebooks(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredNotebooks) {
      return;
    }

    saveStoredNotebooks(notebooks);
  }, [notebooks, hasLoadedStoredNotebooks]);
  return (
    <main className="flex min-h-screen flex-col bg-slate-100 text-slate-950 md:flex-row">
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
        focusedCellId={focusedCellId}
        onUpdateNotebook={updateNotebook}
        onAddTextCell={addTextCell}
        onUpdateTextCell={updateTextCell}
        onAddDrawingCell={addDrawingCell}
        onUpdateDrawingCell={updateDrawingCell}
        onUpdateCellHeight={updateCellHeight}
        onAddDrawingCellAfter={addDrawingCellAfter}
        onAddTextCellAfter={addTextCellAfter}
        onRemoveCell={removeCell}
        onCopyCell={copyCell}
        onMoveCellUp={moveCellEarlier}
        onMoveCellDown={moveCellLater}
        onReorderCells={reorderCells}
        onFocusedCellHandled={() => setFocusedCellId(null)}
        onExportNotebooks={exportNotebooks}
        onImportNotebooks={importNotebooks}
      />
    </main>
  );
}
