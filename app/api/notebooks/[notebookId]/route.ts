import { isUpdateNotebookInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import {
  deleteNotebook,
  updateNotebookTitle,
} from "@/lib/server/notebook-repository";
import type { NotebookRouteContext } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: NotebookRouteContext,
) {
  const { notebookId } = await params;
  const userId = await getCurrentUserId();

  const body: unknown = await request.json();

  if (!isUpdateNotebookInput(body)) {
    return Response.json({ error: "Invalid notebook input" }, { status: 400 });
  }

  const didUpdate = await updateNotebookTitle(userId, notebookId, body.title);

  if (!didUpdate) {
    return Response.json({ error: "Notebook not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: NotebookRouteContext,
) {
  const { notebookId } = await params;
  const userId = await getCurrentUserId();

  const didDelete = await deleteNotebook(userId, notebookId);

  if (!didDelete) {
    return Response.json({ error: "Notebook not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
