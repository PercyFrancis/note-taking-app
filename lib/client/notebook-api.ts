import {
  isNotebookResponse,
  isNotebooksResponse,
} from "../notebook-validation";
import type { CreateNotebookInput, Notebook } from "../types";

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
