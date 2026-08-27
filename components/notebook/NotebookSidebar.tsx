"use client";

import { UserButton } from "@clerk/nextjs";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { primaryButtonClass } from "@/components/ui/buttonStyles";
import type { Folder, Notebook, TrashItem } from "@/lib/types";
import { getNotebookSearchPreview } from "@/lib/utils";
import MoveToFolderDialog from "./MoveToFolderDialog";
import type { SidebarLocation } from "./NotebookApp";

interface NotebookSidebarProps {
  notebooks: Notebook[];
  allNotebooks: Notebook[];
  folders: Folder[];
  trashItems: TrashItem[];
  activeNotebookId: string;
  selectedLocation: SidebarLocation;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectLocation: (location: SidebarLocation) => void;
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: (folderIdOverride?: string | null) => void;
  onCreateFolder: (parentIdOverride?: string | null) => void;
  onRenameNotebook: (notebook: Notebook) => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onDeleteNotebook: (id: string) => void;
  onMoveNotebook: (notebookId: string, folderId: string | null) => void;
  onMoveNotebookBefore: (notebookId: string, targetNotebookId: string) => void;
  onMoveFolder: (folderId: string, parentId: string | null) => void;
  onExportNotebook: (notebookId: string) => void;
  onExportFolder: (folderId: string) => void;
  onExportPortableNotebook: (notebookId: string) => void;
  onExportPortableFolder: (folderId: string) => void;
  onImportIntoFolder: (folderId: string | null, file: File) => void;
  onImportPortableIntoFolder: (folderId: string | null, file: File) => void;
  onRestoreTrashItem: (item: TrashItem) => void;
  onPermanentlyDeleteTrashItem: (item: TrashItem) => void;
  onOpenSettings: () => void;
}

type DragData = { kind: "notebook" | "folder"; itemId: string };
type DropData =
  | { kind: "folder"; folderId: string | null }
  | { kind: "notebook"; notebookId: string; folderId: string | null };
type MenuItem = {
  kind: "notebook" | "folder" | "root";
  id: string;
  x: number;
  y: number;
};
type MoveRequest = {
  kind: "notebook" | "folder";
  id: string;
  name: string;
  currentFolderId: string | null;
};

function readDragData(value: unknown): DragData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<DragData>;
  if (
    (data.kind === "notebook" || data.kind === "folder") &&
    typeof data.itemId === "string"
  ) {
    return { kind: data.kind, itemId: data.itemId };
  }
  return null;
}

function readDropData(value: unknown): DropData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<DropData>;
  if (data.kind === "folder") {
    return typeof data.folderId === "string" || data.folderId === null
      ? { kind: "folder", folderId: data.folderId }
      : null;
  }
  if (
    data.kind === "notebook" &&
    typeof data.notebookId === "string" &&
    (typeof data.folderId === "string" || data.folderId === null)
  ) {
    return {
      kind: "notebook",
      notebookId: data.notebookId,
      folderId: data.folderId,
    };
  }
  return null;
}

function FolderRow({
  folder,
  depth,
  hasChildren,
  isExpanded,
  isSelected,
  canAcceptFolder,
  onToggle,
  onSelect,
  onOpenMenu,
}: {
  folder: Folder;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  canAcceptFolder: (sourceFolderId: string, targetFolderId: string) => boolean;
  onToggle: () => void;
  onSelect: () => void;
  onOpenMenu: (event: ReactMouseEvent, kind: "folder", id: string) => void;
}) {
  const {
    ref: dragRef,
    handleRef,
    isDragging,
  } = useDraggable<DragData>({
    id: `folder-source:${folder.id}`,
    data: { kind: "folder", itemId: folder.id },
  });
  const { ref: dropRef, isDropTarget } = useDroppable<DropData>({
    id: `folder-target:${folder.id}`,
    data: { kind: "folder", folderId: folder.id },
    collisionPriority: 20,
    accept: (source) => {
      const dragData = readDragData(source.data);
      return (
        dragData?.kind === "notebook" ||
        (dragData?.kind === "folder" &&
          canAcceptFolder(dragData.itemId, folder.id))
      );
    },
  });
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      dragRef(element);
      dropRef(element);
    },
    [dragRef, dropRef],
  );

  return (
    <div
      ref={setRef}
      role="treeitem"
      tabIndex={0}
      aria-expanded={hasChildren ? isExpanded : undefined}
      onContextMenu={(event) => onOpenMenu(event, "folder", folder.id)}
      className={`group flex items-center rounded-md text-sm transition ${
        isSelected ? "app-selected bg-sky-600 text-white" : "hover:bg-slate-100"
      } ${
        isDragging ? "opacity-45" : ""
      } ${isDropTarget ? "ring-2 ring-sky-500 ring-inset" : ""}`}
      style={{ paddingLeft: depth * 14 + 4 }}
    >
      <button
        ref={handleRef}
        type="button"
        className="h-8 w-6 shrink-0 cursor-grab rounded text-slate-400 opacity-100 active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        aria-label={`Drag ${folder.name}`}
        title="Drag folder"
      >
        ⠿
      </button>
      <button
        type="button"
        className="h-8 w-5 shrink-0"
        onClick={onToggle}
        aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
      >
        {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 truncate py-1.5 text-left"
        onClick={onSelect}
      >
        📁 {folder.name}
      </button>
      <button
        type="button"
        className="h-7 w-7 shrink-0 rounded opacity-100 hover:bg-slate-200/60 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        onClick={(event) => onOpenMenu(event, "folder", folder.id)}
        aria-label={`Actions for ${folder.name}`}
      >
        ⋯
      </button>
    </div>
  );
}

