import { isScopedWorkspaceImportInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { importScopedWorkspace } from "@/lib/server/scoped-workspace-repository";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isScopedWorkspaceImportInput(body)) {
      return Response.json({ error: "Invalid scoped import" }, { status: 400 });
    }

    const userId = await getCurrentUserId();
    const rootFolderId = await importScopedWorkspace(userId, body);
    return Response.json({ rootFolderId });
  } catch {
    return Response.json({ error: "Failed to import item" }, { status: 500 });
  }
}
