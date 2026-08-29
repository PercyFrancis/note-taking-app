import {
  isAttachmentMutationResponse,
  isRecord,
  isUploadedImagesResponse,
} from "@/lib/notebook-validation";
import type {
  ImageReference,
  UploadedImage,
  UploadedImagesResponse,
} from "@/lib/types";

export async function loadUploadedImages(
  status: "active" | "trash" = "active",
): Promise<UploadedImagesResponse> {
  const response = await fetch(`/api/attachments/images?status=${status}`);

  if (!response.ok) {
    throw new Error("Failed to load uploaded images");
  }

  const data: unknown = await response.json();

  if (!isUploadedImagesResponse(data)) {
    throw new Error("Invalid uploaded images response");
  }

  return data;
}

async function updateAttachment(
  imageId: string,
  body: { action: "rename"; displayName: string } | { action: "restore" },
): Promise<UploadedImage> {
  const response = await fetch(`/api/attachments/images/${imageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json();

  if (!response.ok || !isAttachmentMutationResponse(data)) {
    throw new Error("Could not update image");
  }

  return data.image;
}

export function renameUploadedImage(
  imageId: string,
  displayName: string,
): Promise<UploadedImage> {
  return updateAttachment(imageId, { action: "rename", displayName });
}

export function restoreUploadedImage(imageId: string): Promise<UploadedImage> {
  return updateAttachment(imageId, { action: "restore" });
}

export async function trashUploadedImage(
  imageId: string,
): Promise<UploadedImage> {
  const response = await fetch(`/api/attachments/images/${imageId}`, {
    method: "DELETE",
  });
  const data: unknown = await response.json();

  if (!response.ok || !isAttachmentMutationResponse(data)) {
    throw new Error("Could not move image to Trash");
  }

  return data.image;
}

export class AttachmentReferenceError extends Error {
  references: ImageReference[];

  constructor(references: ImageReference[]) {
    super("This image is still referenced by one or more documents");
    this.references = references;
  }
}

export async function permanentlyDeleteUploadedImage(
  imageId: string,
): Promise<void> {
  const response = await fetch(
    `/api/attachments/images/${imageId}?permanent=true`,
    { method: "DELETE" },
  );
  const data: unknown = await response.json();

  if (
    response.status === 409 &&
    isRecord(data) &&
    Array.isArray(data.references)
  ) {
    const references = data.references.filter(
      (reference): reference is ImageReference =>
        isRecord(reference) &&
        ((reference.kind === "notebook" &&
          typeof reference.notebookTitle === "string" &&
          typeof reference.cellId === "string" &&
          (reference.cellType === "text" ||
            reference.cellType === "excalidraw") &&
          typeof reference.cellNumber === "number") ||
          (reference.kind === "pdf" &&
            typeof reference.pdfTitle === "string" &&
            typeof reference.documentId === "string" &&
            typeof reference.pageNumber === "number")),
    );
    throw new AttachmentReferenceError(references);
  }

  if (!response.ok) {
    throw new Error("Could not permanently delete image");
  }
}
