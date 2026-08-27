import type { PdfAnnotationRecord, PdfDocumentRecord } from "../pdf";

async function requireOk(response: Response, message: string) {
  if (!response.ok) throw new Error(message);
  return response;
}

export async function listRemotePdfDocuments() {
  const response = await requireOk(
    await fetch("/api/pdf-documents"),
    "Could not load PDF documents",
  );
  return ((await response.json()) as { documents: PdfDocumentRecord[] })
    .documents;
}

export async function loadRemotePdfAnnotations(documentId: string) {
  const response = await requireOk(
    await fetch(`/api/pdf-documents/${documentId}/annotations`),
    "Could not load PDF annotations",
  );
  return ((await response.json()) as { annotations: PdfAnnotationRecord[] })
    .annotations;
}

export async function saveRemotePdfAnnotation(
  documentId: string,
  pageNumber: number,
  scene: string,
) {
  await requireOk(
    await fetch(`/api/pdf-documents/${documentId}/annotations/${pageNumber}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene }),
    }),
    "Could not save PDF annotation",
  );
}

export async function renameRemotePdfDocument(id: string, title: string) {
  await requireOk(
    await fetch(`/api/pdf-documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
    "Could not rename PDF document",
  );
}

export async function deleteRemotePdfDocument(id: string) {
  await requireOk(
    await fetch(`/api/pdf-documents/${id}`, { method: "DELETE" }),
    "Could not delete PDF document",
  );
}

export function getRemotePdfUrl(document: PdfDocumentRecord) {
  if (!document.pathname) throw new Error("PDF file is missing");
  return `/api/pdf-documents/files/${document.pathname
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
