import type { PdfAnnotationRecord, PdfDocumentRecord } from "../pdf";
import { sql } from "./db";

interface PdfDocumentRow {
  id: string;
  title: string;
  original_filename: string;
  pathname: string;
  size_bytes: string | number;
  page_count: number;
  created_at: string;
  updated_at: string;
}

interface PdfAnnotationRow {
  page_number: number;
  scene_json: string;
  revision: number;
  updated_at: string;
}

function mapDocument(row: PdfDocumentRow): PdfDocumentRecord {
  return {
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    pathname: row.pathname,
    sizeBytes: Number(row.size_bytes),
    pageCount: row.page_count,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function listPdfDocuments(userId: string) {
  const rows = (await sql.query(
    `select id, title, original_filename, pathname, size_bytes, page_count,
      created_at, updated_at from pdf_documents
      where user_id = $1 and trashed_at is null order by updated_at desc`,
    [userId],
  )) as PdfDocumentRow[];
  return rows.map(mapDocument);
}

export async function createPdfDocument(
  userId: string,
  input: Omit<PdfDocumentRecord, "createdAt" | "updatedAt" | "pathname"> & {
    pathname: string;
  },
) {
  const rows = (await sql.query(
    `insert into pdf_documents
      (id, user_id, title, original_filename, pathname, size_bytes, page_count)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, title, original_filename, pathname, size_bytes, page_count,
       created_at, updated_at`,
    [
      input.id,
      userId,
      input.title,
      input.originalFilename,
      input.pathname,
      input.sizeBytes,
      input.pageCount,
    ],
  )) as PdfDocumentRow[];
  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function getPdfDocument(userId: string, id: string) {
  const rows = (await sql.query(
    `select id, title, original_filename, pathname, size_bytes, page_count,
      created_at, updated_at from pdf_documents
      where id = $1 and user_id = $2 and trashed_at is null`,
    [id, userId],
  )) as PdfDocumentRow[];
  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function renamePdfDocument(
  userId: string,
  id: string,
  title: string,
) {
  const rows = await sql.query(
    `update pdf_documents set title = $3, updated_at = now()
     where id = $1 and user_id = $2 and trashed_at is null returning id`,
    [id, userId, title],
  );
  return rows.length > 0;
}

export async function removePdfDocument(userId: string, id: string) {
  const rows = (await sql.query(
    `delete from pdf_documents where id = $1 and user_id = $2 returning pathname`,
    [id, userId],
  )) as { pathname: string }[];
  return rows[0]?.pathname ?? null;
}

export async function listPdfAnnotations(userId: string, documentId: string) {
  const rows = (await sql.query(
    `select a.page_number, a.scene_json, a.revision, a.updated_at
     from pdf_page_annotations a join pdf_documents d on d.id = a.document_id
     where a.document_id = $1 and d.user_id = $2 and d.trashed_at is null
     order by a.page_number`,
    [documentId, userId],
  )) as PdfAnnotationRow[];
  return rows.map(
    (row): PdfAnnotationRecord => ({
      pageNumber: row.page_number,
      scene: row.scene_json,
      revision: row.revision,
      updatedAt: new Date(row.updated_at).getTime(),
    }),
  );
}

export async function savePdfAnnotation(
  userId: string,
  documentId: string,
  pageNumber: number,
  scene: string,
) {
  const rows = (await sql.query(
    `insert into pdf_page_annotations (document_id, page_number, scene_json)
     select $1, $3, $4 from pdf_documents
     where id = $1 and user_id = $2 and trashed_at is null and $3 <= page_count
     on conflict (document_id, page_number) do update
       set scene_json = excluded.scene_json,
           revision = pdf_page_annotations.revision + 1,
           updated_at = now()
     returning page_number, scene_json, revision, updated_at`,
    [documentId, userId, pageNumber, scene],
  )) as PdfAnnotationRow[];
  const row = rows[0];
  return row
    ? {
        pageNumber: row.page_number,
        scene: row.scene_json,
        revision: row.revision,
        updatedAt: new Date(row.updated_at).getTime(),
      }
    : null;
}
