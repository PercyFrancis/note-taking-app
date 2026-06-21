import { isReorderNotebooksInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { reorderNotebooks } from "@/lib/server/notebook-repository";

export async function PATCH(request: Request) {
  const userId = await getCurrentUserId();

  const body: unknown = await request.json();

  if (!isReorderNotebooksInput(body)) {
    return Response.json({ error: "Invalid reorder input" }, { status: 400 });
  }

  const didReorder = await reorderNotebooks(userId, body.notebookIds);

  if (!didReorder) {
    return Response.json({ error: "Notebooks not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
