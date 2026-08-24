import { auth } from "@clerk/nextjs/server";
import { list } from "@vercel/blob";
import { createPrivateImageUrl } from "@/lib/attachments";
import type { UploadedImage } from "@/lib/types";
import { isUuid } from "@/lib/utils";

const BLOBS_PER_REQUEST = 1000;
const MAX_LIST_REQUESTS = 20;

export async function GET() {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "Image storage is not configured" },
      { status: 503 },
    );
  }

  const prefix = `users/${clerkUserId}/images/`;
  const images: UploadedImage[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  let requestCount = 0;

  try {
    while (hasMore && requestCount < MAX_LIST_REQUESTS) {
      const result = await list({
        prefix,
        cursor,
        limit: BLOBS_PER_REQUEST,
      });

      for (const blob of result.blobs) {
        const relativePathname = blob.pathname.slice(prefix.length);
        const separatorIndex = relativePathname.indexOf("/");

        if (separatorIndex < 1) {
          continue;
        }

        const cellId = relativePathname.slice(0, separatorIndex);
        const filename = relativePathname.slice(separatorIndex + 1);

        if (!isUuid(cellId) || filename === "" || filename.includes("/")) {
          continue;
        }

        images.push({
          pathname: blob.pathname,
          url: createPrivateImageUrl(blob.pathname),
          filename,
          size: blob.size,
          uploadedAt: blob.uploadedAt.getTime(),
          cellId,
        });
      }

      cursor = result.cursor;
      hasMore = result.hasMore && Boolean(cursor);
      requestCount += 1;
    }

    images.sort((left, right) => right.uploadedAt - left.uploadedAt);

    return Response.json({
      images,
      truncated: hasMore,
    });
  } catch {
    return Response.json(
      { error: "Could not list uploaded images" },
      { status: 502 },
    );
  }
}
