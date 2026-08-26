import { isMoveNotebookInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { moveNotebookToFolder } from "@/lib/server/notebook-repository";
import type { NotebookRouteContext } from "@/lib/types";
import { isUuid } from "@/lib/utils";

export async function PATCH(
  request: Request,
  { params }: NotebookRouteContext,
) {
  const { notebookId } = await params;
  const body: unknown = await request.json();

  if (!isUuid(notebookId) || !isMoveNotebookInput(body)) {
    return Response.json({ error: "Invalid notebook move" }, { status: 400 });
  }

  const didMove = await moveNotebookToFolder(
    await getCurrentUserId(),
    notebookId,
    body.folderId,
  );

  return didMove
    ? Response.json({ ok: true })
    : Response.json({ error: "Notebook or folder not found" }, { status: 404 });
}
