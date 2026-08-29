import { del } from "@vercel/blob";
import {
  deleteAttachmentRecord,
  getAttachment,
  getAttachmentReferences,
  renameAttachment,
  restoreAttachment,
  trashAttachment,
} from "@/lib/server/attachment-repository";
import { getCurrentUserId } from "@/lib/server/current-user";
import { isUuid } from "@/lib/utils";

interface AttachmentRouteContext {
  params: Promise<{ imageId: string }>;
}

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.normalize("NFKC").trim();
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

  if (
    normalized.length === 0 ||
    normalized.length > 120 ||
    hasControlCharacter
  ) {
    return null;
  }

  return normalized;
}

export async function PATCH(
  request: Request,
  { params }: AttachmentRouteContext,
) {
  const { imageId } = await params;

  if (!isUuid(imageId)) {
    return Response.json({ error: "Invalid image id" }, { status: 400 });
  }

  const body: unknown = await request.json();

  if (typeof body !== "object" || body === null || !("action" in body)) {
    return Response.json({ error: "Invalid image update" }, { status: 400 });
  }

  const userId = await getCurrentUserId();

  if (body.action === "rename") {
    const displayName =
      "displayName" in body ? normalizeDisplayName(body.displayName) : null;

    if (!displayName) {
      return Response.json(
        { error: "Names must contain 1 to 120 visible characters" },
        { status: 400 },
      );
    }

    const image = await renameAttachment(userId, imageId, displayName);
    return image
      ? Response.json({ image })
      : Response.json({ error: "Image not found" }, { status: 404 });
  }

  if (body.action === "restore") {
    const image = await restoreAttachment(userId, imageId);
    return image
      ? Response.json({ image })
      : Response.json({ error: "Image not found" }, { status: 404 });
  }

  return Response.json({ error: "Invalid image action" }, { status: 400 });
}

export async function DELETE(
  request: Request,
  { params }: AttachmentRouteContext,
) {
  const { imageId } = await params;

  if (!isUuid(imageId)) {
    return Response.json({ error: "Invalid image id" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const permanently =
    new URL(request.url).searchParams.get("permanent") === "true";

  if (!permanently) {
    const image = await trashAttachment(userId, imageId);
    return image
      ? Response.json({ image })
      : Response.json({ error: "Image not found" }, { status: 404 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "Image storage is not configured" },
      { status: 503 },
    );
  }

  const image = await getAttachment(userId, imageId);

  if (!image || image.trashedAt === null) {
    return Response.json({ error: "Trashed image not found" }, { status: 404 });
  }

  const references = await getAttachmentReferences(userId, image.pathname);

  if (references.length > 0) {
    return Response.json(
      {
        error: "This image is still in use",
        references,
      },
      { status: 409 },
    );
  }

  await del(image.pathname);
  await deleteAttachmentRecord(userId, imageId);
  return Response.json({ ok: true });
}
