import type {
  Folder,
  ImportedCell,
  Notebook,
  ScopedExportFolder,
  ScopedExportNotebook,
  ScopedWorkspaceExport,
} from "./types";

function exportCells(notebook: Notebook): ImportedCell[] {
  return notebook.cells.map((cell) => {
    if (cell.type === "text") {
      return {
        type: "text",
        content: cell.content,
        heightPx: cell.heightPx,
      };
    }
    return {
      type: cell.type,
      drawing: cell.drawing,
      heightPx: cell.heightPx,
    };
  });
}

function exportNotebook(
  notebook: Notebook,
  folderId: string | null,
): ScopedExportNotebook {
  return {
    title: notebook.title,
    folderId,
    cells: exportCells(notebook),
  };
}

export function createScopedNotebookExport(
  notebook: Notebook,
): ScopedWorkspaceExport {
  return {
    version: 2,
    kind: "notebook",
    exportedAt: Date.now(),
    rootFolderId: null,
    folders: [],
    notebooks: [exportNotebook(notebook, null)],
  };
}

export function createScopedFolderExport(
  rootFolderId: string,
  folders: Folder[],
  notebooks: Notebook[],
): ScopedWorkspaceExport | null {
  const rootFolder = folders.find((folder) => folder.id === rootFolderId);
  if (!rootFolder) return null;

  const includedFolderIds = new Set([rootFolderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (
        folder.parentId &&
        includedFolderIds.has(folder.parentId) &&
        !includedFolderIds.has(folder.id)
      ) {
        includedFolderIds.add(folder.id);
        changed = true;
      }
    }
  }

  return {
    version: 2,
    kind: "folder",
    exportedAt: Date.now(),
    rootFolderId,
    folders: folders
      .filter((folder) => includedFolderIds.has(folder.id))
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.id === rootFolderId ? null : folder.parentId,
      })),
    notebooks: notebooks
      .filter(
        (notebook) =>
          notebook.folderId !== null &&
          includedFolderIds.has(notebook.folderId),
      )
      .map((notebook) => exportNotebook(notebook, notebook.folderId)),
  };
}

export function hasValidScopedFolderHierarchy(
  folders: ScopedExportFolder[],
  rootFolderId: string,
): boolean {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  if (foldersById.get(rootFolderId)?.parentId !== null) return false;

  for (const folder of folders) {
    if (folder.id !== rootFolderId && folder.parentId === null) return false;

    const visited = new Set<string>();
    let current = folder;
    while (current.id !== rootFolderId) {
      if (visited.has(current.id) || !current.parentId) return false;
      visited.add(current.id);
      const parent = foldersById.get(current.parentId);
      if (!parent) return false;
      current = parent;
    }
  }
  return true;
}

export function createExportFilename(
  name: string,
  kind: "notebook" | "folder",
) {
  const safeName = name
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*]/g, "-")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${safeName || kind}-${kind}-export.json`;
}
