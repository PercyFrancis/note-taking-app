import { isValidStoredExcalidrawScene } from "./excalidraw-scene";
import { normalizeFolderName } from "./folders";
import { hasValidScopedFolderHierarchy } from "./scoped-workspace-transfer";
import type {
  AttachmentMutationResponse,
  CellResponse,
  CreateCellInput,
  CreateFolderInput,
  CreateNotebookInput,
  DrawingCell,
  ExcalidrawCell,
  FolderResponse,
  FoldersResponse,
  ImportedCell,
  ImportedDrawingCell,
  ImportedExcalidrawCell,
  ImportedNotebook,
  ImportedTextCell,
  ImportNotebooksInput,
  MoveNotebookInput,
  Notebook,
  NotebookCell,
  NotebookExport,
  NotebookResponse,
  NotebooksResponse,
  ReorderCellsInput,
  ReorderNotebooksInput,
  RestoreCellInput,
  ScopedExportNotebook,
  ScopedWorkspaceExport,
  ScopedWorkspaceImportInput,
  ScopedWorkspaceImportResponse,
  StoredNotebooks,
  TextCell,
  TrashItem,
  TrashResponse,
  UpdateCellInput,
  UpdateFolderInput,
  UpdateNotebookInput,
  UploadedImagesResponse,
} from "./types";
import { isUuid } from "./utils";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isTextCell(value: unknown): value is TextCell {
  if (!isRecord(value)) return false;

  return (
    value.type === "text" &&
    typeof value.id === "string" &&
    typeof value.content === "string" &&
    typeof value.heightPx === "number" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}
function isDrawingCell(value: unknown): value is DrawingCell {
  if (!isRecord(value)) return false;

  return (
    value.type === "drawing" &&
    typeof value.id === "string" &&
    (typeof value.drawing === "string" || value.drawing === null) &&
    typeof value.heightPx === "number" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}
function isExcalidrawCell(value: unknown): value is ExcalidrawCell {
  if (!isRecord(value)) return false;

  return (
    value.type === "excalidraw" &&
    typeof value.id === "string" &&
    (typeof value.drawing === "string" || value.drawing === null) &&
    isValidStoredExcalidrawScene(value.drawing) &&
    typeof value.heightPx === "number" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}
export function isNotebookCell(value: unknown): value is NotebookCell {
  return isTextCell(value) || isDrawingCell(value) || isExcalidrawCell(value);
}
export function isNotebook(value: unknown): value is Notebook {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (value.folderId === undefined ||
      value.folderId === null ||
      (typeof value.folderId === "string" && isUuid(value.folderId))) &&
    Array.isArray(value.cells) &&
    value.cells.every(isNotebookCell) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}
export function isNotebookExport(value: unknown): value is NotebookExport {
  if (!isRecord(value)) return false;

  return (
    value.version === 1 &&
    Array.isArray(value.notebooks) &&
    value.notebooks.length > 0 &&
    value.notebooks.every(isNotebook) &&
    typeof value.exportedAt === "number"
  );
}
export function isStoredNotebooks(value: unknown): value is StoredNotebooks {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    Array.isArray(value.notebooks) &&
    value.notebooks.length > 0 &&
    value.notebooks.every(isNotebook)
  );
}

export function isCreateNotebookInput(
  value: unknown,
): value is CreateNotebookInput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    (value.folderId === undefined ||
      value.folderId === null ||
      (typeof value.folderId === "string" && isUuid(value.folderId)))
  );
}

export function isCreateFolderInput(
  value: unknown,
): value is CreateFolderInput {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (value.parentId === undefined ||
      value.parentId === null ||
      (typeof value.parentId === "string" && isUuid(value.parentId)))
  );
}

export function isUpdateFolderInput(
  value: unknown,
): value is UpdateFolderInput {
  if (!isRecord(value)) return false;

  if (value.action === "rename") return typeof value.name === "string";
  if (value.action === "move") {
    return (
      value.parentId === null ||
      (typeof value.parentId === "string" && isUuid(value.parentId))
    );
  }

  return false;
}

export function isMoveNotebookInput(
  value: unknown,
): value is MoveNotebookInput {
  return (
    isRecord(value) &&
    (value.folderId === null ||
      (typeof value.folderId === "string" && isUuid(value.folderId)))
  );
}

function isFolder(value: unknown): value is FolderResponse["folder"] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isUuid(value.id) &&
    typeof value.name === "string" &&
    (value.parentId === null ||
      (typeof value.parentId === "string" && isUuid(value.parentId))) &&
    typeof value.position === "number" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

export function isFoldersResponse(value: unknown): value is FoldersResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.folders) &&
    value.folders.every(isFolder)
  );
}

