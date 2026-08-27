"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GuestTrashEntry,
  type GuestWorkspace,
  getGuestStorageEstimate,
  loadGuestWorkspace,
  requestGuestStoragePersistence,
  saveGuestImage,
  saveGuestWorkspace,
} from "@/lib/client/guest-storage";
import { normalizeFolderName } from "@/lib/folders";
import { parseNotebookExport } from "@/lib/notebook-storage";
import { isScopedWorkspaceExport } from "@/lib/notebook-validation";
import {
  createPortableArchive,
  createPortableExportFilename,
  parsePortableArchive,
  restorePortableReferences,
} from "@/lib/portable-workspace-transfer";
import {
  createExportFilename,
  createScopedFolderExport,
  createScopedNotebookExport,
} from "@/lib/scoped-workspace-transfer";
import {
  applyAppearance,
  loadLocalSettings,
  saveLocalSettings,
} from "@/lib/settings";
import type {
  ExcalidrawSceneFlush,
  Folder,
  ImportedCell,
  Notebook,
  NotebookCell,
  NotebookUpdate,
  ScopedWorkspaceExport,
  TrashItem,
  UserSettings,
} from "@/lib/types";
import {
  applyCellHeightUpdate,
  applyDrawingCellUpdate,
  applyNotebookUpdate,
  applyTextCellUpdate,
  createDefaultNotebook,
  createDrawingCell,
  createExcalidrawCell,
  createId,
  createTextCell,
  deleteCell,
  duplicateCell,
  insertCellAfter,
  moveCellDown,
  moveCellUp,
  moveItem,
  notebookMatchesSearch,
} from "@/lib/utils";
import type { SidebarLocation } from "./NotebookApp";
import NotebookEditor from "./NotebookEditor";
import NotebookSidebar from "./NotebookSidebar";
import SettingsDialog from "./SettingsDialog";

function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadJson(data: unknown, filename: string) {
  download(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    filename,
  );
}

function importedCell(cell: ImportedCell): NotebookCell {
  const now = Date.now();
  return {
    ...cell,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  } as NotebookCell;
}

function importScopedLocally(
  current: GuestWorkspace,
  workspace: ScopedWorkspaceExport,
  destinationFolderId: string | null,
) {
  const folderIds = new Map(
    workspace.folders.map((folder) => [folder.id, createId()]),
  );
  const now = Date.now();
  const folders: Folder[] = workspace.folders.map((folder, index) => ({
    id: folderIds.get(folder.id) ?? createId(),
    name: folder.name,
    parentId:
      folder.parentId === null
        ? destinationFolderId
        : (folderIds.get(folder.parentId) ?? destinationFolderId),
    position: index,
    createdAt: now,
    updatedAt: now,
  }));
  const notebooks: Notebook[] = workspace.notebooks.map((notebook) => ({
    id: createId(),
    title: notebook.title,
    folderId:
      notebook.folderId === null
        ? destinationFolderId
        : (folderIds.get(notebook.folderId) ?? destinationFolderId),
    cells: notebook.cells.map(importedCell),
    createdAt: now,
    updatedAt: now,
  }));
  return {
    next: {
      ...current,
      folders: [...current.folders, ...folders],
      notebooks: [...notebooks, ...current.notebooks],
    },
    rootFolderId: workspace.rootFolderId
      ? (folderIds.get(workspace.rootFolderId) ?? null)
      : null,
    firstNotebookId: notebooks[0]?.id ?? null,
  };
}

