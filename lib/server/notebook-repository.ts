import type {
  CellRow,
  ChangedCellRow,
  ChangedNotebookRow,
  CreateCellInput,
  CreateNotebookInput,
  ImportNotebooksInput,
  Notebook,
  NotebookCell,
  NotebookRow,
  PositionRow,
  RestoreCellInput,
  UpdateCellInput,
  UpdateCellResult,
} from "../types";
import {
  createDefaultNotebook,
  createDrawingCell,
  createExcalidrawCell,
  createId,
  createTextCell,
} from "../utils";
import { sql } from "./db";

const NOTEBOOK_CELL_QUERY_BATCH_SIZE = 10;

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

  if (row.type === "drawing") {
    return {
      ...baseCell,
      type: "drawing",
      drawing: row.drawing,
    };
  }

  return {
    ...baseCell,
    type: "excalidraw",
    drawing: row.drawing,
  };
}

export async function getNotebooks(userId: string): Promise<Notebook[]> {
  const notebookRows = (await sql.query(
    `
      select id, title, folder_id, position, trashed_at, created_at, updated_at
      from notebooks
      where user_id = $1
        and trashed_at is null
      order by position asc
    `,
    [userId],
  )) as NotebookRow[];

  if (notebookRows.length === 0) {
    return [];
  }

  const notebookIds = notebookRows.map((notebook) => notebook.id);

  // Legacy canvas cells can contain large data URLs. Fetching every cell in a
  // mature workspace in one Neon HTTP response can exceed the transport limit.
  const notebookIdBatches = Array.from(
    {
      length: Math.ceil(notebookIds.length / NOTEBOOK_CELL_QUERY_BATCH_SIZE),
    },
    (_, index) =>
      notebookIds.slice(
        index * NOTEBOOK_CELL_QUERY_BATCH_SIZE,
        (index + 1) * NOTEBOOK_CELL_QUERY_BATCH_SIZE,
      ),
  );
  const cellRowBatches = await Promise.all(
    notebookIdBatches.map(
      async (notebookIdBatch) =>
        (await sql.query(
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
          [notebookIdBatch],
        )) as CellRow[],
    ),
  );
  const cellRows = cellRowBatches.flat();

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
    folderId: row.folder_id,
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
    folderId: input.folderId ?? null,
  };

  await sql.transaction((txn) => [
    txn`
      update notebooks
      set position = position + 1
      where user_id = ${userId}
        and folder_id is not distinct from ${notebook.folderId}
        and trashed_at is null
    `,
    txn`
      insert into notebooks (
        id, user_id, folder_id, title, position, created_at, updated_at
      )
      select
        ${notebook.id},
        ${userId},
        ${notebook.folderId},
        ${notebook.title},
        ${0},
        to_timestamp(${notebook.createdAt} / 1000.0),
        to_timestamp(${notebook.updatedAt} / 1000.0)
      where ${notebook.folderId}::uuid is null
        or exists (
          select 1 from folders
          where id = ${notebook.folderId}
            and user_id = ${userId}
            and trashed_at is null
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
          ${cell.type !== "text" ? cell.drawing : null},
          ${cell.heightPx},
          to_timestamp(${cell.createdAt} / 1000.0),
          to_timestamp(${cell.updatedAt} / 1000.0)
        )
      `,
    ),
  ]);

  return notebook;
}

export async function updateNotebookTitle(
  userId: string,
  notebookId: string,
  title: string,
): Promise<boolean> {
  const rows = (await sql.query(
    `
      update notebooks
      set title = $1,
          updated_at = now()
      where id = $2
        and user_id = $3
      returning id
    `,
    [title, notebookId, userId],
  )) as ChangedNotebookRow[];

  return rows.length > 0;
}

export async function deleteNotebook(
  userId: string,
  notebookId: string,
): Promise<boolean> {
  const rows = (await sql.query(
    ` 
      update notebooks
      set trashed_at = now(), updated_at = now()
      where id = $1 and user_id = $2 and trashed_at is null
      returning id
    `,
    [notebookId, userId],
  )) as ChangedNotebookRow[];

  return rows.length > 0;
}

