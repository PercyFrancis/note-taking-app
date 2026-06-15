import { isCreateNotebookInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { createNotebook, getNotebooks } from "@/lib/server/notebook-repository";

export async function GET() {
  const userId = await getCurrentUserId();
  const notebooks = await getNotebooks(userId);

  return Response.json({
    notebooks,
  });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!isCreateNotebookInput(body)) {
      return Response.json(
        { error: "Invalid notebook input" },
        { status: 400 },
      );
    }

    const userId = await getCurrentUserId();
    const notebook = await createNotebook(userId, body);

    return Response.json({ notebook }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Failed to create notebook" },
      { status: 500 },
    );
  }
}
