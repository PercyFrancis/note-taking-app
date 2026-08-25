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
  importRemoteNotebooks,
  loadRemoteNotebooks,
  reorderRemoteCells,
  reorderRemoteNotebooks,
  restoreRemoteCell,
  updateRemoteCell,
  updateRemoteNotebook,
} from "@/lib/client/notebook-api";
import {
  createNotebookExport,
  parseNotebookExport,
} from "@/lib/notebook-storage";
import type {
  ImportNotebooksInput,
  Notebook,
  NotebookCell,
  NotebookUpdate,
  UpdateCellInput,
  UpdateNotebookInput,
} from "@/lib/types";
import {
  applyCellHeightUpdate,
  applyDrawingCellUpdate,
  applyNotebookUpdate,
  applyTextCellUpdate,
  deleteCell,
  insertCellAfter,
  moveCellDown,
  moveCellUp,
  moveItem,
  notebookMatchesSearch,
} from "@/lib/utils";
import { primaryButtonClass } from "../ui/buttonStyles";
import ImportNotebookDialog from "./ImportNotebookDialog";

const STRUCTURAL_HISTORY_LIMIT = 50;

type CellPresenceHistoryEntry = {
  kind: "cell-presence";
  label: string;
  cell: NotebookCell;
  position: number;
  presentBefore: boolean;
};

type CellOrderHistoryEntry = {
  kind: "cell-order";
  label: string;
  beforeCellIds: string[];
  afterCellIds: string[];
};

type StructuralHistoryEntry = CellPresenceHistoryEntry | CellOrderHistoryEntry;

