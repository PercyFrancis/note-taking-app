import { getCurrentUserId } from "@/lib/server/current-user";
import { restoreFolder } from "@/lib/server/folder-repository";
import { isUuid } from "@/lib/utils";

interface FolderRouteContext {
  params: Promise<{ folderId: string }>;
}

export async function POST(_request: Request, { params }: FolderRouteContext) {
  const { folderId } = await params;

  if (!isUuid(folderId)) {
    return Response.json({ error: "Invalid folder id" }, { status: 400 });
  }

  const didRestore = await restoreFolder(await getCurrentUserId(), folderId);
  return didRestore
    ? Response.json({ ok: true })
    : Response.json({ error: "Folder not found" }, { status: 404 });
}