export async function moveNotebookToFolder(
  userId: string,
  notebookId: string,
  folderId: string | null,
): Promise<boolean> {
  const rows = (await sql.query(
    `
      update notebooks
      set
        folder_id = $3,
        position = coalesce((
          select max(position) + 1
          from notebooks as siblings
          where siblings.user_id = $2
            and siblings.folder_id is not distinct from $3::uuid
            and siblings.trashed_at is null
        ), 0),
        updated_at = now()
      where notebooks.id = $1
        and notebooks.user_id = $2
        and notebooks.trashed_at is null
        and (
          $3::uuid is null
          or exists (
            select 1 from folders
            where id = $3 and user_id = $2 and trashed_at is null
          )
        )
      returning notebooks.id
    `,
    [notebookId, userId, folderId],
  )) as ChangedNotebookRow[];

  return rows.length > 0;
}

export async function restoreNotebook(
  userId: string,
  notebookId: string,
): Promise<boolean> {
  const rows = (await sql.query(
    `
      update notebooks
      set trashed_at = null, updated_at = now()
      where notebooks.id = $1
        and notebooks.user_id = $2
        and notebooks.trashed_at is not null
        and (
          notebooks.folder_id is null
          or exists (
            select 1 from folders
            where folders.id = notebooks.folder_id
              and folders.user_id = $2
              and folders.trashed_at is null
          )
        )
      returning notebooks.id
    `,
    [notebookId, userId],
  )) as ChangedNotebookRow[];

  return rows.length > 0;
}

export async function permanentlyDeleteNotebook(
  userId: string,
  notebookId: string,
): Promise<boolean> {
  const rows = (await sql.query(
    `
      delete from notebooks
      where id = $1 and user_id = $2 and trashed_at is not null
      returning id
    `,
    [notebookId, userId],
  )) as ChangedNotebookRow[];

  return rows.length > 0;
}

export async function createCell(
  userId: string,
  notebookId: string,
  input: CreateCellInput,
): Promise<NotebookCell | null> {
  const cell =
    input.type === "text"
      ? createTextCell()
      : input.type === "drawing"
        ? createDrawingCell()
        : createExcalidrawCell();

  const afterCellId = input.afterCellId ?? null;
  const content = cell.type === "text" ? cell.content : null;
  const drawing = cell.type !== "text" ? cell.drawing : null;

  const rows = (await sql.query(
    `
      with target_notebook as (
        select id
        from notebooks
        where id = $1
          and user_id = $2
      ),
      target_position as (
        select
          case
            when $3::uuid is null then (
              select coalesce(max(position), -1)
              from cells
              where notebook_id = (select id from target_notebook)
            )
            else (
              select position
              from cells
              where id = $3::uuid
                and notebook_id = (select id from target_notebook)
            )
          end as position
      ),
      shifted_cells as (
        update cells
        set position = position + 1,
            updated_at = now()
        where notebook_id = (select id from target_notebook)
          and position > (select position from target_position)
        returning id
      ),
      inserted_cell as (
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
        select
          $4,
          target_notebook.id,
          $5,
          target_position.position + 1,
          $6,
          $7,
          $8,
          to_timestamp($9 / 1000.0),
          to_timestamp($10 / 1000.0)
        from target_notebook
        cross join target_position
        where target_position.position is not null
        returning
          id,
          notebook_id,
          type,
          position,
          content,
          drawing,
          height_px,
          created_at,
          updated_at
      ),
      updated_notebook as (
        update notebooks
        set updated_at = now()
        where id = (select id from target_notebook)
          and exists (select 1 from inserted_cell)
        returning id
      )
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
      from inserted_cell
    `,
    [
      notebookId,
      userId,
      afterCellId,
      cell.id,
      cell.type,
      content,
      drawing,
      cell.heightPx,
      cell.createdAt,
      cell.updatedAt,
    ],
  )) as CellRow[];

  if (rows.length === 0) {
    return null;
  }

  return mapCellRowToNotebookCell(rows[0]);
}

