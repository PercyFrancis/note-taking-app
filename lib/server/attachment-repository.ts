import { createPrivateImageUrl } from "../attachments";
import type { ImageReference, UploadedImage } from "../types";
import { sql } from "./db";

interface AttachmentRow {
  id: string;
  pathname: string;
  display_name: string;
  original_filename: string;
  size_bytes: number | string;
  uploaded_at: Date | string;
  source_cell_id: string | null;
  trashed_at: Date | string | null;
}

interface AttachmentReferenceRow {
  notebook_title: string;
  cell_id: string;
  cell_type: "text" | "excalidraw";
  cell_number: number;
}

export interface AttachmentIndexEntry {
  pathname: string;
  filename: string;
  size: number;
  uploadedAt: number;
  cellId: string;
}

function mapAttachmentRow(row: AttachmentRow): UploadedImage {
  return {
    id: row.id,
    pathname: row.pathname,
    url: createPrivateImageUrl(row.pathname),
    filename: row.display_name,
    originalFilename: row.original_filename,
    size: Number(row.size_bytes),
    uploadedAt: new Date(row.uploaded_at).getTime(),
    cellId: row.source_cell_id,
    trashedAt: row.trashed_at ? new Date(row.trashed_at).getTime() : null,
  };
}

export async function synchronizeAttachmentIndex(
  userId: string,
  entries: AttachmentIndexEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  await sql.query(
    `
      with incoming as (
        select *
        from jsonb_to_recordset($2::jsonb) as entry(
          pathname text,
          filename text,
          size_bytes bigint,
          uploaded_at timestamptz,
          source_cell_id uuid
        )
      ),
      normalized as (
        select
          incoming.pathname,
          incoming.filename,
          incoming.size_bytes,
          incoming.uploaded_at,
          case when notebooks.id is not null then cells.id end as source_cell_id
        from incoming
        left join cells on cells.id = incoming.source_cell_id
        left join notebooks on notebooks.id = cells.notebook_id
          and notebooks.user_id = $1
      )
      insert into image_attachments (
        user_id,
        source_cell_id,
        pathname,
        display_name,
        original_filename,
        size_bytes,
        uploaded_at
      )
      select
        $1,
        source_cell_id,
        pathname,
        filename,
        filename,
        size_bytes,
        uploaded_at
      from normalized
      on conflict (pathname) do update
      set
        source_cell_id = coalesce(
          image_attachments.source_cell_id,
          excluded.source_cell_id
        ),
        size_bytes = excluded.size_bytes,
        uploaded_at = excluded.uploaded_at,
        updated_at = now()
      where image_attachments.user_id = excluded.user_id
    `,
    [
      userId,
      JSON.stringify(
        entries.map((entry) => ({
          pathname: entry.pathname,
          filename: entry.filename,
          size_bytes: entry.size,
          uploaded_at: new Date(entry.uploadedAt).toISOString(),
          source_cell_id: entry.cellId,
        })),
      ),
    ],
  );
}

export async function getAttachments(
  userId: string,
  status: "active" | "trash",
): Promise<UploadedImage[]> {
  const rows = (await sql.query(
    `
      select
        id,
        pathname,
        display_name,
        original_filename,
        size_bytes,
        uploaded_at,
        source_cell_id,
        trashed_at
      from image_attachments
      where user_id = $1
        and (
          ($2 = 'active' and trashed_at is null)
          or ($2 = 'trash' and trashed_at is not null)
        )
      order by coalesce(trashed_at, uploaded_at) desc
    `,
    [userId, status],
  )) as AttachmentRow[];

  return rows.map(mapAttachmentRow);
}

export async function getRegisteredAttachmentPathnames(
  userId: string,
  pathnames: string[],
): Promise<Set<string>> {
  if (pathnames.length === 0) return new Set();
  const rows = (await sql.query(
    `
      select pathname
      from image_attachments
      where user_id = $1 and pathname = any($2::text[])
    `,
    [userId, pathnames],
  )) as Array<{ pathname: string }>;
  return new Set(rows.map((row) => row.pathname));
}

