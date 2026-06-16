import { isCreateCellInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { createCell } from "@/lib/server/notebook-repository";
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

  if (!isCreateCellInput(body)) {
    return Response.json({ error: "Invalid cell input" }, { status: 400 });
  }

  const cell = await createCell(userId, notebookId, body);

  if (!cell) {
    return Response.json({ error: "Notebook not found" }, { status: 404 });
  }

  return Response.json({ cell }, { status: 201 });
}
