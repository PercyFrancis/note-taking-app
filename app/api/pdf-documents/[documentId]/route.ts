import { del } from "@vercel/blob";
import { getCurrentUserId } from "@/lib/server/current-user";
import {
  removePdfDocument,
  renamePdfDocument,
} from "@/lib/server/pdf-repository";

type Context = { params: Promise<{ documentId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { documentId } = await params;
  const body: unknown = await request.json();
  const title =
    body && typeof body === "object" && "title" in body
      ? (body as { title?: unknown }).title
      : null;
  if (typeof title !== "string" || !title.trim() || title.length > 200) {
    return Response.json({ error: "Invalid title" }, { status: 400 });
  }
  const userId = await getCurrentUserId();
  const updated = await renamePdfDocument(userId, documentId, title.trim());
  return updated
    ? Response.json({ ok: true })
    : Response.json({ error: "PDF not found" }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Context) {
  const userId = await getCurrentUserId();
  const { documentId } = await params;
  const pathname = await removePdfDocument(userId, documentId);
  if (!pathname)
    return Response.json({ error: "PDF not found" }, { status: 404 });
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(pathname);
  return Response.json({ ok: true });
}
