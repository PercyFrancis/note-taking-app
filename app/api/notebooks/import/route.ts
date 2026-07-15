import { isImportNotebooksInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { importNotebooks } from "@/lib/server/notebook-repository";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!isImportNotebooksInput(body)) {
      return Response.json({ error: "Invalid import input" }, { status: 400 });
    }

    const userId = await getCurrentUserId();
    const notebooks = await importNotebooks(userId, body);

    return Response.json({ notebooks }, { status: 200 });
  } catch {
    return Response.json(
      { error: "Failed to import notebooks" },
      { status: 500 },
    );
  }
}
