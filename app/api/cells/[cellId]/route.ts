import { isUpdateCellInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { deleteCell, updateCell } from "@/lib/server/notebook-repository";
import type { CellRouteContext } from "@/lib/types";
import { isUuid } from "@/lib/utils";

export async function DELETE(_request: Request, { params }: CellRouteContext) {
  const { cellId } = await params;
  const userId = await getCurrentUserId();

  if (!isUuid(cellId)) {
    return Response.json({ error: "Invalid cell id" }, { status: 400 });
  }

  const didDelete = await deleteCell(userId, cellId);

  if (!didDelete) {
    return Response.json({ error: "Cell not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function PATCH(request: Request, { params }: CellRouteContext) {
  const { cellId } = await params;
  const userId = await getCurrentUserId();

  if (!isUuid(cellId)) {
    return Response.json({ error: "Invalid cell id" }, { status: 400 });
  }

  const body: unknown = await request.json();

  if (!isUpdateCellInput(body)) {
    return Response.json({ error: "Invalid cell input" }, { status: 400 });
  }

  const result = await updateCell(userId, cellId, body);

  if (result.status === "not_found") {
    return Response.json({ error: "Cell not found" }, { status: 404 });
  }

  if (result.status === "invalid_cell_type") {
    return Response.json(
      { error: "Invalid cell update for this cell type" },
      { status: 400 },
    );
  }

  return Response.json({ cell: result.cell });
}