export async function getAttachment(
  userId: string,
  attachmentId: string,
): Promise<UploadedImage | null> {
  const rows = (await sql.query(
    `
      select
        id,
        pathname,
        display_name,
        original_filename,
        size_bytes,
        uploaded_at,
        source_cell_id,
        trashed_at
      from image_attachments
      where id = $1 and user_id = $2
    `,
    [attachmentId, userId],
  )) as AttachmentRow[];

  return rows[0] ? mapAttachmentRow(rows[0]) : null;
}

export async function renameAttachment(
  userId: string,
  attachmentId: string,
  displayName: string,
): Promise<UploadedImage | null> {
  const rows = (await sql.query(
    `
      update image_attachments
      set display_name = $3, updated_at = now()
      where id = $1 and user_id = $2
      returning
        id,
        pathname,
        display_name,
        original_filename,
        size_bytes,
        uploaded_at,
        source_cell_id,
        trashed_at
    `,
    [attachmentId, userId, displayName],
  )) as AttachmentRow[];

  return rows[0] ? mapAttachmentRow(rows[0]) : null;
}

export async function trashAttachment(
  userId: string,
  attachmentId: string,
): Promise<UploadedImage | null> {
  const rows = (await sql.query(
    `
      update image_attachments
      set trashed_at = coalesce(trashed_at, now()), updated_at = now()
      where id = $1 and user_id = $2
      returning
        id,
        pathname,
        display_name,
        original_filename,
        size_bytes,
        uploaded_at,
        source_cell_id,
        trashed_at
    `,
    [attachmentId, userId],
  )) as AttachmentRow[];

  return rows[0] ? mapAttachmentRow(rows[0]) : null;
}

export async function restoreAttachment(
  userId: string,
  attachmentId: string,
): Promise<UploadedImage | null> {
  const rows = (await sql.query(
    `
      update image_attachments
      set trashed_at = null, updated_at = now()
      where id = $1 and user_id = $2
      returning
        id,
        pathname,
        display_name,
        original_filename,
        size_bytes,
        uploaded_at,
        source_cell_id,
        trashed_at
    `,
    [attachmentId, userId],
  )) as AttachmentRow[];

  return rows[0] ? mapAttachmentRow(rows[0]) : null;
}

export async function getAttachmentReferences(
  userId: string,
  pathname: string,
): Promise<ImageReference[]> {
  const rows = (await sql.query(
    `
      select
        notebooks.title as notebook_title,
        cells.id as cell_id,
        cells.type as cell_type,
        cells.position + 1 as cell_number
      from cells
      join notebooks on notebooks.id = cells.notebook_id
      where notebooks.user_id = $1
        and cells.type in ('text', 'excalidraw')
        and (
          coalesce(cells.content, '') like '%' || $2 || '%'
          or coalesce(cells.drawing, '') like '%' || $2 || '%'
        )
      order by notebooks.position, cells.position
    `,
    [userId, pathname],
  )) as AttachmentReferenceRow[];

  return rows.map((row) => ({
    notebookTitle: row.notebook_title,
    cellId: row.cell_id,
    cellType: row.cell_type,
    cellNumber: Number(row.cell_number),
  }));
}

export async function deleteAttachmentRecord(
  userId: string,
  attachmentId: string,
): Promise<void> {
  await sql.query(
    "delete from image_attachments where id = $1 and user_id = $2",
    [attachmentId, userId],
  );
}

export async function getExpiredUnreferencedAttachments(
  userId: string,
): Promise<UploadedImage[]> {
  const rows = (await sql.query(
    `
      select
        image_attachments.id,
        image_attachments.pathname,
        image_attachments.display_name,
        image_attachments.original_filename,
        image_attachments.size_bytes,
        image_attachments.uploaded_at,
        image_attachments.source_cell_id,
        image_attachments.trashed_at
      from image_attachments
      where image_attachments.user_id = $1
        and image_attachments.trashed_at <= now() - interval '30 days'
        and not exists (
          select 1
          from cells
          join notebooks on notebooks.id = cells.notebook_id
          where notebooks.user_id = image_attachments.user_id
            and cells.type in ('text', 'excalidraw')
            and (
              coalesce(cells.content, '') like
                '%' || image_attachments.pathname || '%'
              or coalesce(cells.drawing, '') like
                '%' || image_attachments.pathname || '%'
            )
        )
    `,
    [userId],
  )) as AttachmentRow[];

  return rows.map(mapAttachmentRow);
}
