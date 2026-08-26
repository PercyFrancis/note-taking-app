import type { ImportNotebooksInput, Notebook } from "./types";

export function createNotebookImportInput(
  notebooks: Notebook[],
  mode: ImportNotebooksInput["mode"],
): ImportNotebooksInput {
  return {
    mode,
    notebooks: notebooks.map((notebook) => ({
      title: notebook.title,
      cells: notebook.cells.map((cell) => {
        if (cell.type === "text") {
          return {
            type: "text",
            content: cell.content,
            heightPx: cell.heightPx,
          };
        }

        return {
          type: cell.type,
          drawing: cell.drawing,
          heightPx: cell.heightPx,
        };
      }),
    })),
  };
}
