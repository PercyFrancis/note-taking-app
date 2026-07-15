import {
  isCellResponse,
  isNotebookResponse,
  isNotebooksResponse,
} from "../notebook-validation";

import type {
  CreateCellInput,
  CreateNotebookInput,
  ImportNotebooksInput,
  Notebook,
  NotebookCell,
  ReorderCellsInput,
  ReorderNotebooksInput,
  UpdateCellInput,
  UpdateNotebookInput,
} from "../types";

export async function loadRemoteNotebooks(): Promise<Notebook[]> {
  const response = await fetch("/api/notebooks");

  if (!response.ok) {
    throw new Error("Failed to load notebooks");
  }

  const data: unknown = await response.json();

  if (!isNotebooksResponse(data)) {
    throw new Error("Invalid notebooks response");
  }

  return data.notebooks;
}

export async function createRemoteNotebook(
  input: CreateNotebookInput,
): Promise<Notebook> {
  const response = await fetch("/api/notebooks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to create notebook");
  }

  const data: unknown = await response.json();

  if (!isNotebookResponse(data)) {
    throw new Error("Invalid notebook response");
  }

  return data.notebook;
}

export async function updateRemoteNotebook(
  notebookId: string,
  input: UpdateNotebookInput,
): Promise<void> {
  const response = await fetch(`/api/notebooks/${notebookId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to update notebook");
  }
}

export async function deleteRemoteNotebook(notebookId: string): Promise<void> {
  const response = await fetch(`/api/notebooks/${notebookId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete notebook");
  }
}

export async function createRemoteCell(
  notebookId: string,
  input: CreateCellInput,
): Promise<NotebookCell> {
  const response = await fetch(`/api/notebooks/${notebookId}/cells`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to create cell");
  }

  const data: unknown = await response.json();

  if (!isCellResponse(data)) {
    throw new Error("Invalid cell response");
  }

  return data.cell;
}

export async function deleteRemoteCell(cellId: string): Promise<void> {
  const response = await fetch(`/api/cells/${cellId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete cell");
  }
}

export async function updateRemoteCell(
  cellId: string,
  input: UpdateCellInput,
): Promise<NotebookCell> {
  const response = await fetch(`/api/cells/${cellId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to update cell");
  }

  const data: unknown = await response.json();

  if (!isCellResponse(data)) {
    throw new Error("Invalid cell response");
  }

  return data.cell;
}

export async function reorderRemoteCells(
  notebookId: string,
  input: ReorderCellsInput,
): Promise<void> {
  const response = await fetch(`/api/notebooks/${notebookId}/cells/reorder`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to reorder cells");
  }
}

export async function duplicateRemoteCell(
  cellId: string,
): Promise<NotebookCell> {
  const response = await fetch(`/api/cells/${cellId}/duplicate`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to duplicate cell");
  }

  const data: unknown = await response.json();

  if (!isCellResponse(data)) {
    throw new Error("Invalid cell response");
  }

  return data.cell;
}

export async function reorderRemoteNotebooks(
  input: ReorderNotebooksInput,
): Promise<void> {
  const response = await fetch(`/api/notebooks/reorder`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to reorder notebooks");
  }
}

export async function importRemoteNotebooks(
  input: ImportNotebooksInput,
): Promise<Notebook[]> {
  const response = await fetch("/api/notebooks/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to import notebooks");
  }

  const data: unknown = await response.json();

  if (!isNotebooksResponse(data)) {
    throw new Error("Invalid notebook response");
  }

  return data.notebooks;
}
