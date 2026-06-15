import type {
  CellRow,
  CreateNotebookInput,
  Notebook,
  NotebookCell,
  NotebookRow,
} from "../types";
import { createDefaultNotebook } from "../utils";
import { sql } from "./db";

function mapCellRowToNotebookCell(row: CellRow): NotebookCell {
  const baseCell = {
    id: row.id,
    heightPx: row.height_px,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };

  if (row.type === "text") {
    return {
      ...baseCell,
      type: "text",
      content: row.content ?? "",
    };
  }

  return {
    ...baseCell,
    type: "drawing",
    drawing: row.drawing,
  };
}

export async function getNotebooks(userId: string): Promise<Notebook[]> {
  const notebookRows = (await sql.query(
    `
      select id, title, created_at, updated_at
      from notebooks
      where user_id = $1
      order by updated_at desc
    `,
    [userId],
  )) as NotebookRow[];

  if (notebookRows.length === 0) {
    return [];
  }

  const notebookIds = notebookRows.map((notebook) => notebook.id);

  const cellRows = (await sql.query(
    `
      select
        id,
        notebook_id,
        type,
        position,
        content,
        drawing,
        height_px,
        created_at,
        updated_at
      from cells
      where notebook_id = any($1::uuid[])
      order by notebook_id asc, position asc
    `,
    [notebookIds],
  )) as CellRow[];

  const cellsByNotebookId = new Map<string, NotebookCell[]>();

  for (const row of cellRows) {
    const cell = mapCellRowToNotebookCell(row);
    const existingCells = cellsByNotebookId.get(row.notebook_id) ?? [];

    existingCells.push(cell);
    cellsByNotebookId.set(row.notebook_id, existingCells);
  }

  return notebookRows.map((row) => ({
    id: row.id,
    title: row.title,
    cells: cellsByNotebookId.get(row.id) ?? [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

export async function createNotebook(
  userId: string,
  input: CreateNotebookInput,
): Promise<Notebook> {
  const notebook = {
    ...createDefaultNotebook(),
    title: input.title,
  };

  await sql.transaction((txn) => [
    txn`
      insert into notebooks (id, user_id, title, created_at, updated_at)
      values (
        ${notebook.id},
        ${userId},
        ${notebook.title},
        to_timestamp(${notebook.createdAt} / 1000.0),
        to_timestamp(${notebook.updatedAt} / 1000.0)
      )
    `,
    ...notebook.cells.map(
      (cell, position) =>
        txn`
        insert into cells (
          id,
          notebook_id,
          type,
          position,
          content,
          drawing,
          height_px,
          created_at,
          updated_at
        )
        values (
          ${cell.id},
          ${notebook.id},
          ${cell.type},
          ${position},
          ${cell.type === "text" ? cell.content : null},
          ${cell.type === "drawing" ? cell.drawing : null},
          ${cell.heightPx},
          to_timestamp(${cell.createdAt} / 1000.0),
          to_timestamp(${cell.updatedAt} / 1000.0)
        )
      `,
    ),
  ]);

  return notebook;
}
