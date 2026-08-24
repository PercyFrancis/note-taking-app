import { auth } from "@clerk/nextjs/server";
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/attachments";
import { getCurrentUserId } from "@/lib/server/current-user";
import { userOwnsTextCell } from "@/lib/server/notebook-repository";
import { isUuid } from "@/lib/utils";

interface ImageUploadPayload {
  cellId: string;
}

function parseImageUploadPayload(value: string | null): ImageUploadPayload {
  if (!value) {
    throw new Error("Missing upload context");
  }

  const parsed: unknown = JSON.parse(value);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("cellId" in parsed) ||
    typeof parsed.cellId !== "string" ||
    !isUuid(parsed.cellId)
  ) {
    throw new Error("Invalid upload context");
  }

  return { cellId: parsed.cellId };
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "Image storage is not configured" },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId: clerkUserId } = await auth();

        if (!clerkUserId) {
          throw new Error("Not signed in");
        }

        const { cellId } = parseImageUploadPayload(clientPayload);
        const appUserId = await getCurrentUserId();
        const ownsCell = await userOwnsTextCell(appUserId, cellId);

        if (!ownsCell) {
          throw new Error("Text cell not found");
        }

        const expectedPrefix = `users/${clerkUserId}/images/${cellId}/`;
        const filename = pathname.slice(expectedPrefix.length);

        if (
          !pathname.startsWith(expectedPrefix) ||
          filename === "" ||
          filename.includes("/") ||
          filename.includes("\\") ||
          filename.includes("..")
        ) {
          throw new Error("Invalid image pathname");
        }

        return {
          allowedContentTypes: [...ALLOWED_IMAGE_CONTENT_TYPES],
          maximumSizeInBytes: MAX_IMAGE_SIZE_BYTES,
          addRandomSuffix: true,
        };
      },
    });

    return Response.json(response);
  } catch {
    return Response.json(
      { error: "Image upload was rejected" },
      { status: 400 },
    );
  }
}
