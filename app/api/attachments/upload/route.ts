import { auth } from "@clerk/nextjs/server";
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/attachments";
import { getCurrentUserId } from "@/lib/server/current-user";
import { userOwnsImageAttachmentCell } from "@/lib/server/notebook-repository";
import {
  portableImportPathPrefix,
  verifyPortableImportSession,
} from "@/lib/server/portable-import-session";
import { isUuid } from "@/lib/utils";

interface CellImageUploadPayload {
  cellId: string;
}

interface PortableImageUploadPayload {
  kind: "portable-import";
  sessionId: string;
  attachmentId: string;
  token: string;
}

type ImageUploadPayload = CellImageUploadPayload | PortableImageUploadPayload;

function parseImageUploadPayload(value: string | null): ImageUploadPayload {
  if (!value) {
    throw new Error("Missing upload context");
  }

  const parsed: unknown = JSON.parse(value);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid upload context");
  }

  if (
    "cellId" in parsed &&
    typeof parsed.cellId === "string" &&
    isUuid(parsed.cellId)
  ) {
    return { cellId: parsed.cellId };
  }

  if (
    "kind" in parsed &&
    parsed.kind === "portable-import" &&
    "sessionId" in parsed &&
    typeof parsed.sessionId === "string" &&
    isUuid(parsed.sessionId) &&
    "attachmentId" in parsed &&
    typeof parsed.attachmentId === "string" &&
    isUuid(parsed.attachmentId) &&
    "token" in parsed &&
    typeof parsed.token === "string"
  ) {
    return {
      kind: "portable-import",
      sessionId: parsed.sessionId,
      attachmentId: parsed.attachmentId,
      token: parsed.token,
    };
  }

  throw new Error("Invalid upload context");
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

        const payload = parseImageUploadPayload(clientPayload);
        const appUserId = await getCurrentUserId();
        let expectedPrefix: string;
        if ("kind" in payload) {
          verifyPortableImportSession(payload.token, {
            sessionId: payload.sessionId,
            appUserId,
            clerkUserId,
          });
          expectedPrefix = portableImportPathPrefix(
            clerkUserId,
            payload.sessionId,
            payload.attachmentId,
          );
        } else {
          const ownsCell = await userOwnsImageAttachmentCell(
            appUserId,
            payload.cellId,
          );
          if (!ownsCell) throw new Error("Image attachment cell not found");
          expectedPrefix = `users/${clerkUserId}/images/${payload.cellId}/`;
        }
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
