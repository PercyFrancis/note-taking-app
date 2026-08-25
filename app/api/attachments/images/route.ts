import { auth } from "@clerk/nextjs/server";
import { del, list } from "@vercel/blob";
import {
  type AttachmentIndexEntry,
  deleteAttachmentRecord,
  getAttachments,
  getExpiredUnreferencedAttachments,
  synchronizeAttachmentIndex,
} from "@/lib/server/attachment-repository";
import { getCurrentUserId } from "@/lib/server/current-user";
import { isUuid } from "@/lib/utils";

const BLOBS_PER_REQUEST = 1000;
const MAX_LIST_REQUESTS = 20;

export async function GET(request: Request) {
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
  const status = new URL(request.url).searchParams.get("status");

  if (status !== null && status !== "active" && status !== "trash") {
    return Response.json({ error: "Invalid library status" }, { status: 400 });
  }

  const indexEntries: AttachmentIndexEntry[] = [];
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

        indexEntries.push({
          pathname: blob.pathname,
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

    const appUserId = await getCurrentUserId();
    await synchronizeAttachmentIndex(appUserId, indexEntries);
    const expiredImages = await getExpiredUnreferencedAttachments(appUserId);

    await Promise.all(
      expiredImages.map(async (image) => {
        try {
          await del(image.pathname);
          await deleteAttachmentRecord(appUserId, image.id);
        } catch {
          // Keep the index row so cleanup can be retried next time.
        }
      }),
    );

    const images = await getAttachments(appUserId, status ?? "active");

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
