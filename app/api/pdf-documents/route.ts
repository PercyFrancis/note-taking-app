import { auth } from "@clerk/nextjs/server";
import { head } from "@vercel/blob";
import { getPdfLimits, PDF_CONTENT_TYPE } from "@/lib/pdf";
import { getCurrentUserId } from "@/lib/server/current-user";
import {
  createPdfDocument,
  listPdfDocuments,
} from "@/lib/server/pdf-repository";
import { isUuid } from "@/lib/utils";

export async function GET() {
  const userId = await getCurrentUserId();
  return Response.json({ documents: await listPdfDocuments(userId) });
}

export async function POST(request: Request) {
  const body: unknown = await request.json();
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid PDF document" }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  const limits = getPdfLimits();
  const { userId: clerkUserId } = await auth();
  if (
    typeof value.id !== "string" ||
    !isUuid(value.id) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 200 ||
    typeof value.originalFilename !== "string" ||
    typeof value.pathname !== "string" ||
    !clerkUserId ||
    !value.pathname.startsWith(`users/${clerkUserId}/pdfs/${value.id}/`) ||
    typeof value.sizeBytes !== "number" ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 1 ||
    typeof value.pageCount !== "number" ||
    !Number.isSafeInteger(value.pageCount) ||
    value.pageCount < 1 ||
    (limits.maximumSizeInBytes !== null &&
      value.sizeBytes > limits.maximumSizeInBytes) ||
    (limits.maximumPages !== null && value.pageCount > limits.maximumPages)
  ) {
    return Response.json(
      { error: "PDF exceeds its configured limits" },
      { status: 400 },
    );
  }

  try {
    const blob = await head(value.pathname);
    if (
      blob.contentType !== PDF_CONTENT_TYPE ||
      blob.size !== value.sizeBytes
    ) {
      return Response.json(
        { error: "PDF metadata does not match the upload" },
        { status: 400 },
      );
    }
  } catch {
    return Response.json(
      { error: "Uploaded PDF was not found" },
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();
  const document = await createPdfDocument(userId, {
    id: value.id,
    title: value.title.trim(),
    originalFilename: value.originalFilename,
    pathname: value.pathname,
    sizeBytes: value.sizeBytes,
    pageCount: value.pageCount,
  });
  return Response.json(
    { document, contentType: PDF_CONTENT_TYPE },
    { status: 201 },
  );
}