export function isFolderResponse(value: unknown): value is FolderResponse {
  return isRecord(value) && isFolder(value.folder);
}

export function isTrashResponse(value: unknown): value is TrashResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(
      (item): item is TrashItem =>
        isRecord(item) &&
        typeof item.id === "string" &&
        isUuid(item.id) &&
        (item.kind === "folder" || item.kind === "notebook") &&
        typeof item.name === "string" &&
        typeof item.trashedAt === "number",
    )
  );
}

export function isNotebooksResponse(
  value: unknown,
): value is NotebooksResponse {
  if (!isRecord(value)) {
    return false;
  }

  return Array.isArray(value.notebooks) && value.notebooks.every(isNotebook);
}

export function isNotebookResponse(value: unknown): value is NotebookResponse {
  if (!isRecord(value)) {
    return false;
  }

  return isNotebook(value.notebook);
}

export function isUpdateNotebookInput(
  value: unknown,
): value is UpdateNotebookInput {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.title === "string";
}

export function isCreateCellInput(value: unknown): value is CreateCellInput {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidType =
    value.type === "text" ||
    value.type === "drawing" ||
    value.type === "excalidraw";

  const hasValidAfterCellId =
    value.afterCellId === undefined ||
    value.afterCellId === null ||
    (typeof value.afterCellId === "string" && isUuid(value.afterCellId));

  return hasValidType && hasValidAfterCellId;
}

export function isRestoreCellInput(value: unknown): value is RestoreCellInput {
  if (!isRecord(value) || !isNotebookCell(value.cell)) {
    return false;
  }

  return (
    isUuid(value.cell.id) &&
    typeof value.position === "number" &&
    Number.isInteger(value.position) &&
    value.position >= 0
  );
}

export function isCellResponse(value: unknown): value is CellResponse {
  if (!isRecord(value)) {
    return false;
  }

  return isNotebookCell(value.cell);
}

export function isUploadedImagesResponse(
  value: unknown,
): value is UploadedImagesResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.images) ||
    typeof value.truncated !== "boolean"
  ) {
    return false;
  }

  return value.images.every(
    (image) =>
      isRecord(image) &&
      typeof image.id === "string" &&
      isUuid(image.id) &&
      typeof image.pathname === "string" &&
      typeof image.url === "string" &&
      typeof image.filename === "string" &&
      typeof image.originalFilename === "string" &&
      typeof image.size === "number" &&
      typeof image.uploadedAt === "number" &&
      (image.cellId === null ||
        (typeof image.cellId === "string" && isUuid(image.cellId))) &&
      (image.trashedAt === null || typeof image.trashedAt === "number"),
  );
}

export function isAttachmentMutationResponse(
  value: unknown,
): value is AttachmentMutationResponse {
  return (
    isRecord(value) &&
    isUploadedImagesResponse({ images: [value.image], truncated: false })
  );
}

export function isUpdateCellInput(value: unknown): value is UpdateCellInput {
  if (!isRecord(value)) {
    return false;
  }

  const hasContent = "content" in value;
  const hasDrawing = "drawing" in value;
  const hasHeightPx = "heightPx" in value;

  const hasAtLeastOneField = hasContent || hasDrawing || hasHeightPx;

  const hasValidContent = !hasContent || typeof value.content === "string";

  const hasValidDrawing =
    !hasDrawing || typeof value.drawing === "string" || value.drawing === null;

  const doesNotMixCellSpecificFields = !(hasContent && hasDrawing);

  const hasValidHeightPx =
    !hasHeightPx ||
    (typeof value.heightPx === "number" &&
      Number.isFinite(value.heightPx) &&
      value.heightPx >= 120 &&
      value.heightPx <= 720);

  return (
    hasAtLeastOneField &&
    doesNotMixCellSpecificFields &&
    hasValidContent &&
    hasValidDrawing &&
    hasValidHeightPx
  );
}

export function isReorderCellsInput(
  value: unknown,
): value is ReorderCellsInput {
  if (!isRecord(value)) {
    return false;
  }

  if (!Array.isArray(value.cellIds)) {
    return false;
  }

  if (value.cellIds.length === 0) {
    return false;
  }

  const allIdsAreUuids = value.cellIds.every(
    (cellId) => typeof cellId === "string" && isUuid(cellId),
  );

  const uniqueCellIds = new Set(value.cellIds);

  return allIdsAreUuids && uniqueCellIds.size === value.cellIds.length;
}

