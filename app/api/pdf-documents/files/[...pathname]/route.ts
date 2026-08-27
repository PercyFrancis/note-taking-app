import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import { PDF_CONTENT_TYPE } from "@/lib/pdf";

type Context = { params: Promise<{ pathname: string[] }> };

export async function GET(request: Request, { params }: Context) {
  const { userId } = await auth();
  if (!userId)
    return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "PDF storage is not configured" },
      { status: 503 },
    );
  }
  const pathname = (await params).pathname.join("/");
  if (!pathname.startsWith(`users/${userId}/pdfs/`)) {
    return Response.json({ error: "PDF not found" }, { status: 404 });
  }
  try {
    const range = request.headers.get("range");
    const result = await get(pathname, {
      access: "private",
      headers: range ? { Range: range } : undefined,
    });
    if (!result || result.statusCode === 304 || !result.stream) {
      return Response.json({ error: "PDF not found" }, { status: 404 });
    }
    if (result.blob.contentType !== PDF_CONTENT_TYPE) {
      return Response.json({ error: "Invalid PDF type" }, { status: 415 });
    }
    const headers = new Headers(Array.from(result.headers.entries()));
    headers.set("Content-Type", PDF_CONTENT_TYPE);
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(result.stream, {
      status: headers.has("content-range") ? 206 : 200,
      headers,
    });
  } catch {
    return Response.json({ error: "PDF not found" }, { status: 404 });
  }
}
