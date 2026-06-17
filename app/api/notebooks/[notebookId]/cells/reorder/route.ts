import { isReorderCellsInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { reorderCells } from "@/lib/server/notebook-repository";
import type { NotebookCellsRouteContext } from "@/lib/types";
import { isUuid } from "@/lib/utils";

export async function PATCH(
  request: Request,
  { params }: NotebookCellsRouteContext,
) {
  const { notebookId } = await params;
  const userId = await getCurrentUserId();

  if (!isUuid(notebookId)) {
    return Response.json({ error: "Invalid notebook id" }, { status: 400 });
  }

  const body: unknown = await request.json();

  if (!isReorderCellsInput(body)) {
    return Response.json({ error: "Invalid reorder input" }, { status: 400 });
  }

  const didReorder = await reorderCells(userId, notebookId, body.cellIds);

  if (!didReorder) {
    return Response.json(
      { error: "Notebook cells not found" },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
