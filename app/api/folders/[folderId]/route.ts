import { normalizeFolderName } from "@/lib/folders";
import { isUpdateFolderInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import {
  moveFolder,
  permanentlyDeleteFolder,
  renameFolder,
  trashFolder,
} from "@/lib/server/folder-repository";
import { isUuid } from "@/lib/utils";

interface FolderRouteContext {
  params: Promise<{ folderId: string }>;
}

export async function PATCH(request: Request, { params }: FolderRouteContext) {
  const { folderId } = await params;
  const body: unknown = await request.json();

  if (!isUuid(folderId) || !isUpdateFolderInput(body)) {
    return Response.json({ error: "Invalid folder update" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const normalizedName =
    body.action === "rename" ? normalizeFolderName(body.name ?? "") : null;

  if (body.action === "rename" && !normalizedName) {
    return Response.json({ error: "Invalid folder name" }, { status: 400 });
  }

  const folder =
    body.action === "rename"
      ? await renameFolder(userId, folderId, normalizedName ?? "")
      : await moveFolder(userId, folderId, body.parentId ?? null);

  return folder
    ? Response.json({ folder })
    : Response.json(
        { error: "Folder not found or move would create a cycle" },
        { status: 409 },
      );
}

export async function DELETE(request: Request, { params }: FolderRouteContext) {
  const { folderId } = await params;

  if (!isUuid(folderId)) {
    return Response.json({ error: "Invalid folder id" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const permanent =
    new URL(request.url).searchParams.get("permanent") === "true";
  const didDelete = permanent
    ? await permanentlyDeleteFolder(userId, folderId)
    : await trashFolder(userId, folderId);

  return didDelete
    ? Response.json({ ok: true })
    : Response.json({ error: "Folder not found" }, { status: 404 });
}
