import { auth } from "@clerk/nextjs/server";
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { getPdfLimits, PDF_CONTENT_TYPE } from "@/lib/pdf";
import { isUuid } from "@/lib/utils";

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "PDF storage is not configured" },
      { status: 503 },
    );
  }
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Not signed in");
        const payload = JSON.parse(clientPayload ?? "null") as unknown;
        if (
          !payload ||
          typeof payload !== "object" ||
          !("documentId" in payload)
        ) {
          throw new Error("Missing PDF document id");
        }
        const documentId = payload.documentId;
        if (typeof documentId !== "string" || !isUuid(documentId)) {
          throw new Error("Invalid PDF document id");
        }
        const prefix = `users/${userId}/pdfs/${documentId}/`;
        const filename = pathname.slice(prefix.length);
        if (
          !pathname.startsWith(prefix) ||
          !filename ||
          filename.includes("/") ||
          filename.includes("\\") ||
          filename.includes("..")
        ) {
          throw new Error("Invalid PDF pathname");
        }
        const limits = getPdfLimits();
        return {
          allowedContentTypes: [PDF_CONTENT_TYPE],
          maximumSizeInBytes:
            limits.maximumSizeInBytes ?? 5 * 1024 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(response);
  } catch (error) {
    console.error("PDF upload token request failed", error);
    return Response.json({ error: "PDF upload was rejected" }, { status: 400 });
  }
}