export async function restoreCell(
  userId: string,
  notebookId: string,
  input: RestoreCellInput,
): Promise<NotebookCell | null> {
  const { cell, position } = input;
  const content = cell.type === "text" ? cell.content : null;
  const drawing = cell.type !== "text" ? cell.drawing : null;

  const rows = (await sql.query(
    `
      with target_notebook as (
        select id
        from notebooks
        where id = $1
          and user_id = $2
      ),
      target_position as (
        select $3::integer as position
        from target_notebook
        where $3::integer >= 0
          and $3::integer <= (
            select count(*)
            from cells
            where notebook_id = target_notebook.id
          )
          and not exists (
            select 1 from cells where id = $4::uuid
          )
      ),
      shifted_cells as (
        update cells
        set position = position + 1,
            updated_at = now()
        where notebook_id = (select id from target_notebook)
          and position >= (select position from target_position)
        returning id
      ),
      inserted_cell as (
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
        select
          $4,
          target_notebook.id,
          $5,
          target_position.position,
          $6,
          $7,
          $8,
          to_timestamp($9 / 1000.0),
          to_timestamp($10 / 1000.0)
        from target_notebook
        cross join target_position
        returning
          id,
          notebook_id,
          type,
          position,
          content,
          drawing,
          height_px,
          created_at,
          updated_at
      ),
      updated_notebook as (
        update notebooks
        set updated_at = now()
        where id = (select id from target_notebook)
          and exists (select 1 from inserted_cell)
        returning id
      )
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
      from inserted_cell
    `,
    [
      notebookId,
      userId,
      position,
      cell.id,
      cell.type,
      content,
      drawing,
      cell.heightPx,
      cell.createdAt,
      cell.updatedAt,
    ],
  )) as CellRow[];

  return rows.length === 0 ? null : mapCellRowToNotebookCell(rows[0]);
}

export async function deleteCell(
  userId: string,
  cellId: string,
): Promise<boolean> {
  const rows = (await sql.query(
    `
      with deleted_cell as (
        delete from cells
        using notebooks
        where cells.id = $1
          and cells.notebook_id = notebooks.id
          and notebooks.user_id = $2
        returning cells.id, cells.notebook_id, cells.position
      ),
      shifted_cells as (
        update cells
        set position = position - 1,
            updated_at = now()
        where notebook_id = (select notebook_id from deleted_cell)
          and position > (select position from deleted_cell)
        returning id
      ),
      updated_notebook as (
        update notebooks
        set updated_at = now()
        where id = (select notebook_id from deleted_cell)
        returning id
      )
      select id
      from deleted_cell
    `,
    [cellId, userId],
  )) as ChangedCellRow[];

  return rows.length > 0;
}

