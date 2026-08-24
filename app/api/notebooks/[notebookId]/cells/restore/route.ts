import { isRestoreCellInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { restoreCell } from "@/lib/server/notebook-repository";
import type { NotebookCellsRouteContext } from "@/lib/types";
import { isUuid } from "@/lib/utils";

export async function POST(
  request: Request,
  { params }: NotebookCellsRouteContext,
) {
  const { notebookId } = await params;

  if (!isUuid(notebookId)) {
    return Response.json({ error: "Invalid notebook id" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const body: unknown = await request.json();

  if (!isRestoreCellInput(body)) {
    return Response.json({ error: "Invalid restore input" }, { status: 400 });
  }

  const cell = await restoreCell(userId, notebookId, body);

  if (!cell) {
    return Response.json(
      { error: "Notebook or restore position not found" },
      { status: 404 },
    );
  }

  return Response.json({ cell }, { status: 201 });
}