export function isReorderNotebooksInput(
  value: unknown,
): value is ReorderNotebooksInput {
  if (!isRecord(value)) {
    return false;
  }

  if (!Array.isArray(value.notebookIds)) {
    return false;
  }

  if (value.notebookIds.length === 0) {
    return false;
  }

  const allIdsAreUuids = value.notebookIds.every(
    (notebookId) => typeof notebookId === "string" && isUuid(notebookId),
  );

  const uniqueNotebookIds = new Set(value.notebookIds);

  return allIdsAreUuids && uniqueNotebookIds.size === value.notebookIds.length;
}

export function isImportedTextCell(value: unknown): value is ImportedTextCell {
  if (!isRecord(value)) return false;
  return (
    value.type === "text" &&
    typeof value.content === "string" &&
    typeof value.heightPx === "number" &&
    Number.isFinite(value.heightPx) &&
    value.heightPx >= 120 &&
    value.heightPx <= 720
  );
}

export function isImportedDrawingCell(
  value: unknown,
): value is ImportedDrawingCell {
  if (!isRecord(value)) return false;
  return (
    value.type === "drawing" &&
    (typeof value.drawing === "string" || value.drawing === null) &&
    typeof value.heightPx === "number" &&
    Number.isFinite(value.heightPx) &&
    value.heightPx >= 120 &&
    value.heightPx <= 720
  );
}

export function isImportedExcalidrawCell(
  value: unknown,
): value is ImportedExcalidrawCell {
  if (!isRecord(value)) return false;
  return (
    value.type === "excalidraw" &&
    (typeof value.drawing === "string" || value.drawing === null) &&
    isValidStoredExcalidrawScene(value.drawing) &&
    typeof value.heightPx === "number" &&
    Number.isFinite(value.heightPx) &&
    value.heightPx >= 120 &&
    value.heightPx <= 720
  );
}

export function isImportedCell(value: unknown): value is ImportedCell {
  return (
    isImportedTextCell(value) ||
    isImportedDrawingCell(value) ||
    isImportedExcalidrawCell(value)
  );
}

function isImportedNotebook(value: unknown): value is ImportedNotebook {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    Array.isArray(value.cells) &&
    value.cells.every(isImportedCell)
  );
}

export function isImportNotebooksInput(
  value: unknown,
): value is ImportNotebooksInput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.mode === "append" || value.mode === "replace") &&
    Array.isArray(value.notebooks) &&
    value.notebooks.every(isImportedNotebook) &&
    value.notebooks.length > 0
  );
}

export function isScopedWorkspaceExport(
  value: unknown,
): value is ScopedWorkspaceExport {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    (value.kind !== "notebook" && value.kind !== "folder") ||
    typeof value.exportedAt !== "number" ||
    !Number.isFinite(value.exportedAt) ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.notebooks)
  ) {
    return false;
  }

  const folderIds = new Set<string>();
  for (const folder of value.folders) {
    if (
      !isRecord(folder) ||
      typeof folder.id !== "string" ||
      !isUuid(folder.id) ||
      folderIds.has(folder.id) ||
      typeof folder.name !== "string" ||
      normalizeFolderName(folder.name) !== folder.name ||
      !(
        folder.parentId === null ||
        (typeof folder.parentId === "string" && isUuid(folder.parentId))
      )
    ) {
      return false;
    }
    folderIds.add(folder.id);
  }

  for (const notebook of value.notebooks) {
    const folderId = isRecord(notebook) ? notebook.folderId : undefined;
    if (
      !isImportedNotebook(notebook) ||
      !(
        folderId === null ||
        (typeof folderId === "string" && folderIds.has(folderId))
      )
    ) {
      return false;
    }
  }
  const notebooks = value.notebooks as ScopedExportNotebook[];

  if (value.kind === "notebook") {
    return (
      value.rootFolderId === null &&
      value.folders.length === 0 &&
      notebooks.length === 1 &&
      notebooks[0].folderId === null
    );
  }

  if (
    typeof value.rootFolderId !== "string" ||
    !folderIds.has(value.rootFolderId)
  ) {
    return false;
  }

  return (
    hasValidScopedFolderHierarchy(value.folders, value.rootFolderId) &&
    notebooks.every((notebook) => notebook.folderId !== null)
  );
}

export function isScopedWorkspaceImportInput(
  value: unknown,
): value is ScopedWorkspaceImportInput {
  return (
    isRecord(value) &&
    (value.destinationFolderId === null ||
      (typeof value.destinationFolderId === "string" &&
        isUuid(value.destinationFolderId))) &&
    isScopedWorkspaceExport(value.workspace)
  );
}

export function isScopedWorkspaceImportResponse(
  value: unknown,
): value is ScopedWorkspaceImportResponse {
  return (
    isRecord(value) &&
    (value.rootFolderId === null ||
      (typeof value.rootFolderId === "string" && isUuid(value.rootFolderId)))
  );
}
