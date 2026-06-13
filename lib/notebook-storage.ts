import type { Notebook } from "./types";

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
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { version?: unknown; notebooks?: unknown };

  return candidate.version === 1 && Array.isArray(candidate.notebooks);
}
