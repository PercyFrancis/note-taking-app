export type CellType = "text" | "drawing";

export interface BaseCell {
  id: string;
  type: CellType;
  heightPx: number;
  createdAt: number;
  updatedAt: number;
}

export interface TextCell extends BaseCell {
  type: "text";
  content: string;
}

export interface DrawingCell extends BaseCell {
  type: "drawing";
  drawing: string | null;
}

export type NotebookCell = TextCell | DrawingCell;

export interface Notebook {
  id: string;
  title: string;
  cells: NotebookCell[];
  createdAt: number;
  updatedAt: number;
}

export type NotebookUpdate = Partial<Pick<Notebook, "title" | "cells">>;

export interface NotebookExport {
  version: 1;
  notebooks: Notebook[];
  exportedAt: number;
}
export interface StoredNotebooks {
  version: 1;
  notebooks: Notebook[];
}

export interface CreateNotebookInput {
  title: string;
}

export interface NotebooksResponse {
  notebooks: Notebook[];
}

export interface NotebookResponse {
  notebook: Notebook;
}

export interface NotebookRow {
  id: string;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CellRow {
  id: string;
  notebook_id: string;
  type: "text" | "drawing";
  position: number;
  content: string | null;
  drawing: string | null;
  height_px: number;
  created_at: Date | string;
  updated_at: Date | string;
}
