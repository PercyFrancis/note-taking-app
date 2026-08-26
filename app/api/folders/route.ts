import { normalizeFolderName } from "@/lib/folders";
import { isCreateFolderInput } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import { createFolder, getFolders } from "@/lib/server/folder-repository";

export async function GET() {
  const userId = await getCurrentUserId();
  return Response.json({ folders: await getFolders(userId) });
}

export async function POST(request: Request) {
  const body: unknown = await request.json();

  if (!isCreateFolderInput(body)) {
    return Response.json({ error: "Invalid folder input" }, { status: 400 });
  }

  const name = normalizeFolderName(body.name);

  if (!name) {
    return Response.json({ error: "Invalid folder name" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const folder = await createFolder(userId, name, body.parentId ?? null);

  return folder
    ? Response.json({ folder }, { status: 201 })
    : Response.json({ error: "Parent folder not found" }, { status: 404 });
}