export async function updateCell(
  userId: string,
  cellId: string,
  input: UpdateCellInput,
): Promise<UpdateCellResult> {
  const hasContent = "content" in input;
  const hasDrawing = "drawing" in input;
  const hasHeightPx = "heightPx" in input;

  const targetRows = (await sql.query(
    `
      select cells.type
      from cells
      join notebooks on cells.notebook_id = notebooks.id
      where cells.id = $1
        and notebooks.user_id = $2
    `,
    [cellId, userId],
  )) as Pick<CellRow, "type">[];

  if (targetRows.length === 0) {
    return { status: "not_found" };
  }

  const cellType = targetRows[0].type;

  if (hasContent && cellType !== "text") {
    return { status: "invalid_cell_type" };
  }

  if (hasDrawing && cellType !== "drawing" && cellType !== "excalidraw") {
    return { status: "invalid_cell_type" };
  }

  const rows = (await sql.query(
    `
      with updated_cell as (
        update cells
        set
          content = case
            when $3::boolean then $4::text
            else content
          end,
          drawing = case
            when $5::boolean then $6::text
            else drawing
          end,
          height_px = case
            when $7::boolean then $8::integer
            else height_px
          end,
          updated_at = now()
        from notebooks
        where cells.id = $1
          and cells.notebook_id = notebooks.id
          and notebooks.user_id = $2
        returning
          cells.id,
          cells.notebook_id,
          cells.type,
          cells.position,
          cells.content,
          cells.drawing,
          cells.height_px,
          cells.created_at,
          cells.updated_at
      ),
      updated_notebook as (
        update notebooks
        set updated_at = now()
        where id = (select notebook_id from updated_cell)
        returning id
      )
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
      from updated_cell
    `,
    [
      cellId,
      userId,
      hasContent,
      input.content ?? null,
      hasDrawing,
      input.drawing ?? null,
      hasHeightPx,
      input.heightPx ?? null,
    ],
  )) as CellRow[];

  if (rows.length === 0) {
    return { status: "not_found" };
  }

  return {
    status: "updated",
    cell: mapCellRowToNotebookCell(rows[0]),
  };
}

export async function userOwnsImageAttachmentCell(
  userId: string,
  cellId: string,
): Promise<boolean> {
  const rows = (await sql.query(
    `
      select cells.id
      from cells
      join notebooks on cells.notebook_id = notebooks.id
      where cells.id = $1
        and cells.type in ('text', 'excalidraw')
        and notebooks.user_id = $2
    `,
    [cellId, userId],
  )) as ChangedCellRow[];

  return rows.length > 0;
}

export async function reorderCells(
  userId: string,
  notebookId: string,
  cellIds: string[],
): Promise<boolean> {
  const rows = (await sql.query(
    `
      with target_notebook as (
        select id
        from notebooks
        where id = $1
          and user_id = $2
      ),
      requested_order as (
        select *
        from unnest($3::uuid[]) with ordinality as ordered_cells(id, position)
      ),
      notebook_cells as (
        select cells.id
        from cells
        where cells.notebook_id = (select id from target_notebook)
      ),
      valid_order as (
        select count(*) as matching_count
        from requested_order
        join notebook_cells on notebook_cells.id = requested_order.id
      ),
      updated_cells as (
        update cells
        set position = requested_order.position - 1,
            updated_at = now()
        from requested_order
        where cells.id = requested_order.id
          and cells.notebook_id = (select id from target_notebook)
          and (select matching_count from valid_order) = (
            select count(*) from notebook_cells
          )
          and (select count(*) from requested_order) = (
            select count(*) from notebook_cells
          )
        returning cells.id
      ),
      updated_notebook as (
        update notebooks
        set updated_at = now()
        where id = (select id from target_notebook)
          and exists (select 1 from updated_cells)
        returning id
      )
      select id
      from updated_notebook
    `,
    [notebookId, userId, cellIds],
  )) as ChangedNotebookRow[];

  return rows.length > 0;
}

export async function duplicateCell(
  userId: string,
  cellId: string,
): Promise<NotebookCell | null> {
  const now = Date.now();
  const copiedCellId = createId();

  const rows = (await sql.query(
    `
      with source_cell as (
        select
          cells.id,
          cells.notebook_id,
          cells.type,
          cells.position,
          cells.content,
          cells.drawing,
          cells.height_px
        from cells
        join notebooks on cells.notebook_id = notebooks.id
        where cells.id = $1
          and notebooks.user_id = $2
      ),
      shifted_cells as (
        update cells
        set position = position + 1,
            updated_at = now()
        where notebook_id = (select notebook_id from source_cell)
          and position > (select position from source_cell)
        returning id
      ),
      inserted_cell as (
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
        select
          $3,
          notebook_id,
          type,
          position + 1,
          content,
          drawing,
          height_px,
          to_timestamp($4 / 1000.0),
          to_timestamp($4 / 1000.0)
        from source_cell
        returning
          id,
          notebook_id,
          type,
          position,
          content,
          drawing,
          height_px,
          created_at,
          updated_at
      ),
      updated_notebook as (
        update notebooks
        set updated_at = now()
        where id = (select notebook_id from inserted_cell)
        returning id
      )
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
      from inserted_cell
    `,
    [cellId, userId, copiedCellId, now],
  )) as CellRow[];

  if (rows.length === 0) {
    return null;
  }

  return mapCellRowToNotebookCell(rows[0]);
}