export default function GuestNotebookApp() {
  const [workspace, setWorkspace] = useState<GuestWorkspace | null>(null);
  const [activeNotebookId, setActiveNotebookId] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<SidebarLocation>({
    kind: "all",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(loadLocalSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [storageInfo, setStorageInfo] =
    useState<Awaited<ReturnType<typeof getGuestStorageEstimate>>>(null);
  const [history, setHistory] = useState<
    Record<string, { undo: NotebookCell[][]; redo: NotebookCell[][] }>
  >({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotaWarningShownRef = useRef(false);
  const excalidrawFlushesRef = useRef(new Map<string, ExcalidrawSceneFlush>());

  useEffect(() => {
    void loadGuestWorkspace().then((loaded) => {
      setWorkspace(loaded);
      setActiveNotebookId(loaded.notebooks[0]?.id ?? "");
      void getGuestStorageEstimate().then(setStorageInfo);
    });
  }, []);

  useEffect(() => {
    if (!workspace) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveGuestWorkspace(workspace);
        setSaveStatus("saved");
        const estimate = await getGuestStorageEstimate();
        setStorageInfo(estimate);
        if (
          estimate &&
          estimate.quota > 0 &&
          estimate.usage / estimate.quota >= 0.8 &&
          !quotaWarningShownRef.current
        ) {
          quotaWarningShownRef.current = true;
          window.alert(
            "Local storage is over 80% full. Export a portable backup and free browser storage soon.",
          );
        }
      } catch {
        setSaveStatus("error");
        window.alert(
          "This browser could not save the latest local changes. Export a backup before closing the page.",
        );
      }
    }, 250);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [workspace]);

  useEffect(() => {
    const apply = () => {
      applyAppearance(settings);
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    apply();
    if (settings.theme !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings]);

  const activeNotebook =
    workspace?.notebooks.find((item) => item.id === activeNotebookId) ?? null;
  const updateWorkspace = (
    update: (current: GuestWorkspace) => GuestWorkspace,
  ) => setWorkspace((current) => (current ? update(current) : current));
  const updateNotebook = (fields: NotebookUpdate) => {
    updateWorkspace((current) => ({
      ...current,
      notebooks: current.notebooks.map((notebook) =>
        notebook.id === activeNotebookId
          ? applyNotebookUpdate(notebook, fields)
          : notebook,
      ),
    }));
  };
  const commitCells = (nextCells: NotebookCell[]) => {
    if (!activeNotebook) return;
    setHistory((current) => ({
      ...current,
      [activeNotebook.id]: {
        undo: [
          ...(current[activeNotebook.id]?.undo ?? []),
          activeNotebook.cells,
        ].slice(-50),
        redo: [],
      },
    }));
    updateNotebook({ cells: nextCells });
  };

  function createNotebook(folderIdOverride?: string | null) {
    const notebook = createDefaultNotebook();
    notebook.folderId =
      folderIdOverride !== undefined
        ? folderIdOverride
        : selectedLocation.kind === "folder"
          ? selectedLocation.folderId
          : null;
    updateWorkspace((current) => ({
      ...current,
      notebooks: [notebook, ...current.notebooks],
    }));
    setActiveNotebookId(notebook.id);
  }

  function createFolder(parentIdOverride?: string | null) {
    const name = normalizeFolderName(window.prompt("Folder name") ?? "");
    if (!name) return;
    const now = Date.now();
    const folder: Folder = {
      id: createId(),
      name,
      parentId:
        parentIdOverride !== undefined
          ? parentIdOverride
          : selectedLocation.kind === "folder"
            ? selectedLocation.folderId
            : null,
      position: workspace?.folders.length ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    updateWorkspace((current) => ({
      ...current,
      folders: [...current.folders, folder],
    }));
    setSelectedLocation({ kind: "folder", folderId: folder.id });
  }

  function deleteNotebook(id: string) {
    const notebook = workspace?.notebooks.find((item) => item.id === id);
    if (!notebook || !confirm("Move this notebook to Trash?")) return;
    const entry: GuestTrashEntry = {
      item: {
        id,
        kind: "notebook",
        name: notebook.title,
        trashedAt: Date.now(),
      },
      notebooks: [notebook],
      folders: [],
    };
    updateWorkspace((current) => ({
      ...current,
      notebooks: current.notebooks.filter((item) => item.id !== id),
      trash: [entry, ...current.trash],
    }));
    if (activeNotebookId === id) {
      setActiveNotebookId(
        workspace?.notebooks.find((item) => item.id !== id)?.id ?? "",
      );
    }
  }

  function descendantFolderIds(rootId: string) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of workspace?.folders ?? []) {
        if (
          folder.parentId &&
          ids.has(folder.parentId) &&
          !ids.has(folder.id)
        ) {
          ids.add(folder.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  function deleteFolder(folder: Folder) {
    if (!confirm(`Move “${folder.name}” and everything inside it to Trash?`))
      return;
    const ids = descendantFolderIds(folder.id);
    const folders = workspace?.folders.filter((item) => ids.has(item.id)) ?? [];
    const notebooks =
      workspace?.notebooks.filter(
        (item) => item.folderId && ids.has(item.folderId),
      ) ?? [];
    const entry: GuestTrashEntry = {
      item: {
        id: folder.id,
        kind: "folder",
        name: folder.name,
        trashedAt: Date.now(),
      },
      notebooks,
      folders,
    };
    updateWorkspace((current) => ({
      ...current,
      folders: current.folders.filter((item) => !ids.has(item.id)),
      notebooks: current.notebooks.filter(
        (item) => !notebooks.some((removed) => removed.id === item.id),
      ),
      trash: [entry, ...current.trash],
    }));
    setSelectedLocation({ kind: "all" });
  }

  function restoreTrashItem(item: TrashItem) {
    updateWorkspace((current) => {
      const entry = current.trash.find(
        (candidate) => candidate.item.id === item.id,
      );
      return entry
        ? {
            ...current,
            notebooks: [...entry.notebooks, ...current.notebooks],
            folders: [...current.folders, ...entry.folders],
            trash: current.trash.filter((candidate) => candidate !== entry),
          }
        : current;
    });
  }

  function moveFolder(folderId: string, parentId: string | null) {
    if (parentId && descendantFolderIds(folderId).has(parentId)) {
      alert("A folder cannot be moved inside itself.");
      return;
    }
    updateWorkspace((current) => ({
      ...current,
      folders: current.folders.map((folder) =>
        folder.id === folderId
          ? { ...folder, parentId, updatedAt: Date.now() }
          : folder,
      ),
    }));
  }

  const registerFlush = useCallback(
    (id: string, flush: ExcalidrawSceneFlush | null) => {
      if (flush) excalidrawFlushesRef.current.set(id, flush);
      else excalidrawFlushesRef.current.delete(id);
    },
    [],
  );

  async function flushedNotebooks() {
    const scenes = new Map<string, string | null>();
    await Promise.all(
      [...excalidrawFlushesRef.current].map(async ([id, flush]) =>
        scenes.set(id, await flush()),
      ),
    );
    return (workspace?.notebooks ?? []).map((notebook) => ({
      ...notebook,
      cells: notebook.cells.map((cell) =>
        cell.type === "excalidraw" && scenes.has(cell.id)
          ? { ...cell, drawing: scenes.get(cell.id) ?? null }
          : cell,
      ),
    }));
  }

  async function exportScoped(
    id: string,
    kind: "notebook" | "folder",
    portable: boolean,
  ) {
    if (!workspace) return;
    const notebooks = await flushedNotebooks();
    const item =
      kind === "notebook"
        ? notebooks.find((notebook) => notebook.id === id)
        : workspace.folders.find((folder) => folder.id === id);
    const scoped =
      kind === "notebook"
        ? item && "cells" in item
          ? createScopedNotebookExport(item)
          : null
        : createScopedFolderExport(id, workspace.folders, notebooks);
    if (!item || !scoped) return;
    const name = "title" in item ? item.title : item.name;
    if (portable)
      download(
        await createPortableArchive(scoped),
        createPortableExportFilename(name, kind),
      );
    else downloadJson(scoped, createExportFilename(name, kind));
  }

  async function importScoped(
    destinationFolderId: string | null,
    file: File,
    portable = false,
  ) {
    if (!workspace) return;
    try {
      let scoped: ScopedWorkspaceExport;
      if (portable) {
        const archive = await parsePortableArchive(file);
        const urls = new Map<string, string>();
        for (const attachment of archive.manifest.attachments) {
          const bytes = archive.files.get(attachment.id);
          if (!bytes) throw new Error("Missing attachment");
          const image = await saveGuestImage(
            new Blob([bytes.slice().buffer], { type: attachment.contentType }),
            attachment.filename,
            null,
          );
          urls.set(attachment.id, image.url);
        }
        scoped = restorePortableReferences(archive.workspace, urls);
      } else {
        const parsed: unknown = JSON.parse(await file.text());
        if (!isScopedWorkspaceExport(parsed)) throw new Error("Invalid export");
        scoped = parsed;
      }
      const imported = importScopedLocally(
        workspace,
        scoped,
        destinationFolderId,
      );
      setWorkspace(imported.next);
      if (imported.firstNotebookId)
        setActiveNotebookId(imported.firstNotebookId);
      setSelectedLocation(
        imported.rootFolderId
          ? { kind: "folder", folderId: imported.rootFolderId }
          : destinationFolderId
            ? { kind: "folder", folderId: destinationFolderId }
            : { kind: "unfiled" },
      );
    } catch {
      alert("Could not import this local workspace file.");
    }
  }

  if (!workspace) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        Loading local workspace…
      </main>
    );
  }

  const filtered = workspace.notebooks.filter((notebook) => {
    if (!notebookMatchesSearch(notebook, searchQuery)) return false;
    if (searchQuery.trim()) return true;
    if (selectedLocation.kind === "unfiled") return notebook.folderId === null;
    if (selectedLocation.kind === "folder")
      return notebook.folderId === selectedLocation.folderId;
    return selectedLocation.kind !== "trash";
  });
  const folderPath = (() => {
    const path: string[] = [];
    const byId = new Map(
      workspace.folders.map((folder) => [folder.id, folder]),
    );
    let folder = activeNotebook?.folderId
      ? byId.get(activeNotebook.folderId)
      : undefined;
    while (folder) {
      path.unshift(folder.name);
      folder = folder.parentId ? byId.get(folder.parentId) : undefined;
    }
    return path;
  })();
  const activeHistory = history[activeNotebookId] ?? { undo: [], redo: [] };

  return (
    <main className="flex min-h-screen flex-col bg-slate-100 text-slate-950 md:flex-row">
      <NotebookSidebar
        isGuest
        notebooks={filtered}
        allNotebooks={workspace.notebooks}
        folders={workspace.folders}
        trashItems={workspace.trash.map((entry) => entry.item)}
        activeNotebookId={activeNotebookId}
        selectedLocation={selectedLocation}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectLocation={setSelectedLocation}
        onSelectNotebook={setActiveNotebookId}
        onCreateNotebook={createNotebook}
        onCreateFolder={createFolder}
        onRenameNotebook={(notebook) => {
          const title = prompt("Rename notebook", notebook.title)?.trim();
          if (title)
            updateWorkspace((current) => ({
              ...current,
              notebooks: current.notebooks.map((item) =>
                item.id === notebook.id ? { ...item, title } : item,
              ),
            }));
        }}
        onRenameFolder={(folder) => {
          const name = normalizeFolderName(
            prompt("Rename folder", folder.name) ?? "",
          );
          if (name)
            updateWorkspace((current) => ({
              ...current,
              folders: current.folders.map((item) =>
                item.id === folder.id ? { ...item, name } : item,
              ),
            }));
        }}
        onDeleteFolder={deleteFolder}
        onDeleteNotebook={deleteNotebook}
        onMoveNotebook={(id, folderId) =>
          updateWorkspace((current) => ({
            ...current,
            notebooks: current.notebooks.map((item) =>
              item.id === id ? { ...item, folderId } : item,
            ),
          }))
        }
        onMoveNotebookBefore={(id, targetId) =>
          updateWorkspace((current) => {
            const from = current.notebooks.findIndex((item) => item.id === id);
            const to = current.notebooks.findIndex(
              (item) => item.id === targetId,
            );
            return {
              ...current,
              notebooks: moveItem(current.notebooks, from, to),
            };
          })
        }
        onMoveFolder={moveFolder}
        onExportNotebook={(id) => void exportScoped(id, "notebook", false)}
        onExportFolder={(id) => void exportScoped(id, "folder", false)}
        onExportPortableNotebook={(id) =>
          void exportScoped(id, "notebook", true)
        }
        onExportPortableFolder={(id) => void exportScoped(id, "folder", true)}
        onImportIntoFolder={(id, file) => void importScoped(id, file)}
        onImportPortableIntoFolder={(id, file) =>
          void importScoped(id, file, true)
        }
        onRestoreTrashItem={restoreTrashItem}
        onPermanentlyDeleteTrashItem={(item) =>
          updateWorkspace((current) => ({
            ...current,
            trash: current.trash.filter((entry) => entry.item.id !== item.id),
          }))
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      {activeNotebook && selectedLocation.kind !== "trash" ? (
        <NotebookEditor
          notebook={activeNotebook}
          notebooks={workspace.notebooks}
          folderPath={folderPath}
          focusedCellId={focusedCellId}
          settings={settings}
          isDarkMode={isDarkMode}
          storageMode="local"
          onUpdateNotebook={updateNotebook}
          onAddTextCell={() =>
            commitCells([...activeNotebook.cells, createTextCell()])
          }
          onAddDrawingCell={() =>
            commitCells([...activeNotebook.cells, createExcalidrawCell()])
          }
          onAddLegacyDrawingCell={() =>
            commitCells([...activeNotebook.cells, createDrawingCell()])
          }
          onUpdateTextCell={(id, content) =>
            updateNotebook({
              cells: activeNotebook.cells.map((cell) =>
                cell.id === id && cell.type === "text"
                  ? applyTextCellUpdate(cell, content)
                  : cell,
              ),
            })
          }
          onUpdateTextCells={(updates) =>
            updateNotebook({
              cells: activeNotebook.cells.map((cell) =>
                cell.type === "text" && updates.has(cell.id)
                  ? applyTextCellUpdate(
                      cell,
                      updates.get(cell.id) ?? cell.content,
                    )
                  : cell,
              ),
            })
          }
          onUpdateDrawingCell={(id, drawing) =>
            updateNotebook({
              cells: activeNotebook.cells.map((cell) =>
                cell.id === id && cell.type !== "text"
                  ? applyDrawingCellUpdate(cell, drawing)
                  : cell,
              ),
            })
          }
          onUpdateCellHeight={(id, height) =>
            updateNotebook({
              cells: activeNotebook.cells.map((cell) =>
                cell.id === id ? applyCellHeightUpdate(cell, height) : cell,
              ),
            })
          }
          onAddTextCellAfter={(id) => {
            const cell = createTextCell();
            commitCells(insertCellAfter(activeNotebook.cells, id, cell));
            setFocusedCellId(cell.id);
          }}
          onAddDrawingCellAfter={(id) =>
            commitCells(
              insertCellAfter(activeNotebook.cells, id, createExcalidrawCell()),
            )
          }
          onAddLegacyDrawingCellAfter={(id) =>
            commitCells(
              insertCellAfter(activeNotebook.cells, id, createDrawingCell()),
            )
          }
          onRemoveCell={(id) => {
            const cells = deleteCell(activeNotebook.cells, id);
            commitCells(cells.length ? cells : [createTextCell()]);
          }}
          onCopyCell={(id) =>
            commitCells(duplicateCell(activeNotebook.cells, id))
          }
          onMoveCellUp={(id) =>
            commitCells(moveCellUp(activeNotebook.cells, id))
          }
          onMoveCellDown={(id) =>
            commitCells(moveCellDown(activeNotebook.cells, id))
          }
          onReorderCells={(from, to) =>
            commitCells(moveItem(activeNotebook.cells, from, to))
          }
          canUndo={activeHistory.undo.length > 0}
          canRedo={activeHistory.redo.length > 0}
          undoLabel={activeHistory.undo.length ? "local cell change" : null}
          redoLabel={activeHistory.redo.length ? "local cell change" : null}
          onUndo={() => {
            const previous = activeHistory.undo.at(-1);
            if (!previous) return;
            setHistory((current) => ({
              ...current,
              [activeNotebookId]: {
                undo: activeHistory.undo.slice(0, -1),
                redo: [...activeHistory.redo, activeNotebook.cells],
              },
            }));
            updateNotebook({ cells: previous });
          }}
          onRedo={() => {
            const next = activeHistory.redo.at(-1);
            if (!next) return;
            setHistory((current) => ({
              ...current,
              [activeNotebookId]: {
                undo: [...activeHistory.undo, activeNotebook.cells],
                redo: activeHistory.redo.slice(0, -1),
              },
            }));
            updateNotebook({ cells: next });
          }}
          onFocusedCellHandled={() => setFocusedCellId(null)}
          onExportNotebooks={() =>
            downloadJson(
              {
                version: 1,
                notebooks: workspace.notebooks,
                exportedAt: Date.now(),
              },
              `local-notebooks-${Date.now()}.json`,
            )
          }
          onRegisterExcalidrawFlush={registerFlush}
          onImportNotebooks={async (file) => {
            const notebooks = parseNotebookExport(await file.text());
            if (
              notebooks &&
              confirm("Replace the local notebooks with this export?")
            ) {
              setWorkspace({ ...workspace, notebooks });
              setActiveNotebookId(notebooks[0]?.id ?? "");
            }
          }}
        />
      ) : (
        <section className="flex flex-1 items-center justify-center bg-slate-50 p-8 text-center text-slate-500">
          {selectedLocation.kind === "trash"
            ? "Restore or permanently delete local items from the sidebar."
            : "Create a local notebook to start writing."}
        </section>
      )}
      {isSettingsOpen && (
        <SettingsDialog
          isLocalMode
          localStorageInfo={storageInfo}
          onRequestLocalPersistence={() => {
            void requestGuestStoragePersistence().then(async () => {
              setStorageInfo(await getGuestStorageEstimate());
            });
          }}
          settings={settings}
          saveStatus={saveStatus}
          onChange={(next) => {
            setSettings(next);
            saveLocalSettings(next);
            setSaveStatus("saved");
          }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </main>
  );
}
