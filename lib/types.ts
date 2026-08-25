export type CellType = "text" | "drawing" | "excalidraw";

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

export interface ExcalidrawCell extends BaseCell {
  type: "excalidraw";
  drawing: string | null;
}

export type NotebookCell = TextCell | DrawingCell | ExcalidrawCell;

export interface TextCellMatch {
  cellId: string;
  start: number;
  end: number;
}

export interface TextSelectionRequest extends TextCellMatch {
  requestId: number;
}

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
  position: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CellRow {
  id: string;
  notebook_id: string;
  type: CellType;
  position: number;
  content: string | null;
  drawing: string | null;
  height_px: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface UpdateNotebookInput {
  title: string;
}

export interface ChangedNotebookRow {
  id: string;
}

export interface NotebookRouteContext {
  params: Promise<{
    notebookId: string;
  }>;
}

export interface CreateCellInput {
  type: CellType;
  afterCellId?: string | null;
}

export interface RestoreCellInput {
  cell: NotebookCell;
  position: number;
}

export interface CellResponse {
  cell: NotebookCell;
}

export interface UploadedImage {
  id: string;
  pathname: string;
  url: string;
  filename: string;
  originalFilename: string;
  size: number;
  uploadedAt: number;
  cellId: string | null;
  trashedAt: number | null;
}

export interface ImageReference {
  notebookTitle: string;
  cellId: string;
  cellType: "text" | "excalidraw";
  cellNumber: number;
}

export interface UploadedImagesResponse {
  images: UploadedImage[];
  truncated: boolean;
}

export interface AttachmentMutationResponse {
  image: UploadedImage;
}

export interface AttachmentDeleteConflictResponse {
  error: string;
  references: ImageReference[];
}

export interface MarkdownInsertionRequest {
  cellId: string;
  markdown: string;
  requestId: number;
}

export interface ExcalidrawImageInsertionRequest {
  cellId: string;
  image: UploadedImage;
  requestId: number;
}

export interface NotebookCellsRouteContext {
  params: Promise<{
    notebookId: string;
  }>;
}

export interface CellRouteContext {
  params: Promise<{
    cellId: string;
  }>;
}

export interface ChangedCellRow {
  id: string;
}

export interface UpdateCellInput {
  content?: string;
  drawing?: string | null;
  heightPx?: number;
}

export type UpdateCellResult =
  | { status: "updated"; cell: NotebookCell }
  | { status: "not_found" }
  | { status: "invalid_cell_type" };

export interface ReorderCellsInput {
  cellIds: string[];
}

export interface ReorderNotebooksInput {
  notebookIds: string[];
}

export type UserIdRow = {
  id: string;
};

export interface ClerkUserSyncInput {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}

export interface ImportNotebooksInput {
  mode: "append" | "replace";
  notebooks: ImportedNotebook[];
}

export interface ImportedNotebook {
  title: string;
  cells: ImportedCell[];
}

export interface ImportedBaseCell {
  heightPx: number;
}

export interface ImportedTextCell extends ImportedBaseCell {
  type: "text";
  content: string;
}
export interface ImportedDrawingCell extends ImportedBaseCell {
  type: "drawing";
  drawing: string | null;
}

export interface ImportedExcalidrawCell extends ImportedBaseCell {
  type: "excalidraw";
  drawing: string | null;
}

export type ImportedCell =
  | ImportedTextCell
  | ImportedDrawingCell
  | ImportedExcalidrawCell;

export type PositionRow = {
  position: number;
};