export async function reorderNotebooks(
  userId: string,
  notebookIds: string[],
): Promise<boolean> {
  const rows = (await sql.query(
    `
      with target_user as (
        select id
        from users
        where id = $1
      ),
      requested_order as (
        select *
        from unnest($2::uuid[]) with ordinality as ordered_notebooks(id, position)
      ),
      user_notebooks as (
        select notebooks.id
        from notebooks
        where notebooks.user_id = (select id from target_user)
          and notebooks.trashed_at is null
          and notebooks.folder_id is not distinct from (
            select notebooks.folder_id
            from notebooks
            join requested_order on requested_order.id = notebooks.id
            where notebooks.user_id = (select id from target_user)
              and notebooks.trashed_at is null
            order by requested_order.position
            limit 1
          )
      ),
      valid_order as (
        select count(*) as matching_count
        from requested_order
        join user_notebooks on user_notebooks.id = requested_order.id
      ),
      updated_notebooks as (
        update notebooks
        set position = requested_order.position - 1,
            updated_at = now()
        from requested_order
        where notebooks.id = requested_order.id
          and notebooks.user_id = (select id from target_user)
          and (select matching_count from valid_order) = (
            select count(*) from user_notebooks
          )
          and (select count(*) from requested_order) = (
            select count(*) from user_notebooks
          )
        returning notebooks.id
      )
      select id
      from updated_notebooks
    `,
    [userId, notebookIds],
  )) as ChangedNotebookRow[];

  return rows.length > 0;
}
export async function importNotebooks(
  userId: string,
  input: ImportNotebooksInput,
): Promise<Notebook[]> {
  const preparedNotebooks = input.notebooks.map((notebook) => ({
    id: createId(),
    title: notebook.title,
    cells: notebook.cells.map((cell) => {
      if (cell.type === "text") {
        return {
          id: createId(),
          type: "text",
          content: cell.content,
          heightPx: cell.heightPx,
        };
      }

      return {
        id: createId(),
        type: cell.type,
        drawing: cell.drawing,
        heightPx: cell.heightPx,
      };
    }),
  }));

  const positionRows = (await sql.query(
    `
    select coalesce(max(position), -1) as position
    from notebooks
    where user_id = $1
    `,
    [userId],
  )) as PositionRow[];
  const startPosition =
    input.mode === "replace" ? 0 : (positionRows[0]?.position ?? -1) + 1;

  await sql.transaction((txn) => [
    ...(input.mode === "replace"
      ? [
          txn`
            delete from notebooks
            where user_id = ${userId}
          `,
        ]
      : []),

    ...preparedNotebooks.map(
      (notebook, notebookIndex) =>
        txn`
        insert into notebooks (
          id,
          user_id,
          title,
          position,
          created_at,
          updated_at
        )
        values (
          ${notebook.id},
          ${userId},
          ${notebook.title},
          ${startPosition + notebookIndex},
          now(),
          now()
        )
      `,
    ),

    ...preparedNotebooks.flatMap((notebook) =>
      notebook.cells.map(
        (cell, cellIndex) =>
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
          ${cellIndex},
          ${cell.type === "text" ? cell.content : null},
          ${cell.type !== "text" ? cell.drawing : null},
          ${cell.heightPx},
          now(),
          now()
        )
        `,
      ),
    ),
  ]);

  return getNotebooks(userId);
}
