import type {
  CreateNotebookInput,
  DrawingCell,
  Notebook,
  NotebookCell,
  NotebookExport,
  NotebookResponse,
  NotebooksResponse,
  StoredNotebooks,
  TextCell,
} from "./types";

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