function NotebookRow({
  notebook,
  isActive,
  preview,
  onSelect,
  onOpenMenu,
}: {
  notebook: Notebook;
  isActive: boolean;
  preview: string | null;
  onSelect: () => void;
  onOpenMenu: (event: ReactMouseEvent, kind: "notebook", id: string) => void;
}) {
  const {
    ref: dragRef,
    handleRef,
    isDragging,
  } = useDraggable<DragData>({
    id: `notebook-source:${notebook.id}`,
    data: { kind: "notebook", itemId: notebook.id },
  });
  const { ref: dropRef, isDropTarget } = useDroppable<DropData>({
    id: `notebook-target:${notebook.id}`,
    data: {
      kind: "notebook",
      notebookId: notebook.id,
      folderId: notebook.folderId,
    },
    collisionPriority: 10,
    accept: (source) => readDragData(source.data)?.kind === "notebook",
  });
  const setRef = useCallback(
    (element: HTMLLIElement | null) => {
      dragRef(element);
      dropRef(element);
    },
    [dragRef, dropRef],
  );

  return (
    <li
      ref={setRef}
      onContextMenu={(event) => onOpenMenu(event, "notebook", notebook.id)}
      className={`group relative rounded-md p-2 transition ${
        isActive ? "app-selected bg-sky-600 text-white" : "hover:bg-slate-100"
      } ${isDragging ? "opacity-45" : ""} ${
        isDropTarget
          ? "before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:bg-sky-500"
          : ""
      }`}
    >
      <div className="flex items-start gap-1">
        <button
          ref={handleRef}
          type="button"
          className="relative z-10 h-7 w-6 shrink-0 cursor-grab rounded text-slate-400 opacity-100 active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          aria-label={`Drag ${notebook.title}`}
          title="Drag notebook"
        >
          ⠿
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 text-left before:absolute before:inset-0"
          onClick={onSelect}
        >
          <span className="pointer-events-none block truncate text-sm font-medium">
            📄 {notebook.title}
          </span>
          {preview && (
            <span className="pointer-events-none block truncate text-xs opacity-70">
              {preview}
            </span>
          )}
        </button>
        <button
          type="button"
          className="relative z-10 h-7 w-7 shrink-0 rounded opacity-100 hover:bg-slate-200/20 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          onClick={(event) => onOpenMenu(event, "notebook", notebook.id)}
          aria-label={`Actions for ${notebook.title}`}
        >
          ⋯
        </button>
      </div>
    </li>
  );
}

