import type { CreateNotebookInput, Notebook } from "../types";
import { createDefaultNotebook } from "../utils";

export async function getNotebooks(): Promise<Notebook[]> {
  return [];
}

export async function createNotebook(
  input: CreateNotebookInput,
): Promise<Notebook> {
  const notebook = createDefaultNotebook();

  return {
    ...notebook,
    title: input.title,
  };
}
