import { getCurrentUserId } from "@/lib/server/current-user";
import { getTrashItems } from "@/lib/server/folder-repository";

export async function GET() {
  return Response.json({
    items: await getTrashItems(await getCurrentUserId()),
  });
}
