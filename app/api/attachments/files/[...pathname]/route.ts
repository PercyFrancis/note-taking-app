import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import { isAllowedImageContentType } from "@/lib/attachments";

interface AttachmentFileRouteContext {
  params: Promise<{ pathname: string[] }>;
}

export async function GET(
  _request: Request,
  { params }: AttachmentFileRouteContext,
) {
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

  const { pathname: pathnameSegments } = await params;
  const pathname = pathnameSegments.join("/");
  const expectedPrefix = `users/${clerkUserId}/images/`;

  if (!pathname.startsWith(expectedPrefix)) {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }

  try {
    const result = await get(pathname, { access: "private" });

    if (!result || result.statusCode === 304 || !result.stream) {
      return Response.json({ error: "Image not found" }, { status: 404 });
    }

    if (!isAllowedImageContentType(result.blob.contentType)) {
      return Response.json({ error: "Invalid image type" }, { status: 415 });
    }

    return new Response(result.stream, {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(result.blob.size),
        "Content-Type": result.blob.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }
}
