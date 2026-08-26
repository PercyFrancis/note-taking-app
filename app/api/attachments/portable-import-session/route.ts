import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { isRecord } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import {
  createPortableImportSession,
  portableImportPathPrefix,
  verifyPortableImportSession,
} from "@/lib/server/portable-import-session";

export async function POST() {
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
  const appUserId = await getCurrentUserId();
  const session = createPortableImportSession(appUserId, clerkUserId);
  return Response.json({
    ...session,
    uploadPrefix: portableImportPathPrefix(clerkUserId, session.sessionId),
  });
}

export async function DELETE(request: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId)
    return Response.json({ error: "Not signed in" }, { status: 401 });

  try {
    const body: unknown = await request.json();
    if (
      !isRecord(body) ||
      typeof body.sessionId !== "string" ||
      typeof body.token !== "string" ||
      !Array.isArray(body.pathnames) ||
      !body.pathnames.every((pathname) => typeof pathname === "string")
    ) {
      return Response.json(
        { error: "Invalid cleanup request" },
        { status: 400 },
      );
    }
    const appUserId = await getCurrentUserId();
    verifyPortableImportSession(body.token, {
      sessionId: body.sessionId,
      appUserId,
      clerkUserId,
    });
    const prefix = portableImportPathPrefix(clerkUserId, body.sessionId);
    if (!body.pathnames.every((pathname) => pathname.startsWith(prefix))) {
      return Response.json({ error: "Invalid cleanup path" }, { status: 400 });
    }
    if (body.pathnames.length > 0) await del(body.pathnames);
    return new Response(null, { status: 204 });
  } catch {
    return Response.json(
      { error: "Could not clean up import" },
      { status: 400 },
    );
  }
}
