import { getCurrentUserId } from "@/lib/server/current-user";
import { savePdfAnnotation } from "@/lib/server/pdf-repository";

type Context = { params: Promise<{ documentId: string; pageNumber: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { documentId, pageNumber: pageValue } = await params;
  const pageNumber = Number(pageValue);
  const body: unknown = await request.json();
  const scene =
    body && typeof body === "object" && "scene" in body
      ? (body as { scene?: unknown }).scene
      : null;
  if (
    !Number.isSafeInteger(pageNumber) ||
    pageNumber < 1 ||
    typeof scene !== "string" ||
    scene.length > 10 * 1024 * 1024
  ) {
    return Response.json({ error: "Invalid annotation" }, { status: 400 });
  }
  const userId = await getCurrentUserId();
  const annotation = await savePdfAnnotation(
    userId,
    documentId,
    pageNumber,
    scene,
  );
  return annotation
    ? Response.json({ annotation })
    : Response.json({ error: "PDF not found" }, { status: 404 });
}
