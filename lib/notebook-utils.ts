import { TextCell, DrawingCell, Notebook } from './notebook-types.js';

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
    if(clean === "") {
        return 0;
    }
    return clean.split(/\s+/).length;
}
export function createDefaultNotebook(): Notebook {
    const now = Date.now();

    return {
        id: createId(),
        title: "New note",
        cells: [createTextCell()],
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
      createdAt: now,
      updatedAt: now,
    };
}