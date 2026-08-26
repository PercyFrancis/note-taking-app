import type { ScopedExportFolder, ScopedWorkspaceImportInput } from "../types";
import { createId } from "../utils";
import { sql } from "./db";

interface ChangedRow {
  id: string;
}

function orderFoldersParentFirst(
  folders: ScopedExportFolder[],
): ScopedExportFolder[] {
  const remaining = new Map(folders.map((folder) => [folder.id, folder]));
  const ordered: ScopedExportFolder[] = [];
  const addedIds = new Set<string>();

  while (remaining.size > 0) {
    let addedFolder = false;
    for (const [folderId, folder] of remaining) {
      if (folder.parentId === null || addedIds.has(folder.parentId)) {
        ordered.push(folder);
        addedIds.add(folderId);
        remaining.delete(folderId);
        addedFolder = true;
      }
    }
    if (!addedFolder) throw new Error("Invalid folder hierarchy");
  }

  return ordered;
}

export async function importScopedWorkspace(
  userId: string,
  input: ScopedWorkspaceImportInput,
): Promise<string | null> {
  if (input.destinationFolderId) {
    const destinationRows = (await sql.query(
      `
        select id
        from folders
        where id = $1 and user_id = $2 and trashed_at is null
      `,
      [input.destinationFolderId, userId],
    )) as ChangedRow[];
    if (destinationRows.length === 0) {
      throw new Error("Destination folder not found");
    }
  }

  const orderedFolders = orderFoldersParentFirst(input.workspace.folders);
  const importedFolderIds = new Map(
    orderedFolders.map((folder) => [folder.id, createId()]),
  );
  const preparedNotebooks = input.workspace.notebooks.map((notebook) => ({
    id: createId(),
    title: notebook.title,
    folderId:
      notebook.folderId === null
        ? input.destinationFolderId
        : (importedFolderIds.get(notebook.folderId) ?? null),
    cells: notebook.cells.map((cell) => ({ ...cell, id: createId() })),
  }));

  await sql.transaction((txn) => [
    ...orderedFolders.map((folder) => {
      const folderId = importedFolderIds.get(folder.id);
      if (!folderId) throw new Error("Folder ID mapping failed");
      const parentId =
        folder.parentId === null
          ? input.destinationFolderId
          : (importedFolderIds.get(folder.parentId) ?? null);
      return txn`
        insert into folders (
          id, user_id, parent_id, name, position, created_at, updated_at
        )
        values (
          ${folderId},
          ${userId},
          ${parentId},
          ${folder.name},
          coalesce((
            select max(position) + 1
            from folders
            where user_id = ${userId}
              and parent_id is not distinct from ${parentId}::uuid
              and trashed_at is null
          ), 0),
          now(),
          now()
        )
      `;
    }),
    ...preparedNotebooks.map(
      (notebook) => txn`
        insert into notebooks (
          id, user_id, folder_id, title, position, created_at, updated_at
        )
        values (
          ${notebook.id},
          ${userId},
          ${notebook.folderId},
          ${notebook.title},
          coalesce((
            select max(position) + 1
            from notebooks
            where user_id = ${userId}
              and folder_id is not distinct from ${notebook.folderId}::uuid
              and trashed_at is null
          ), 0),
          now(),
          now()
        )
      `,
    ),
    ...preparedNotebooks.flatMap((notebook) =>
      notebook.cells.map(
        (cell, cellIndex) => txn`
          insert into cells (
            id, notebook_id, type, position, content, drawing, height_px,
            created_at, updated_at
          )
          values (
            ${cell.id},
            ${notebook.id},
            ${cell.type},
            ${cellIndex},
            ${cell.type === "text" ? cell.content : null},
            ${cell.type !== "text" ? cell.drawing : null},
            ${cell.heightPx},
            now(),
            now()
          )
        `,
      ),
    ),
  ]);

  return input.workspace.rootFolderId
    ? (importedFolderIds.get(input.workspace.rootFolderId) ?? null)
    : null;
}
