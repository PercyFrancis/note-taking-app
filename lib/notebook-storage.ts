import { isNotebookExport, isStoredNotebooks } from "./notebook-validation";
import type { Notebook, NotebookExport, StoredNotebooks } from "./types";

const STORAGE_KEY = "note-taking-app:notebooks";

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

export function createNotebookExport(notebooks: Notebook[]): NotebookExport {
  return {
    version: 1,
    notebooks,
    exportedAt: Date.now(),
  };
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
