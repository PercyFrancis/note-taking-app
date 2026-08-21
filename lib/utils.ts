import type {
  DrawingCell,
  Notebook,
  NotebookCell,
  NotebookUpdate,
  TextCell,
  TextCellMatch,
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

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

export function findTextCellMatches(
  cells: NotebookCell[],
  query: string,
): TextCellMatch[] {
  if (query === "") {
    return [];
  }

  const normalizedQuery = query.toLocaleLowerCase();
  const matches: TextCellMatch[] = [];

  for (const cell of cells) {
    if (cell.type !== "text") {
      continue;
    }

    const normalizedContent = cell.content.toLocaleLowerCase();
    let searchFrom = 0;

    while (searchFrom <= normalizedContent.length - normalizedQuery.length) {
      const start = normalizedContent.indexOf(normalizedQuery, searchFrom);

      if (start === -1) {
        break;
      }

      matches.push({
        cellId: cell.id,
        start,
        end: start + query.length,
      });
      searchFrom = start + query.length;
    }
  }

  return matches;
}

export function replaceTextMatch(
  content: string,
  match: Pick<TextCellMatch, "start" | "end">,
  replacement: string,
): string {
  return `${content.slice(0, match.start)}${replacement}${content.slice(match.end)}`;
}

export function replaceAllTextMatches(
  cells: NotebookCell[],
  query: string,
  replacement: string,
): Map<string, string> {
  const matches = findTextCellMatches(cells, query);
  const matchesByCell = new Map<string, TextCellMatch[]>();

  for (const match of matches) {
    const cellMatches = matchesByCell.get(match.cellId) ?? [];
    cellMatches.push(match);
    matchesByCell.set(match.cellId, cellMatches);
  }

  const updates = new Map<string, string>();

  for (const cell of cells) {
    if (cell.type !== "text") {
      continue;
    }

    const cellMatches = matchesByCell.get(cell.id);

    if (!cellMatches) {
      continue;
    }

    let nextContent = cell.content;

    for (const match of [...cellMatches].reverse()) {
      nextContent = replaceTextMatch(nextContent, match, replacement);
    }

    updates.set(cell.id, nextContent);
  }

  return updates;
}

export function notebookMatchesSearch(
  notebook: Notebook,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery === "") {
    return true;
  }

  const titleMatches = normalizeSearchText(notebook.title).includes(
    normalizedQuery,
  );

  const textCellMatches = notebook.cells.some((cell) => {
    if (cell.type !== "text") {
      return false;
    }

    return normalizeSearchText(cell.content).includes(normalizedQuery);
  });

  return titleMatches || textCellMatches;
}

export function findFirstMatchingTextCell(
  notebook: Notebook,
  query: string,
): TextCell | null {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery === "") {
    return null;
  }

  for (const cell of notebook.cells) {
    if (cell.type !== "text") {
      continue;
    }

    if (normalizeSearchText(cell.content).includes(normalizedQuery)) {
      return cell;
    }
  }

  return null;
}

export function getNotebookSearchPreview(
  notebook: Notebook,
  query: string,
): string | null {
  const matchingCell = findFirstMatchingTextCell(notebook, query);

  if (!matchingCell) {
    return null;
  }

  return createSearchPreview(matchingCell.content);
}

export function createSearchPreview(text: string, maxLength = 80): string {
  const singleLineText = text.trim().replace(/\s+/g, " ");

  if (singleLineText.length <= maxLength) {
    return singleLineText;
  }

  return `${singleLineText.slice(0, maxLength)}...`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
