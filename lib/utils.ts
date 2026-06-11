import type {
  DrawingCell,
  Notebook,
  NotebookCell,
  NotebookUpdate,
  TextCell,
} from "./types";

export function applyNotebookUpdate(
  notebook: Notebook,
  fields: NotebookUpdate,
): Notebook {
  return {
    ...notebook,
    ...fields,
    updatedAt: Date.now(),
  };
}

export function applyTextCellUpdate(cell: TextCell, content: string): TextCell {
  return {
    ...cell,
    content,
    updatedAt: Date.now(),
  };
}

export function applyDrawingCellUpdate(
  cell: DrawingCell,
  drawing: string | null,
): DrawingCell {
  return {
    ...cell,
    drawing,
    updatedAt: Date.now(),
  };
}

export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
export function countWords(text: string): number {
  const clean: string = text.trim();
  if (clean === "") {
    return 0;
  }
  return clean.split(/\s+/).length;
}
export function createDefaultNotebook(): Notebook {
  const now = Date.now();

  return {
    id: createId(),
    title: "New note",
    cells: [createTextCell(), createDrawingCell()],
    createdAt: now,
    updatedAt: now,
  };
}
export function createTextCell(): TextCell {
  const now = Date.now();

  return {
    id: createId(),
    type: "text",
    content: "",
    heightPx: 160,
    createdAt: now,
    updatedAt: now,
  };
}
export function createDrawingCell(): DrawingCell {
  const now = Date.now();

  return {
    id: createId(),
    type: "drawing",
    drawing: null,
    heightPx: 360,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyCellHeightUpdate(
  cell: NotebookCell,
  heightPx: number,
): NotebookCell {
  return {
    ...cell,
    heightPx,
    updatedAt: Date.now(),
  };
}
export function insertCellAfter(
  cells: NotebookCell[],
  targetCellId: string,
  newCell: NotebookCell,
): NotebookCell[] {
  const targetIndex = cells.findIndex((cell) => cell.id === targetCellId);

  if (targetIndex === -1) {
    return [...cells, newCell];
  }

  return [
    ...cells.slice(0, targetIndex + 1),
    newCell,
    ...cells.slice(targetIndex + 1),
  ];
}
export function deleteCell(
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] {
  return cells.filter((cell) => cell.id !== cellId);
}
export function duplicateCell(
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] {
  const targetCell = cells.find((cell) => cell.id === cellId);

  if (!targetCell) {
    return cells;
  }
  const now = Date.now();

  const copiedCell: NotebookCell = {
    ...targetCell,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  };

  return insertCellAfter(cells, cellId, copiedCell);
}

export function moveItem<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);

  return nextItems;
}
export function moveCellUp(
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] {
  const index = cells.findIndex((cell) => cell.id === cellId);
  return moveItem(cells, index, index - 1);
}

export function moveCellDown(
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] {
  const index = cells.findIndex((cell) => cell.id === cellId);
  return moveItem(cells, index, index + 1);
}
