import { isCreateNotebookInput } from "@/lib/notebook-validation";
import { createNotebook, getNotebooks } from "@/lib/server/notebook-repository";

export async function GET() {
  const notebooks = await getNotebooks();

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

    const notebook = await createNotebook(body);

    return Response.json({ notebook }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Failed to create notebook" },
      { status: 500 },
    );
  }
}