function RootDropZone({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { ref, isDropTarget } = useDroppable<DropData>({
    id,
    data: { kind: "folder", folderId: null },
  });
  return (
    <div
      ref={ref}
      className={`${className} rounded-md ${isDropTarget ? "ring-2 ring-sky-500 ring-inset" : ""}`}
    >
      {children}
    </div>
  );
}

function locationIsSelected(
  selected: SidebarLocation,
  kind: "all" | "unfiled" | "trash",
): boolean {
  return selected.kind === kind;
}

export default function NotebookSidebar({
  notebooks,
  allNotebooks,
  folders,
  trashItems,
  activeNotebookId,
  selectedLocation,
  searchQuery,
  onSearchChange,
  onSelectLocation,
  onSelectNotebook,
  onCreateNotebook,
  onCreateFolder,
  onRenameNotebook,
  onRenameFolder,
  onDeleteFolder,
  onDeleteNotebook,
  onMoveNotebook,
  onMoveNotebookBefore,
  onMoveFolder,
  onExportNotebook,
  onExportFolder,
  onExportPortableNotebook,
  onExportPortableFolder,
  onImportIntoFolder,
  onImportPortableIntoFolder,
  onRestoreTrashItem,
  onPermanentlyDeleteTrashItem,
  onOpenSettings,
}: NotebookSidebarProps) {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [menuItem, setMenuItem] = useState<MenuItem | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const hoveredFolderIdRef = useRef<string | null>(null);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopedImportInputRef = useRef<HTMLInputElement>(null);
  const portableImportInputRef = useRef<HTMLInputElement>(null);
  const importDestinationFolderIdRef = useRef<string | null>(null);

  const foldersByParent = useMemo(() => {
    const result = new Map<string | null, Folder[]>();
    for (const folder of folders) {
      const siblings = result.get(folder.parentId) ?? [];
      siblings.push(folder);
      result.set(folder.parentId, siblings);
    }
    for (const siblings of result.values()) {
      siblings.sort((left, right) => left.name.localeCompare(right.name));
    }
    return result;
  }, [folders]);

  useEffect(() => {
    if (!menuItem) return;
    const closeMenu = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-sidebar-context-menu]")
      ) {
        return;
      }
      setMenuItem(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuItem(null);
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuItem]);

  useEffect(
    () => () => {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    },
    [],
  );

  function canAcceptFolder(sourceFolderId: string, targetFolderId: string) {
    if (sourceFolderId === targetFolderId) return false;
    const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
    let current = foldersById.get(targetFolderId);
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.parentId === sourceFolderId) return false;
      visited.add(current.id);
      current = current.parentId
        ? foldersById.get(current.parentId)
        : undefined;
    }
    return true;
  }

  function openMenu(
    event: ReactMouseEvent,
    kind: "notebook" | "folder" | "root",
    id: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const x = Math.min(event.clientX, window.innerWidth - 190);
    const y = Math.min(event.clientY, window.innerHeight - 360);
    setMenuItem({ kind, id, x: Math.max(8, x), y: Math.max(8, y) });
  }

  function clearExpandTimer() {
    hoveredFolderIdRef.current = null;
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    expandTimerRef.current = null;
  }

  function scheduleFolderExpansion(folderId: string | null) {
    if (!folderId || hoveredFolderIdRef.current === folderId) return;
    clearExpandTimer();
    hoveredFolderIdRef.current = folderId;
    expandTimerRef.current = setTimeout(() => {
      setExpandedFolderIds((currentIds) => new Set(currentIds).add(folderId));
      expandTimerRef.current = null;
    }, 650);
  }

  function renderFolders(parentId: string | null, depth = 0): ReactNode {
    return (foldersByParent.get(parentId) ?? []).map((folder) => {
      const children = foldersByParent.get(folder.id) ?? [];
      const isExpanded = expandedFolderIds.has(folder.id);
      const isSelected =
        selectedLocation.kind === "folder" &&
        selectedLocation.folderId === folder.id;
      return (
        <div key={folder.id}>
          <FolderRow
            folder={folder}
            depth={depth}
            hasChildren={children.length > 0}
            isExpanded={isExpanded}
            isSelected={isSelected}
            canAcceptFolder={canAcceptFolder}
            onToggle={() =>
              setExpandedFolderIds((currentIds) => {
                const nextIds = new Set(currentIds);
                nextIds.has(folder.id)
                  ? nextIds.delete(folder.id)
                  : nextIds.add(folder.id);
                return nextIds;
              })
            }
            onSelect={() => {
              onSelectLocation({ kind: "folder", folderId: folder.id });
              setExpandedFolderIds((currentIds) =>
                new Set(currentIds).add(folder.id),
              );
            }}
            onOpenMenu={openMenu}
          />
          {isExpanded && renderFolders(folder.id, depth + 1)}
        </div>
      );
    });
  }

  const locationButtonClass = (selected: boolean) =>
    `w-full rounded-md px-3 py-2 text-left text-sm ${
      selected
        ? "app-selected bg-sky-600 text-white"
        : "text-slate-700 hover:bg-slate-100"
    }`;
  const menuNotebook =
    menuItem?.kind === "notebook"
      ? allNotebooks.find((notebook) => notebook.id === menuItem.id)
      : undefined;
  const menuFolder =
    menuItem?.kind === "folder"
      ? folders.find((folder) => folder.id === menuItem.id)
      : undefined;

  function chooseScopedImport(destinationFolderId: string | null) {
    importDestinationFolderIdRef.current = destinationFolderId;
    if (scopedImportInputRef.current) {
      scopedImportInputRef.current.value = "";
      scopedImportInputRef.current.click();
    }
  }

  function choosePortableImport(destinationFolderId: string | null) {
    importDestinationFolderIdRef.current = destinationFolderId;
    if (portableImportInputRef.current) {
      portableImportInputRef.current.value = "";
      portableImportInputRef.current.click();
    }
  }

  return (
    <DragDropProvider
      onDragOver={(event) => {
        const target = readDropData(event.operation.target?.data);
        scheduleFolderExpansion(
          target?.kind === "folder" ? target.folderId : null,
        );
      }}
      onDragEnd={(event) => {
        clearExpandTimer();
        if (event.canceled) return;
        const source = readDragData(event.operation.source?.data);
        const target = readDropData(event.operation.target?.data);
        if (!source || !target) return;

        if (target.kind === "notebook") {
          if (source.kind === "notebook") {
            onMoveNotebookBefore(source.itemId, target.notebookId);
          }
          return;
        }
        if (source.kind === "notebook") {
          onMoveNotebook(source.itemId, target.folderId);
        } else {
          onMoveFolder(source.itemId, target.folderId);
        }
      }}
    >
      <aside className="flex w-full flex-col border-b border-slate-200 bg-white md:h-screen md:w-80 md:border-r md:border-b-0">
        <input
          ref={scopedImportInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Import notebook or folder export"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onImportIntoFolder(importDestinationFolderIdRef.current, file);
            }
          }}
        />
        <input
          ref={portableImportInputRef}
          type="file"
          accept="application/zip,.zip"
          className="hidden"
          aria-label="Import portable notebook or folder archive"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onImportPortableIntoFolder(
                importDestinationFolderIdRef.current,
                file,
              );
            }
          }}
        />
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Notebook</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Open settings"
                title="Settings"
              >
                ⚙
              </button>
              <UserButton />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onCreateNotebook()}
              className={primaryButtonClass}
            >
              + Note
            </button>
            <button
              type="button"
              onClick={() => onCreateFolder()}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              + Folder
            </button>
          </div>
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search notebooks..."
            className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <nav aria-label="Notebook locations" className="space-y-1">
            <button
              type="button"
              className={locationButtonClass(
                locationIsSelected(selectedLocation, "all"),
              )}
              onClick={() => onSelectLocation({ kind: "all" })}
            >
              All notes ({allNotebooks.length})
            </button>
            <RootDropZone id="root-target:unfiled">
              <button
                type="button"
                onContextMenu={(event) => openMenu(event, "root", "root")}
                className={locationButtonClass(
                  locationIsSelected(selectedLocation, "unfiled"),
                )}
                onClick={() => onSelectLocation({ kind: "unfiled" })}
              >
                Unfiled
              </button>
            </RootDropZone>
            <button
              type="button"
              className={locationButtonClass(
                locationIsSelected(selectedLocation, "trash"),
              )}
              onClick={() => onSelectLocation({ kind: "trash" })}
            >
              Trash {trashItems.length > 0 ? `(${trashItems.length})` : ""}
            </button>
          </nav>

          <div className="mt-4">
            <p className="px-2 text-xs font-semibold uppercase text-slate-400">
              Folders
            </p>
            <RootDropZone id="root-target:folder-list" className="mt-1 min-h-8">
              <div role="tree">
                {renderFolders(null)}
                {folders.length === 0 && (
                  <p className="px-2 py-2 text-sm text-slate-400">
                    No folders yet.
                  </p>
                )}
              </div>
            </RootDropZone>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="px-2 text-xs font-semibold uppercase text-slate-400">
              {selectedLocation.kind === "trash" ? "Trash" : "Notes"}
            </p>
            <ul className="mt-1 space-y-1">
              {selectedLocation.kind === "trash"
                ? trashItems.map((item) => (
                    <li
                      key={`${item.kind}:${item.id}`}
                      className="rounded-md border border-slate-200 p-2"
                    >
                      <p className="truncate text-sm font-medium">
                        {item.kind === "folder" ? "📁" : "📄"} {item.name}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-sky-700"
                          onClick={() => onRestoreTrashItem(item)}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-600"
                          onClick={() => onPermanentlyDeleteTrashItem(item)}
                        >
                          Delete permanently
                        </button>
                      </div>
                    </li>
                  ))
                : notebooks.map((notebook) => (
                    <NotebookRow
                      key={notebook.id}
                      notebook={notebook}
                      isActive={notebook.id === activeNotebookId}
                      preview={getNotebookSearchPreview(notebook, searchQuery)}
                      onSelect={() => onSelectNotebook(notebook.id)}
                      onOpenMenu={openMenu}
                    />
                  ))}
              {selectedLocation.kind === "trash" && trashItems.length === 0 && (
                <li className="px-2 py-3 text-sm text-slate-400">
                  Trash is empty.
                </li>
              )}
              {selectedLocation.kind !== "trash" && notebooks.length === 0 && (
                <li className="px-2 py-3 text-sm text-slate-400">
                  No notebooks found.
                </li>
              )}
            </ul>
          </div>
        </div>
      </aside>

      {menuItem?.kind === "root" && (
        <div
          data-sidebar-context-menu
          role="menu"
          className="fixed z-50 w-44 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-xl"
          style={{ left: menuItem.x, top: menuItem.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              onSelectLocation({ kind: "unfiled" });
              setMenuItem(null);
            }}
          >
            Open Unfiled
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              onCreateNotebook(null);
              setMenuItem(null);
            }}
          >
            New notebook
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              onCreateFolder(null);
              setMenuItem(null);
            }}
          >
            New folder
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              chooseScopedImport(null);
              setMenuItem(null);
            }}
          >
            Import here…
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              choosePortableImport(null);
              setMenuItem(null);
            }}
          >
            Import portable ZIP…
          </button>
        </div>
      )}

      {menuItem && (menuNotebook || menuFolder) && (
        <div
          data-sidebar-context-menu
          role="menu"
          className="fixed z-50 w-44 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-xl"
          style={{ left: menuItem.x, top: menuItem.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              if (menuNotebook) onSelectNotebook(menuNotebook.id);
              if (menuFolder) {
                onSelectLocation({ kind: "folder", folderId: menuFolder.id });
                setExpandedFolderIds((ids) => new Set(ids).add(menuFolder.id));
              }
              setMenuItem(null);
            }}
          >
            Open
          </button>
          {menuFolder && (
            <>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
                onClick={() => {
                  onCreateNotebook(menuFolder.id);
                  setMenuItem(null);
                }}
              >
                New notebook
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
                onClick={() => {
                  onCreateFolder(menuFolder.id);
                  setMenuItem(null);
                }}
              >
                New subfolder
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              if (menuNotebook) onRenameNotebook(menuNotebook);
              if (menuFolder) onRenameFolder(menuFolder);
              setMenuItem(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              if (menuNotebook) {
                setMoveRequest({
                  kind: "notebook",
                  id: menuNotebook.id,
                  name: menuNotebook.title,
                  currentFolderId: menuNotebook.folderId,
                });
              }
              if (menuFolder) {
                setMoveRequest({
                  kind: "folder",
                  id: menuFolder.id,
                  name: menuFolder.name,
                  currentFolderId: menuFolder.parentId,
                });
              }
              setMenuItem(null);
            }}
          >
            Move to…
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              if (menuNotebook) onExportNotebook(menuNotebook.id);
              if (menuFolder) onExportFolder(menuFolder.id);
              setMenuItem(null);
            }}
          >
            Export {menuFolder ? "folder" : "notebook"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              if (menuNotebook) onExportPortableNotebook(menuNotebook.id);
              if (menuFolder) onExportPortableFolder(menuFolder.id);
              setMenuItem(null);
            }}
          >
            Export portable ZIP
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              chooseScopedImport(
                menuFolder ? menuFolder.id : (menuNotebook?.folderId ?? null),
              );
              setMenuItem(null);
            }}
          >
            {menuFolder ? "Import into folder…" : "Import beside notebook…"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              choosePortableImport(
                menuFolder ? menuFolder.id : (menuNotebook?.folderId ?? null),
              );
              setMenuItem(null);
            }}
          >
            Import portable ZIP…
          </button>
          <div className="my-1 border-t border-slate-200" />
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left text-red-600 hover:bg-red-50"
            onClick={() => {
              if (menuNotebook) onDeleteNotebook(menuNotebook.id);
              if (menuFolder) onDeleteFolder(menuFolder);
              setMenuItem(null);
            }}
          >
            Move to Trash
          </button>
        </div>
      )}

      {moveRequest && (
        <MoveToFolderDialog
          itemKind={moveRequest.kind}
          itemId={moveRequest.id}
          itemName={moveRequest.name}
          currentFolderId={moveRequest.currentFolderId}
          folders={folders}
          onClose={() => setMoveRequest(null)}
          onMove={(folderId) => {
            if (moveRequest.kind === "notebook") {
              onMoveNotebook(moveRequest.id, folderId);
            } else {
              onMoveFolder(moveRequest.id, folderId);
            }
            setMoveRequest(null);
          }}
        />
      )}
    </DragDropProvider>
  );
}
