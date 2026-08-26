import { getCurrentUserId } from "@/lib/server/current-user";
import { restoreNotebook } from "@/lib/server/notebook-repository";
import type { NotebookRouteContext } from "@/lib/types";
import { isUuid } from "@/lib/utils";

export async function POST(
  _request: Request,
  { params }: NotebookRouteContext,
) {
  const { notebookId } = await params;

  if (!isUuid(notebookId)) {
    return Response.json({ error: "Invalid notebook id" }, { status: 400 });
  }

  const didRestore = await restoreNotebook(
    await getCurrentUserId(),
    notebookId,
  );
  return didRestore
    ? Response.json({ ok: true })
    : Response.json({ error: "Notebook not found" }, { status: 404 });
}
