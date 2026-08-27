import { getCurrentUserId } from "@/lib/server/current-user";
import { listPdfAnnotations } from "@/lib/server/pdf-repository";

type Context = { params: Promise<{ documentId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const userId = await getCurrentUserId();
  const { documentId } = await params;
  return Response.json({
    annotations: await listPdfAnnotations(userId, documentId),
  });
}
