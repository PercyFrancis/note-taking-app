"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NotebookEditor from "@/components/notebook/NotebookEditor";
import NotebookSidebar from "@/components/notebook/NotebookSidebar";
import SettingsDialog from "@/components/notebook/SettingsDialog";
import {
  createRemoteFolder,
  deleteRemoteFolder,
  loadRemoteFolders,
  loadRemoteTrash,
  moveRemoteFolder,
  renameRemoteFolder,
  restoreRemoteFolder,
} from "@/lib/client/folder-api";
import {
  createGuestCloudTransfer,
  guestWorkspaceHasContent,
  loadGuestWorkspace,
} from "@/lib/client/guest-storage";
import {
  createRemoteCell,
  createRemoteNotebook,
  deleteRemoteCell,
  deleteRemoteNotebook,
  duplicateRemoteCell,
  importRemoteNotebooks,
  importRemoteScopedWorkspace,
  loadRemoteNotebooks,
  moveRemoteNotebook,
  reorderRemoteCells,
  reorderRemoteNotebooks,
  restoreRemoteCell,
  restoreRemoteNotebook,
  updateRemoteCell,
  updateRemoteNotebook,
} from "@/lib/client/notebook-api";
import { importPortableWorkspace } from "@/lib/client/portable-import-api";
import {
  loadRemoteSettings,
  saveRemoteSettings,
} from "@/lib/client/settings-api";
import { createNotebookImportInput } from "@/lib/notebook-import";
import {
  createNotebookExport,
  parseNotebookExport,
} from "@/lib/notebook-storage";
import { isScopedWorkspaceExport } from "@/lib/notebook-validation";
import {
  createPortableArchive,
  createPortableExportFilename,
  parsePortableArchive,
} from "@/lib/portable-workspace-transfer";
import {
  createExportFilename,
  createScopedFolderExport,
  createScopedNotebookExport,
} from "@/lib/scoped-workspace-transfer";
import {
  applyAppearance,
  LEGACY_CANVAS_TOOLS_STORAGE_KEY,
  LEGACY_TOUCH_DRAWING_STORAGE_KEY,
  loadLocalSettings,
  SETTINGS_STORAGE_KEY,
  saveLocalSettings,
} from "@/lib/settings";
import type {
  ExcalidrawSceneFlush,
  Folder,
  ImportNotebooksInput,
  Notebook,
  NotebookCell,
  NotebookUpdate,
  TrashItem,
  UpdateCellInput,
  UpdateNotebookInput,
  UserSettings,
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
const MAX_SCOPED_IMPORT_SIZE_BYTES = 25 * 1024 * 1024;

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

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

export type SidebarLocation =
  | { kind: "all" }
  | { kind: "unfiled" }
  | { kind: "folder"; folderId: string }
  | { kind: "trash" };

export default function NotebookApp() {
  async function createNotebook(folderIdOverride?: string | null) {
    const folderId =
      folderIdOverride !== undefined
        ? folderIdOverride
        : selectedLocation.kind === "folder"
          ? selectedLocation.folderId
          : null;

    try {
      const notebook = await createRemoteNotebook({
        title: "New note",
        folderId,
      });

      setNotebooks((currentNotebooks) => [notebook, ...currentNotebooks]);
      setActiveNotebookId(notebook.id);
      setSelectedLocation(
        folderId ? { kind: "folder", folderId } : { kind: "unfiled" },
      );
    } catch {
      window.alert("Could not create notebook.");
    }
  }

  async function deleteNotebook(id: string) {
    const shouldDelete = window.confirm("Move this notebook to Trash?");

    if (!shouldDelete) {
      return;
    }

    try {
      await deleteRemoteNotebook(id);
      setTrashItems(await loadRemoteTrash());

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
      window.alert("Could not move the notebook to Trash.");
    }
  }

  async function createFolder(parentIdOverride?: string | null) {
    const name = window.prompt("Folder name");
    if (!name) return;

    try {
      const folder = await createRemoteFolder(
        name,
        parentIdOverride !== undefined
          ? parentIdOverride
          : selectedLocation.kind === "folder"
            ? selectedLocation.folderId
            : null,
      );
      setFolders((currentFolders) => [...currentFolders, folder]);
      setSelectedLocation({ kind: "folder", folderId: folder.id });
    } catch {
      window.alert("Could not create folder.");
    }
  }

  async function renameFolder(folder: Folder) {
    const name = window.prompt("Rename folder", folder.name);
    if (!name || name === folder.name) return;

    try {
      const updatedFolder = await renameRemoteFolder(folder.id, name);
      setFolders((currentFolders) =>
        currentFolders.map((currentFolder) =>
          currentFolder.id === folder.id ? updatedFolder : currentFolder,
        ),
      );
    } catch {
      window.alert("Could not rename folder.");
    }
  }

  async function moveFolder(folderId: string, parentId: string | null) {
    const currentFolder = folders.find((folder) => folder.id === folderId);
    if (currentFolder?.parentId === parentId) return;

    try {
      const updatedFolder = await moveRemoteFolder(folderId, parentId);
      setFolders((currentFolders) =>
        currentFolders.map((folder) =>
          folder.id === folderId ? updatedFolder : folder,
        ),
      );
    } catch {
      window.alert("That folder cannot be moved there.");
    }
  }

  async function moveNotebook(notebookId: string, folderId: string | null) {
    const currentNotebook = notebooks.find(
      (notebook) => notebook.id === notebookId,
    );
    if (currentNotebook?.folderId === folderId) return;

    try {
      await moveRemoteNotebook(notebookId, folderId);
      setNotebooks((currentNotebooks) =>
        currentNotebooks.map((notebook) =>
          notebook.id === notebookId ? { ...notebook, folderId } : notebook,
        ),
      );
    } catch {
      window.alert("Could not move notebook.");
    }
  }

  async function moveNotebookBefore(
    notebookId: string,
    targetNotebookId: string,
  ) {
    if (notebookId === targetNotebookId) return;

    const sourceNotebook = notebooks.find(
      (notebook) => notebook.id === notebookId,
    );
    const targetNotebook = notebooks.find(
      (notebook) => notebook.id === targetNotebookId,
    );
    if (!sourceNotebook || !targetNotebook) return;

    const targetFolderId = targetNotebook.folderId;
    const orderedSiblings = notebooks.filter(
      (notebook) =>
        notebook.id !== notebookId && notebook.folderId === targetFolderId,
    );
    const targetIndex = orderedSiblings.findIndex(
      (notebook) => notebook.id === targetNotebookId,
    );
    if (targetIndex < 0) return;

    orderedSiblings.splice(targetIndex, 0, {
      ...sourceNotebook,
      folderId: targetFolderId,
    });

    try {
      if (sourceNotebook.folderId !== targetFolderId) {
        await moveRemoteNotebook(notebookId, targetFolderId);
      }
      await reorderRemoteNotebooks({
        notebookIds: orderedSiblings.map((notebook) => notebook.id),
      });

      const targetIds = new Set(orderedSiblings.map((notebook) => notebook.id));
      setNotebooks((currentNotebooks) => [
        ...orderedSiblings,
        ...currentNotebooks.filter((notebook) => !targetIds.has(notebook.id)),
      ]);
    } catch {
      window.alert("Could not reorder notebook.");
      await reloadOrganization();
    }
  }

  async function renameNotebook(notebook: Notebook) {
    const title = window.prompt("Rename notebook", notebook.title);
    if (!title || title === notebook.title) return;

    try {
      const pendingTitleSave = notebookTitleSaveTimersRef.current.get(
        notebook.id,
      );
      if (pendingTitleSave) {
        clearTimeout(pendingTitleSave);
        notebookTitleSaveTimersRef.current.delete(notebook.id);
      }
      await updateRemoteNotebook(notebook.id, { title });
      setNotebooks((currentNotebooks) =>
        currentNotebooks.map((currentNotebook) =>
          currentNotebook.id === notebook.id
            ? { ...currentNotebook, title }
            : currentNotebook,
        ),
      );
    } catch {
      window.alert("Could not rename notebook.");
    }
  }

  async function deleteFolder(folder: Folder) {
    if (
      !window.confirm(
        `Move “${folder.name}” and everything inside it to Trash?`,
      )
    ) {
      return;
    }

    try {
      await deleteRemoteFolder(folder.id);
      await reloadOrganization();
      setSelectedLocation({ kind: "all" });
    } catch {
      window.alert("Could not move folder to Trash.");
    }
  }

  async function restoreTrashItem(item: TrashItem) {
    try {
      if (item.kind === "folder") await restoreRemoteFolder(item.id);
      else await restoreRemoteNotebook(item.id);
      await reloadOrganization();
    } catch {
      window.alert("Could not restore item.");
    }
  }

  async function permanentlyDeleteTrashItem(item: TrashItem) {
    if (!window.confirm(`Permanently delete “${item.name}”?`)) return;

    try {
      if (item.kind === "folder") await deleteRemoteFolder(item.id, true);
      else await deleteRemoteNotebook(item.id, true);
      await reloadOrganization();
    } catch {
      window.alert("Could not permanently delete item.");
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

  function queueCellSave(
    cellId: string,
    input: UpdateCellInput,
    delayMs = 600,
  ) {
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
    }, delayMs);

    cellSaveTimersRef.current.set(cellId, nextTimer);
  }

  useEffect(() => {
    function flushCellSavesBeforePageExit() {
      queueMicrotask(() => {
        for (const [cellId, input] of pendingCellUpdatesRef.current) {
          const timer = cellSaveTimersRef.current.get(cellId);

          if (timer) clearTimeout(timer);

          cellSaveTimersRef.current.delete(cellId);
          pendingCellUpdatesRef.current.delete(cellId);
          void updateRemoteCell(cellId, input, { keepalive: true });
        }
      });
    }

    window.addEventListener("pagehide", flushCellSavesBeforePageExit);

    return () => {
      window.removeEventListener("pagehide", flushCellSavesBeforePageExit);
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

    queueCellSave(cellId, { drawing }, 200);
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

      setTimeout(() => clearQueuedCellSave(cellId), 0);

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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<SidebarLocation>({
    kind: "all",
  });
  const [activeNotebookId, setActiveNotebookId] = useState("");
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(true);
  const [historyByNotebook, setHistoryByNotebook] = useState<
    Record<string, NotebookHistory>
  >({});
  const [isHistoryBusy, setIsHistoryBusy] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(loadLocalSettings);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const historyBusyRef = useRef(false);
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const settingsChangedRef = useRef(false);
  const pendingCellOrderNotebookIdsRef = useRef(new Set<string>());
  const excalidrawFlushesRef = useRef(new Map<string, ExcalidrawSceneFlush>());

  const registerExcalidrawFlush = useCallback(
    (cellId: string, flush: ExcalidrawSceneFlush | null) => {
      if (flush) excalidrawFlushesRef.current.set(cellId, flush);
      else excalidrawFlushesRef.current.delete(cellId);
    },
    [],
  );

  const reloadOrganization = useCallback(async () => {
    const [remoteNotebooks, remoteFolders, remoteTrash] = await Promise.all([
      loadRemoteNotebooks(),
      loadRemoteFolders(),
      loadRemoteTrash(),
    ]);

    setNotebooks(remoteNotebooks);
    setFolders(remoteFolders);
    setTrashItems(remoteTrash);
    setActiveNotebookId((currentId) =>
      remoteNotebooks.some((notebook) => notebook.id === currentId)
        ? currentId
        : (remoteNotebooks[0]?.id ?? ""),
    );
  }, []);

  useEffect(() => {
    async function loadNotebooks() {
      try {
        await reloadOrganization();
      } catch (error) {
        window.alert(
          error instanceof Error
            ? `Could not load your notebook workspace. ${error.message}`
            : "Could not load your notebook workspace.",
        );
        setIsLoadingNotebooks(false);
        return;
      }

      try {
        if (
          window.sessionStorage.getItem("note-taking-app:guest-import-reviewed")
        ) {
          return;
        }
        const guestWorkspace = await loadGuestWorkspace();
        if (!guestWorkspaceHasContent(guestWorkspace)) return;
        const shouldImport = window.confirm(
          "A workspace stored on this device was found. Import a copy into your account? Choose Cancel to keep the local and cloud workspaces separate.",
        );
        window.sessionStorage.setItem(
          "note-taking-app:guest-import-reviewed",
          "true",
        );
        if (!shouldImport) return;

        const archive = await createGuestCloudTransfer(guestWorkspace);
        const rootFolderId =
          archive.manifest.attachments.length > 0
            ? await importPortableWorkspace(archive, null)
            : await importRemoteScopedWorkspace(archive.workspace, null);
        await reloadOrganization();
        if (rootFolderId) {
          setSelectedLocation({ kind: "folder", folderId: rootFolderId });
        }
        window.alert(
          "The local workspace was copied into your account. The original local copy remains on this device.",
        );
      } catch {
        window.alert(
          "Your cloud workspace loaded, but the local workspace could not be imported. The local copy is still safe on this device.",
        );
      } finally {
        setIsLoadingNotebooks(false);
      }
    }

    loadNotebooks();
  }, [reloadOrganization]);

  useEffect(() => {
    const applyResolvedAppearance = () => {
      applyAppearance(settings);
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    applyResolvedAppearance();
    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => applyResolvedAppearance();
    media.addEventListener("change", handleSystemThemeChange);
    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    async function synchronizeSettings() {
      try {
        const hasLegacyPreference =
          window.localStorage.getItem(LEGACY_TOUCH_DRAWING_STORAGE_KEY) !==
            null ||
          window.localStorage.getItem(LEGACY_CANVAS_TOOLS_STORAGE_KEY) !== null;
        const hasCurrentLocalSettings =
          window.localStorage.getItem(SETTINGS_STORAGE_KEY) !== null;
        if (!hasCurrentLocalSettings && hasLegacyPreference) {
          const migratedSettings = loadLocalSettings();
          saveLocalSettings(migratedSettings);
          await saveRemoteSettings(migratedSettings);
          if (!cancelled) setSettingsSaveStatus("saved");
          return;
        }
        const remoteSettings = await loadRemoteSettings();
        if (!cancelled && !settingsChangedRef.current) {
          setSettings(remoteSettings);
          saveLocalSettings(remoteSettings);
        }
      } catch {
        // Local settings remain active if account synchronization is unavailable.
      }
    }
    void synchronizeSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateSettings(nextSettings: UserSettings) {
    settingsChangedRef.current = true;
    setSettings(nextSettings);
    saveLocalSettings(nextSettings);
    applyAppearance(nextSettings);
    setIsDarkMode(document.documentElement.classList.contains("dark"));
    setSettingsSaveStatus("saving");
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
    }
    settingsSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveRemoteSettings(nextSettings);
        setSettingsSaveStatus("saved");
      } catch {
        setSettingsSaveStatus("error");
      }
    }, 400);
  }

  async function createFlushedExportSnapshot(): Promise<Notebook[]> {
    const pendingExcalidrawScenes = new Map<string, string | null>();
    await Promise.all(
      [...excalidrawFlushesRef.current.entries()].map(
        async ([cellId, flush]) => {
          pendingExcalidrawScenes.set(cellId, await flush());
        },
      ),
    );

    return notebooks.map((notebook) => ({
      ...notebook,
      cells: notebook.cells.map((cell) =>
        cell.type === "excalidraw" && pendingExcalidrawScenes.has(cell.id)
          ? {
              ...cell,
              drawing: pendingExcalidrawScenes.get(cell.id) ?? null,
            }
          : cell,
      ),
    }));
  }

  async function exportNotebooks() {
    try {
      const exportSnapshot = await createFlushedExportSnapshot();
      downloadJson(
        createNotebookExport(exportSnapshot),
        `notebooks-${Date.now()}.json`,
      );
    } catch {
      window.alert(
        "Could not finish saving an Excalidraw image. The export was cancelled.",
      );
    }
  }

  async function exportNotebook(notebookId: string) {
    try {
      const snapshot = await createFlushedExportSnapshot();
      const notebook = snapshot.find((item) => item.id === notebookId);
      if (!notebook) throw new Error("Notebook not found");
      downloadJson(
        createScopedNotebookExport(notebook),
        createExportFilename(notebook.title, "notebook"),
      );
    } catch {
      window.alert("Could not export this notebook.");
    }
  }

  async function exportFolder(folderId: string) {
    try {
      const snapshot = await createFlushedExportSnapshot();
      const folder = folders.find((item) => item.id === folderId);
      const exportData = createScopedFolderExport(folderId, folders, snapshot);
      if (!folder || !exportData) throw new Error("Folder not found");
      downloadJson(exportData, createExportFilename(folder.name, "folder"));
    } catch {
      window.alert("Could not export this folder.");
    }
  }

  async function exportPortableNotebook(notebookId: string) {
    if (
      !window.confirm(
        "Portable exports contain unencrypted copies of private images. Anyone with the ZIP can view them. Continue?",
      )
    ) {
      return;
    }
    try {
      const snapshot = await createFlushedExportSnapshot();
      const notebook = snapshot.find((item) => item.id === notebookId);
      if (!notebook) throw new Error("Notebook not found");
      const archive = await createPortableArchive(
        createScopedNotebookExport(notebook),
      );
      downloadBlob(
        archive,
        createPortableExportFilename(notebook.title, "notebook"),
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? `Could not export this portable notebook. ${error.message}`
          : "Could not export this portable notebook.",
      );
    }
  }

  async function exportPortableFolder(folderId: string) {
    if (
      !window.confirm(
        "Portable exports contain unencrypted copies of private images. Anyone with the ZIP can view them. Continue?",
      )
    ) {
      return;
    }
    try {
      const snapshot = await createFlushedExportSnapshot();
      const folder = folders.find((item) => item.id === folderId);
      const workspace = createScopedFolderExport(folderId, folders, snapshot);
      if (!folder || !workspace) throw new Error("Folder not found");
      const archive = await createPortableArchive(workspace);
      downloadBlob(
        archive,
        createPortableExportFilename(folder.name, "folder"),
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? `Could not export this portable folder. ${error.message}`
          : "Could not export this portable folder.",
      );
    }
  }

  async function importScopedWorkspace(
    destinationFolderId: string | null,
    file: File,
  ) {
    if (file.size > MAX_SCOPED_IMPORT_SIZE_BYTES) {
      window.alert("This import is larger than the 25 MB limit.");
      return;
    }

    try {
      const parsedWorkspace: unknown = JSON.parse(await file.text());
      if (!isScopedWorkspaceExport(parsedWorkspace)) {
        window.alert("This is not a valid notebook or folder export.");
        return;
      }
      const importedRootFolderId = await importRemoteScopedWorkspace(
        parsedWorkspace,
        destinationFolderId,
      );
      await reloadOrganization();
      setSelectedLocation(
        importedRootFolderId
          ? { kind: "folder", folderId: importedRootFolderId }
          : destinationFolderId
            ? { kind: "folder", folderId: destinationFolderId }
            : { kind: "unfiled" },
      );
    } catch {
      window.alert("Could not import this notebook or folder.");
    }
  }

  async function importPortableArchive(
    destinationFolderId: string | null,
    file: File,
  ) {
    try {
      const archive = await parsePortableArchive(file);
      const importedRootFolderId = await importPortableWorkspace(
        archive,
        destinationFolderId,
      );
      await reloadOrganization();
      setSelectedLocation(
        importedRootFolderId
          ? { kind: "folder", folderId: importedRootFolderId }
          : destinationFolderId
            ? { kind: "folder", folderId: destinationFolderId }
            : { kind: "unfiled" },
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? `Could not import this portable archive. ${error.message}`
          : "Could not import this portable archive.",
      );
    }
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
      const input: ImportNotebooksInput = createNotebookImportInput(
        pendingImport.notebooks,
        mode,
      );

      const nextNotebooks = await importRemoteNotebooks(input);

      setNotebooks(nextNotebooks);
      setActiveNotebookId(nextNotebooks[0]?.id ?? "");
      setHistoryByNotebook({});
      await reloadOrganization();
      setSelectedLocation({ kind: "all" });

      setPendingImport(null);
    } catch {
      window.alert("Could not import notebooks.");
    } finally {
      setIsImporting(false);
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
  const filteredNotebooks = notebooks.filter((notebook) => {
    if (!notebookMatchesSearch(notebook, searchQuery)) return false;
    if (searchQuery.trim() !== "") return true;
    if (selectedLocation.kind === "trash") return false;
    if (selectedLocation.kind === "unfiled") return notebook.folderId === null;
    if (selectedLocation.kind === "folder") {
      return notebook.folderId === selectedLocation.folderId;
    }
    return true;
  });
  const activeFolderPath = (() => {
    if (!activeNotebook?.folderId) return [];

    const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
    const path: string[] = [];
    let folder = foldersById.get(activeNotebook.folderId);
    const visited = new Set<string>();

    while (folder && !visited.has(folder.id)) {
      visited.add(folder.id);
      path.unshift(folder.name);
      folder = folder.parentId ? foldersById.get(folder.parentId) : undefined;
    }

    return path;
  })();
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
        allNotebooks={notebooks}
        folders={folders}
        trashItems={trashItems}
        activeNotebookId={activeNotebookId}
        selectedLocation={selectedLocation}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectLocation={setSelectedLocation}
        onSelectNotebook={setActiveNotebookId}
        onCreateNotebook={createNotebook}
        onCreateFolder={createFolder}
        onRenameNotebook={renameNotebook}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onDeleteNotebook={deleteNotebook}
        onMoveNotebook={moveNotebook}
        onMoveNotebookBefore={moveNotebookBefore}
        onMoveFolder={moveFolder}
        onExportNotebook={(notebookId) => void exportNotebook(notebookId)}
        onExportFolder={(folderId) => void exportFolder(folderId)}
        onExportPortableNotebook={(notebookId) =>
          void exportPortableNotebook(notebookId)
        }
        onExportPortableFolder={(folderId) =>
          void exportPortableFolder(folderId)
        }
        onImportIntoFolder={(folderId, file) =>
          void importScopedWorkspace(folderId, file)
        }
        onImportPortableIntoFolder={(folderId, file) =>
          void importPortableArchive(folderId, file)
        }
        onRestoreTrashItem={restoreTrashItem}
        onPermanentlyDeleteTrashItem={permanentlyDeleteTrashItem}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      {activeNotebook && selectedLocation.kind !== "trash" ? (
        <NotebookEditor
          notebook={activeNotebook}
          notebooks={notebooks}
          folderPath={activeFolderPath}
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
          onRegisterExcalidrawFlush={registerExcalidrawFlush}
          onImportNotebooks={importNotebooks}
          settings={settings}
          isDarkMode={isDarkMode}
          storageMode="cloud"
        />
      ) : (
        <section className="flex min-w-0 flex-1 items-center justify-center bg-slate-50 px-6 py-12">
          <div className="max-w-sm text-center">
            <h2 className="text-lg font-semibold text-slate-900">
              {selectedLocation.kind === "trash"
                ? "Trash"
                : "No notebook selected"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {selectedLocation.kind === "trash"
                ? "Restore or permanently delete items from the sidebar."
                : "Create a notebook to start writing."}
            </p>
            {selectedLocation.kind !== "trash" && (
              <button
                type="button"
                onClick={() => createNotebook()}
                className={[primaryButtonClass, "mt-4 px-4"].join(" ")}
              >
                New notebook
              </button>
            )}
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
      {isSettingsOpen && (
        <SettingsDialog
          settings={settings}
          saveStatus={settingsSaveStatus}
          onChange={updateSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </main>
  );
}
