"use client";

import { useEffect, useRef, useState } from "react";
import NotebookEditor from "@/components/notebook/NotebookEditor";
import NotebookSidebar from "@/components/notebook/NotebookSidebar";
import {
  createRemoteCell,
  createRemoteNotebook,
  deleteRemoteCell,
  deleteRemoteNotebook,
  duplicateRemoteCell,
  loadRemoteNotebooks,
  reorderRemoteCells,
  updateRemoteCell,
} from "@/lib/client/notebook-api";
import {
  createNotebookExport,
  parseNotebookExport,
} from "@/lib/notebook-storage";
import type {
  Notebook,
  NotebookCell,
  NotebookUpdate,
  UpdateCellInput,
} from "@/lib/types";
import {
  applyCellHeightUpdate,
  applyDrawingCellUpdate,
  applyNotebookUpdate,
  applyTextCellUpdate,
  createDefaultNotebook,
  deleteCell,
  insertCellAfter,
  moveCellDown,
  moveCellUp,
  moveItem,
  notebookMatchesSearch,
} from "@/lib/utils";
import { primaryButtonClass } from "../ui/buttonStyles";

export default function NotebookApp() {
  async function createNotebook() {
    try {
      const notebook = await createRemoteNotebook({
        title: "New note",
      });

      setNotebooks((currentNotebooks) => [notebook, ...currentNotebooks]);
      setActiveNotebookId(notebook.id);
    } catch {
      window.alert("Could not create notebook.");
    }
  }

  async function deleteNotebook(id: string) {
    const shouldDelete = window.confirm("Delete this notebook?");

    if (!shouldDelete) {
      return;
    }

    try {
      await deleteRemoteNotebook(id);

      setNotebooks((currentNotebooks) => {
        const remaining = currentNotebooks.filter(
          (notebook) => notebook.id !== id,
        );

        if (remaining.length === 0) {
          setActiveNotebookId("");
          return [];
        }

        if (activeNotebookId === id) {
          setActiveNotebookId(remaining[0].id);
        }

        return remaining;
      });
    } catch {
      window.alert("Could not delete notebook.");
    }
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

  async function addTextCell() {
    if (!activeNotebook) {
      return;
    }

    try {
      const newCell = await createRemoteCell(activeNotebook.id, {
        type: "text",
      });

      updateNotebook({
        cells: [...activeNotebook.cells, newCell],
      });

      setFocusedCellId(newCell.id);
    } catch {
      window.alert("Could not create text cell.");
    }
  }

  async function addDrawingCell() {
    if (!activeNotebook) {
      return;
    }

    try {
      const newCell = await createRemoteCell(activeNotebook.id, {
        type: "drawing",
      });

      updateNotebook({
        cells: [...activeNotebook.cells, newCell],
      });
    } catch {
      window.alert("Could not create drawing cell.");
    }
  }

  const pendingCellUpdatesRef = useRef(new Map<string, UpdateCellInput>());
  const cellSaveTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  function queueCellSave(cellId: string, input: UpdateCellInput) {
    const existingInput = pendingCellUpdatesRef.current.get(cellId) ?? {};
    const nextInput = {
      ...existingInput,
      ...input,
    };

    pendingCellUpdatesRef.current.set(cellId, nextInput);

    const existingTimer = cellSaveTimersRef.current.get(cellId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const nextTimer = setTimeout(async () => {
      const inputToSave = pendingCellUpdatesRef.current.get(cellId);

      if (!inputToSave) {
        cellSaveTimersRef.current.delete(cellId);
        return;
      }

      try {
        await updateRemoteCell(cellId, inputToSave);

        if (pendingCellUpdatesRef.current.get(cellId) === inputToSave) {
          pendingCellUpdatesRef.current.delete(cellId);
        }
      } catch {
        window.alert("Could not save cell.");
      } finally {
        if (cellSaveTimersRef.current.get(cellId) === nextTimer) {
          cellSaveTimersRef.current.delete(cellId);
        }
      }
    }, 600);

    cellSaveTimersRef.current.set(cellId, nextTimer);
  }

  useEffect(() => {
    return () => {
      for (const timer of cellSaveTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  function updateTextCell(cellId: string, content: string) {
    if (!activeNotebook) {
      return;
    }
    updateNotebook({
      cells: activeNotebook.cells.map((cell) =>
        cell.id === cellId && cell.type === "text"
          ? applyTextCellUpdate(cell, content)
          : cell,
      ),
    });

    queueCellSave(cellId, { content });
  }

  function updateDrawingCell(cellId: string, drawing: string | null) {
    if (!activeNotebook) {
      return;
    }
    updateNotebook({
      cells: activeNotebook.cells.map((cell) =>
        cell.id === cellId && cell.type === "drawing"
          ? applyDrawingCellUpdate(cell, drawing)
          : cell,
      ),
    });

    queueCellSave(cellId, { drawing });
  }

  function updateCellHeight(cellId: string, heightPx: number) {
    if (!activeNotebook) {
      return;
    }
    updateNotebook({
      cells: activeNotebook.cells.map((cell) =>
        cell.id === cellId ? applyCellHeightUpdate(cell, heightPx) : cell,
      ),
    });

    queueCellSave(cellId, { heightPx });
  }

  async function addTextCellAfter(cellId: string) {
    if (!activeNotebook) {
      return;
    }

    try {
      const newCell = await createRemoteCell(activeNotebook.id, {
        type: "text",
        afterCellId: cellId,
      });

      updateNotebook({
        cells: insertCellAfter(activeNotebook.cells, cellId, newCell),
      });

      setFocusedCellId(newCell.id);
    } catch {
      window.alert("Could not create text cell.");
    }
  }

  async function addDrawingCellAfter(cellId: string) {
    if (!activeNotebook) {
      return;
    }

    try {
      const newCell = await createRemoteCell(activeNotebook.id, {
        type: "drawing",
        afterCellId: cellId,
      });

      updateNotebook({
        cells: insertCellAfter(activeNotebook.cells, cellId, newCell),
      });
    } catch {
      window.alert("Could not create drawing cell.");
    }
  }

  function clearQueuedCellSave(cellId: string) {
    const existingTimer = cellSaveTimersRef.current.get(cellId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    cellSaveTimersRef.current.delete(cellId);
    pendingCellUpdatesRef.current.delete(cellId);
  }

  function haveSameCellOrder(
    currentCells: NotebookCell[],
    nextCells: NotebookCell[],
  ): boolean {
    return currentCells.every(
      (cell, index) => cell.id === nextCells[index]?.id,
    );
  }

  async function removeCell(cellId: string) {
    if (!activeNotebook) {
      return;
    }

    try {
      await deleteRemoteCell(cellId);
      clearQueuedCellSave(cellId);

      const nextCells = deleteCell(activeNotebook.cells, cellId);

      updateNotebook({
        cells: nextCells,
      });
    } catch {
      window.alert("Could not delete cell.");
    }
  }

  async function copyCell(cellId: string) {
    if (!activeNotebook) {
      return;
    }

    try {
      await flushQueuedCellSave(cellId);

      const copiedCell = await duplicateRemoteCell(cellId);

      updateNotebook({
        cells: insertCellAfter(activeNotebook.cells, cellId, copiedCell),
      });
    } catch {
      window.alert("Could not copy cell.");
    }
  }

  function moveCellEarlier(cellId: string) {
    if (!activeNotebook) {
      return;
    }

    const nextCells = moveCellUp(activeNotebook.cells, cellId);

    if (haveSameCellOrder(activeNotebook.cells, nextCells)) {
      return;
    }

    updateNotebook({
      cells: nextCells,
    });

    saveCellOrder(nextCells);
  }

  function moveCellLater(cellId: string) {
    if (!activeNotebook) {
      return;
    }

    const nextCells = moveCellDown(activeNotebook.cells, cellId);

    if (haveSameCellOrder(activeNotebook.cells, nextCells)) {
      return;
    }

    updateNotebook({
      cells: nextCells,
    });

    saveCellOrder(nextCells);
  }

  function reorderCells(fromIndex: number, toIndex: number) {
    if (!activeNotebook) {
      return;
    }

    const nextCells = moveItem(activeNotebook.cells, fromIndex, toIndex);

    if (haveSameCellOrder(activeNotebook.cells, nextCells)) {
      return;
    }

    updateNotebook({
      cells: nextCells,
    });

    saveCellOrder(nextCells);
  }

  async function flushQueuedCellSave(cellId: string) {
    const existingTimer = cellSaveTimersRef.current.get(cellId);
    const inputToSave = pendingCellUpdatesRef.current.get(cellId);

    if (existingTimer) {
      clearTimeout(existingTimer);
      cellSaveTimersRef.current.delete(cellId);
    }

    if (!inputToSave) {
      return;
    }

    await updateRemoteCell(cellId, inputToSave);

    if (pendingCellUpdatesRef.current.get(cellId) === inputToSave) {
      pendingCellUpdatesRef.current.delete(cellId);
    }
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

  async function saveCellOrder(cells: NotebookCell[]) {
    if (!activeNotebook) {
      return;
    }

    try {
      await reorderRemoteCells(activeNotebook.id, {
        cellIds: cells.map((cell) => cell.id),
      });
    } catch {
      window.alert("Could not save cell order.");
    }
  }

  const activeNotebook =
    notebooks.find((notebook) => notebook.id === activeNotebookId) ?? null;

  const [searchQuery, setSearchQuery] = useState("");
  const filteredNotebooks = notebooks.filter((notebook) =>
    notebookMatchesSearch(notebook, searchQuery),
  );
  const [focusedCellId, setFocusedCellId] = useState<string | null>(null);

  useEffect(() => {
    async function loadNotebooks() {
      try {
        const remoteNotebooks = await loadRemoteNotebooks();

        setNotebooks(remoteNotebooks);
        setActiveNotebookId(remoteNotebooks[0]?.id ?? "");
      } catch {
        window.alert("Could not load notebooks from the server.");
      }
    }

    loadNotebooks();
  }, []);

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
      {activeNotebook ? (
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
      ) : (
        <section className="flex min-w-0 flex-1 items-center justify-center bg-slate-50 px-6 py-12">
          <div className="max-w-sm text-center">
            <h2 className="text-lg font-semibold text-slate-900">
              No notebook selected
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Create a notebook to start writing.
            </p>
            <button
              type="button"
              onClick={createNotebook}
              className={[primaryButtonClass, "mt-4 px-4"].join(" ")}
            >
              New notebook
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
