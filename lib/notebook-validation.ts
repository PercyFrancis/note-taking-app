import type {
  CellResponse,
  CreateCellInput,
  CreateNotebookInput,
  DrawingCell,
  Notebook,
  NotebookCell,
  NotebookExport,
  NotebookResponse,
  NotebooksResponse,
  ReorderCellsInput,
  StoredNotebooks,
  TextCell,
  UpdateCellInput,
  UpdateNotebookInput,
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
function isNotebookCell(value: unknown): value is NotebookCell {
  return isTextCell(value) || isDrawingCell(value);
}
export function isNotebook(value: unknown): value is Notebook {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
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

  return typeof value.title === "string";
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

  const hasValidType = value.type === "text" || value.type === "drawing";

  const hasValidAfterCellId =
    value.afterCellId === undefined ||
    value.afterCellId === null ||
    (typeof value.afterCellId === "string" && isUuid(value.afterCellId));

  return hasValidType && hasValidAfterCellId;
}

export function isCellResponse(value: unknown): value is CellResponse {
  if (!isRecord(value)) {
    return false;
  }

  return isNotebookCell(value.cell);
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