type NotebookHistory = {
  undo: StructuralHistoryEntry[];
  redo: StructuralHistoryEntry[];
};

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

      setHistoryByNotebook((currentHistory) => {
        const { [id]: _deletedHistory, ...remainingHistory } = currentHistory;
        return remainingHistory;
      });

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

    if (fields.title !== undefined && activeNotebookId !== "") {
      queueNotebookTitleSave(activeNotebookId, { title: fields.title });
    }
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

      recordStructuralHistory(activeNotebook.id, {
        kind: "cell-presence",
        label: "Add text cell",
        cell: newCell,
        position: activeNotebook.cells.length,
        presentBefore: false,
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
        type: "excalidraw",
      });

      updateNotebook({
        cells: [...activeNotebook.cells, newCell],
      });

      recordStructuralHistory(activeNotebook.id, {
        kind: "cell-presence",
        label: "Add drawing cell",
        cell: newCell,
        position: activeNotebook.cells.length,
        presentBefore: false,
      });
    } catch {
      window.alert("Could not create drawing cell.");
    }
  }

  async function addLegacyDrawingCell() {
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

      recordStructuralHistory(activeNotebook.id, {
        kind: "cell-presence",
        label: "Add legacy canvas cell",
        cell: newCell,
        position: activeNotebook.cells.length,
        presentBefore: false,
      });
    } catch {
      window.alert("Could not create legacy canvas cell.");
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

  const notebookTitleSaveTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  function queueNotebookTitleSave(
    notebookId: string,
    input: UpdateNotebookInput,
  ) {
    const existingTimer = notebookTitleSaveTimersRef.current.get(notebookId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const nextTimer = setTimeout(async () => {
      try {
        await updateRemoteNotebook(notebookId, input);
      } catch {
        window.alert("Could not save notebook.");
      } finally {
        if (notebookTitleSaveTimersRef.current.get(notebookId) === nextTimer) {
          notebookTitleSaveTimersRef.current.delete(notebookId);
        }
      }
    }, 600);

    notebookTitleSaveTimersRef.current.set(notebookId, nextTimer);
  }

  useEffect(() => {
    return () => {
      for (const timer of notebookTitleSaveTimersRef.current.values()) {
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

  function updateTextCells(updates: ReadonlyMap<string, string>) {
    if (!activeNotebook || updates.size === 0) {
      return;
    }

    updateNotebook({
      cells: activeNotebook.cells.map((cell) => {
        const content = updates.get(cell.id);

        return cell.type === "text" && content !== undefined
          ? applyTextCellUpdate(cell, content)
          : cell;
      }),
    });

    for (const [cellId, content] of updates) {
      queueCellSave(cellId, { content });
    }
  }

  function updateDrawingCell(cellId: string, drawing: string | null) {
    if (!activeNotebook) {
      return;
    }

    const currentCell = activeNotebook.cells.find((cell) => cell.id === cellId);

    if (
      !currentCell ||
      currentCell.type === "text" ||
      currentCell.drawing === drawing
    ) {
      return;
    }

    updateNotebook({
      cells: activeNotebook.cells.map((cell) =>
        cell.id === cellId && cell.type !== "text"
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

      recordStructuralHistory(activeNotebook.id, {
        kind: "cell-presence",
        label: "Add text cell",
        cell: newCell,
        position:
          activeNotebook.cells.findIndex((cell) => cell.id === cellId) + 1,
        presentBefore: false,
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
        type: "excalidraw",
        afterCellId: cellId,
      });

      updateNotebook({
        cells: insertCellAfter(activeNotebook.cells, cellId, newCell),
      });

      recordStructuralHistory(activeNotebook.id, {
        kind: "cell-presence",
        label: "Add drawing cell",
        cell: newCell,
        position:
          activeNotebook.cells.findIndex((cell) => cell.id === cellId) + 1,
        presentBefore: false,
      });
    } catch {
      window.alert("Could not create drawing cell.");
    }
  }

  async function addLegacyDrawingCellAfter(cellId: string) {
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

      recordStructuralHistory(activeNotebook.id, {
        kind: "cell-presence",
        label: "Add legacy canvas cell",
        cell: newCell,
        position:
          activeNotebook.cells.findIndex((cell) => cell.id === cellId) + 1,
        presentBefore: false,
      });
    } catch {
      window.alert("Could not create legacy canvas cell.");
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

    const position = activeNotebook.cells.findIndex(
      (cell) => cell.id === cellId,
    );
    const deletedCell = activeNotebook.cells[position];

    if (!deletedCell || position < 0) {
      return;
    }

    try {
      await deleteRemoteCell(cellId);
      clearQueuedCellSave(cellId);

      const nextCells = deleteCell(activeNotebook.cells, cellId);

      updateNotebook({
        cells: nextCells,
      });

      recordStructuralHistory(activeNotebook.id, {
        kind: "cell-presence",
        label: "Delete cell",
        cell: deletedCell,
        position,
        presentBefore: true,
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

      recordStructuralHistory(activeNotebook.id, {
        kind: "cell-presence",
        label: "Duplicate cell",
        cell: copiedCell,
        position:
          activeNotebook.cells.findIndex((cell) => cell.id === cellId) + 1,
        presentBefore: false,
      });
    } catch {
      window.alert("Could not copy cell.");
    }
  }

  async function moveCellEarlier(cellId: string) {
    if (!activeNotebook) {
      return;
    }

    const nextCells = moveCellUp(activeNotebook.cells, cellId);

    if (haveSameCellOrder(activeNotebook.cells, nextCells)) {
      return;
    }

    await persistCellOrderChange(activeNotebook, nextCells, "Move cell up");
  }

  async function moveCellLater(cellId: string) {
    if (!activeNotebook) {
      return;
    }

    const nextCells = moveCellDown(activeNotebook.cells, cellId);

    if (haveSameCellOrder(activeNotebook.cells, nextCells)) {
      return;
    }

    await persistCellOrderChange(activeNotebook, nextCells, "Move cell down");
  }

  async function reorderCells(fromIndex: number, toIndex: number) {
    if (!activeNotebook) {
      return;
    }

    const nextCells = moveItem(activeNotebook.cells, fromIndex, toIndex);

    if (haveSameCellOrder(activeNotebook.cells, nextCells)) {
      return;
    }

    await persistCellOrderChange(activeNotebook, nextCells, "Reorder cells");
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

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState("");
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(true);
  const [historyByNotebook, setHistoryByNotebook] = useState<
    Record<string, NotebookHistory>
  >({});
  const [isHistoryBusy, setIsHistoryBusy] = useState(false);
  const historyBusyRef = useRef(false);
  const pendingCellOrderNotebookIdsRef = useRef(new Set<string>());

  useEffect(() => {
    async function loadNotebooks() {
      try {
        const remoteNotebooks = await loadRemoteNotebooks();

        setNotebooks(remoteNotebooks);
        setActiveNotebookId(remoteNotebooks[0]?.id ?? "");
      } catch {
        window.alert("Could not load notebooks from the server.");
      } finally {
        setIsLoadingNotebooks(false);
      }
    }

    loadNotebooks();
  }, []);

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

  type PendingImport = {
    fileName: string;
    notebooks: Notebook[];
  };

  const [pendingImport, setPendingImport] = useState<PendingImport | null>(
    null,
  );
  const [isImporting, setIsImporting] = useState(false);

  async function importNotebooks(file: File) {
    try {
      const fileText = await file.text();
      const importedNotebooks = parseNotebookExport(fileText);

      if (!importedNotebooks) {
        window.alert("This file is not a valid notebook export.");
        return;
      }

      setPendingImport({
        fileName: file.name,
        notebooks: importedNotebooks,
      });
    } catch {
      window.alert("The selected file could not be read.");
    }
  }

  async function confirmNotebookImport(mode: "append" | "replace") {
    if (!pendingImport || isImporting) {
      return;
    }

    setIsImporting(true);
    try {
      const input: ImportNotebooksInput = {
        mode,
        notebooks: pendingImport.notebooks.map((notebook) => ({
          title: notebook.title,
          cells: notebook.cells.map((cell) => {
            if (cell.type === "text") {
              return {
                type: "text",
                content: cell.content,
                heightPx: cell.heightPx,
              };
            }

            return {
              type: "drawing",
              drawing: cell.drawing,
              heightPx: cell.heightPx,
            };
          }),
        })),
      };

      const nextNotebooks = await importRemoteNotebooks(input);

      setNotebooks(nextNotebooks);
      setActiveNotebookId(nextNotebooks[0]?.id ?? "");
      setHistoryByNotebook({});

      setPendingImport(null);
    } catch {
      window.alert("Could not import notebooks.");
    } finally {
      setIsImporting(false);
    }
  }

  function haveSameNotebookOrder(
    currentNotebooks: Notebook[],
    nextNotebooks: Notebook[],
  ): boolean {
    return currentNotebooks.every(
      (notebook, index) => notebook.id === nextNotebooks[index]?.id,
    );
  }

  function reorderNotebooks(fromIndex: number, toIndex: number) {
    const nextNotebooks = moveItem(notebooks, fromIndex, toIndex);

    if (haveSameNotebookOrder(notebooks, nextNotebooks)) {
      return;
    }

    setNotebooks(nextNotebooks);
    saveNotebookOrder(nextNotebooks);
  }

  async function saveNotebookOrder(notebooks: Notebook[]) {
    try {
      await reorderRemoteNotebooks({
        notebookIds: notebooks.map((notebook) => notebook.id),
      });
    } catch {
      window.alert("Could not save notebook order.");
    }
  }

  const activeNotebook =
    notebooks.find((notebook) => notebook.id === activeNotebookId) ?? null;

  function recordStructuralHistory(
    notebookId: string,
    entry: StructuralHistoryEntry,
  ) {
    setHistoryByNotebook((currentHistory) => {
      const notebookHistory = currentHistory[notebookId] ?? {
        undo: [],
        redo: [],
      };

      return {
        ...currentHistory,
        [notebookId]: {
          undo: [...notebookHistory.undo, entry].slice(
            -STRUCTURAL_HISTORY_LIMIT,
          ),
          redo: [],
        },
      };
    });
  }

  async function persistCellOrderChange(
    notebook: Notebook,
    nextCells: NotebookCell[],
    label: string,
  ) {
    if (pendingCellOrderNotebookIdsRef.current.has(notebook.id)) {
      return;
    }

    const beforeCellIds = notebook.cells.map((cell) => cell.id);
    const afterCellIds = nextCells.map((cell) => cell.id);
    pendingCellOrderNotebookIdsRef.current.add(notebook.id);

    try {
      await reorderRemoteCells(notebook.id, { cellIds: afterCellIds });

      setNotebooks((currentNotebooks) =>
        currentNotebooks.map((currentNotebook) => {
          if (currentNotebook.id !== notebook.id) {
            return currentNotebook;
          }

          const cellsById = new Map(
            currentNotebook.cells.map((cell) => [cell.id, cell]),
          );

          return {
            ...currentNotebook,
            cells: afterCellIds.flatMap((cellId) => {
              const cell = cellsById.get(cellId);
              return cell ? [cell] : [];
            }),
          };
        }),
      );

      recordStructuralHistory(notebook.id, {
        kind: "cell-order",
        label,
        beforeCellIds,
        afterCellIds,
      });
    } catch {
      window.alert("Could not save cell order.");
    } finally {
      pendingCellOrderNotebookIdsRef.current.delete(notebook.id);
    }
  }

  async function applyStructuralHistory(direction: "undo" | "redo") {
    if (!activeNotebook || historyBusyRef.current) {
      return;
    }

    const notebookId = activeNotebook.id;
    const notebookHistory = historyByNotebook[notebookId];
    const sourceStack = notebookHistory?.[direction] ?? [];
    const entry = sourceStack.at(-1);

    if (!entry) {
      return;
    }

    historyBusyRef.current = true;
    setIsHistoryBusy(true);

    try {
      let nextCells: NotebookCell[];
      let nextEntry = entry;

      if (entry.kind === "cell-order") {
        const targetIds =
          direction === "undo" ? entry.beforeCellIds : entry.afterCellIds;
        const cellsById = new Map(
          activeNotebook.cells.map((cell) => [cell.id, cell]),
        );
        nextCells = targetIds.flatMap((cellId) => {
          const cell = cellsById.get(cellId);
          return cell ? [cell] : [];
        });

        if (nextCells.length !== activeNotebook.cells.length) {
          throw new Error("Cell history no longer matches the notebook");
        }

        await reorderRemoteCells(notebookId, { cellIds: targetIds });
      } else {
        const shouldBePresent =
          direction === "undo" ? entry.presentBefore : !entry.presentBefore;
        const currentPosition = activeNotebook.cells.findIndex(
          (cell) => cell.id === entry.cell.id,
        );

        if (shouldBePresent) {
          if (currentPosition >= 0) {
            throw new Error("Cell is already present");
          }

          const position = Math.min(
            entry.position,
            activeNotebook.cells.length,
          );
          const restoredCell = await restoreRemoteCell(notebookId, {
            cell: entry.cell,
            position,
          });
          nextCells = [...activeNotebook.cells];
          nextCells.splice(position, 0, restoredCell);
          nextEntry = { ...entry, cell: restoredCell, position };
          setFocusedCellId(restoredCell.id);
        } else {
          if (currentPosition < 0) {
            throw new Error("Cell is already absent");
          }

          const currentCell = activeNotebook.cells[currentPosition];
          await flushQueuedCellSave(currentCell.id);
          await deleteRemoteCell(currentCell.id);
          clearQueuedCellSave(currentCell.id);
          nextCells = deleteCell(activeNotebook.cells, currentCell.id);
          nextEntry = {
            ...entry,
            cell: currentCell,
            position: currentPosition,
          };
        }
      }

      setNotebooks((currentNotebooks) =>
        currentNotebooks.map((notebook) =>
          notebook.id === notebookId
            ? { ...notebook, cells: nextCells }
            : notebook,
        ),
      );

      setHistoryByNotebook((currentHistory) => {
        const currentNotebookHistory = currentHistory[notebookId];

        if (!currentNotebookHistory) {
          return currentHistory;
        }

        const destination = direction === "undo" ? "redo" : "undo";

        return {
          ...currentHistory,
          [notebookId]: {
            ...currentNotebookHistory,
            [direction]: currentNotebookHistory[direction].slice(0, -1),
            [destination]: [
              ...currentNotebookHistory[destination],
              nextEntry,
            ].slice(-STRUCTURAL_HISTORY_LIMIT),
          },
        };
      });
    } catch {
      window.alert(
        direction === "undo"
          ? "Could not undo the last action."
          : "Could not redo the last action.",
      );
    } finally {
      historyBusyRef.current = false;
      setIsHistoryBusy(false);
    }
  }

  const activeHistory = historyByNotebook[activeNotebookId] ?? {
    undo: [],
    redo: [],
  };
  const nextUndoLabel = activeHistory.undo.at(-1)?.label ?? null;
  const nextRedoLabel = activeHistory.redo.at(-1)?.label ?? null;

  const [searchQuery, setSearchQuery] = useState("");
  const filteredNotebooks = notebooks.filter((notebook) =>
    notebookMatchesSearch(notebook, searchQuery),
  );
  const [focusedCellId, setFocusedCellId] = useState<string | null>(null);

  if (isLoadingNotebooks) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading notebooks...</p>
      </main>
    );
  }

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
        onReorderNotebooks={reorderNotebooks}
      />
      {activeNotebook ? (
        <NotebookEditor
          notebook={activeNotebook}
          notebooks={notebooks}
          focusedCellId={focusedCellId}
          onUpdateNotebook={updateNotebook}
          onAddTextCell={addTextCell}
          onUpdateTextCell={updateTextCell}
          onUpdateTextCells={updateTextCells}
          onAddDrawingCell={addDrawingCell}
          onAddLegacyDrawingCell={addLegacyDrawingCell}
          onUpdateDrawingCell={updateDrawingCell}
          onUpdateCellHeight={updateCellHeight}
          onAddDrawingCellAfter={addDrawingCellAfter}
          onAddLegacyDrawingCellAfter={addLegacyDrawingCellAfter}
          onAddTextCellAfter={addTextCellAfter}
          onRemoveCell={removeCell}
          onCopyCell={copyCell}
          onMoveCellUp={moveCellEarlier}
          onMoveCellDown={moveCellLater}
          onReorderCells={reorderCells}
          canUndo={nextUndoLabel !== null && !isHistoryBusy}
          canRedo={nextRedoLabel !== null && !isHistoryBusy}
          undoLabel={nextUndoLabel}
          redoLabel={nextRedoLabel}
          onUndo={() => applyStructuralHistory("undo")}
          onRedo={() => applyStructuralHistory("redo")}
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
      {pendingImport && (
        <ImportNotebookDialog
          fileName={pendingImport.fileName}
          notebookCount={pendingImport.notebooks.length}
          cellCount={pendingImport.notebooks.reduce(
            (total, notebook) => total + notebook.cells.length,
            0,
          )}
          isImporting={isImporting}
          onAppend={() => confirmNotebookImport("append")}
          onReplace={() => confirmNotebookImport("replace")}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </main>
  );
}
