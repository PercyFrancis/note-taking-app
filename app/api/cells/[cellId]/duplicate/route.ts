import { getCurrentUserId } from "@/lib/server/current-user";
import { duplicateCell } from "@/lib/server/notebook-repository";
import type { CellRouteContext } from "@/lib/types";
import { isUuid } from "@/lib/utils";

export async function POST(_request: Request, { params }: CellRouteContext) {
  const { cellId } = await params;
  const userId = await getCurrentUserId();

  if (!isUuid(cellId)) {
    return Response.json({ error: "Invalid cell id" }, { status: 400 });
  }

  const cell = await duplicateCell(userId, cellId);

  if (!cell) {
    return Response.json({ error: "Cell not found" }, { status: 404 });
  }

  return Response.json({ cell }, { status: 201 });
}
