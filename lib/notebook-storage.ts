import type {
  DrawingCell,
  Notebook,
  NotebookCell,
  NotebookExport,
  TextCell,
} from "./types";

const STORAGE_KEY = "note-taking-app:notebooks";

interface StoredNotebooks {
  version: 1;
  notebooks: Notebook[];
}

export function loadStoredNotebooks(): Notebook[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);

    if (!isStoredNotebooks(parsedValue)) {
      return null;
    }

    return parsedValue.notebooks;
  } catch {
    return null;
  }
}

export function saveStoredNotebooks(notebooks: Notebook[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const storedNotebooks: StoredNotebooks = {
    version: 1,
    notebooks,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedNotebooks));
  } catch {
    // Ignore storage failures for now.
  }
}

function isStoredNotebooks(value: unknown): value is StoredNotebooks {
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

export function createNotebookExport(notebooks: Notebook[]): NotebookExport {
  return {
    version: 1,
    notebooks,
    exportedAt: Date.now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

function isNotebook(value: unknown): value is Notebook {
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

function isNotebookExport(value: unknown): value is NotebookExport {
  if (!isRecord(value)) return false;

  return (
    value.version === 1 &&
    Array.isArray(value.notebooks) &&
    value.notebooks.length > 0 &&
    value.notebooks.every(isNotebook) &&
    typeof value.exportedAt === "number"
  );
}

export function parseNotebookExport(fileText: string): Notebook[] | null {
  try {
    const parsedValue: unknown = JSON.parse(fileText);

    if (!isNotebookExport(parsedValue)) {
      return null;
    }

    return parsedValue.notebooks;
  } catch {
    return null;
  }
}
