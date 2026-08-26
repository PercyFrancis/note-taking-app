import { upload } from "@vercel/blob/client";
import { sanitizeImageFilename } from "../attachments";
import type { ParsedPortableArchive } from "../portable-workspace-transfer";
import type {
  PortableImportAttachment,
  PortableImportSession,
  ScopedWorkspaceExport,
} from "../types";

function isSession(value: unknown): value is PortableImportSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Partial<PortableImportSession>;
  return (
    typeof session.sessionId === "string" &&
    typeof session.token === "string" &&
    typeof session.expiresAt === "number" &&
    typeof session.uploadPrefix === "string"
  );
}

async function createSession(): Promise<PortableImportSession> {
  const response = await fetch("/api/attachments/portable-import-session", {
    method: "POST",
  });
  const value: unknown = await response.json();
  if (!response.ok || !isSession(value))
    throw new Error("Could not start import");
  return value;
}

async function cleanupSession(
  session: PortableImportSession,
  pathnames: string[],
) {
  try {
    await fetch("/api/attachments/portable-import-session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        token: session.token,
        pathnames,
      }),
    });
  } catch {
    // Best effort: the image library cleanup can remove abandoned blobs later.
  }
}

export async function importPortableWorkspace(
  archive: ParsedPortableArchive,
  destinationFolderId: string | null,
): Promise<string | null> {
  const session = await createSession();
  const uploaded: PortableImportAttachment[] = [];

  try {
    for (const attachment of archive.manifest.attachments) {
      const bytes = archive.files.get(attachment.id);
      if (!bytes) throw new Error("Archive attachment is missing");
      const filename = sanitizeImageFilename(attachment.filename);
      const file = new File([bytes.slice().buffer], filename, {
        type: attachment.contentType,
      });
      const result = await upload(
        `${session.uploadPrefix}${attachment.id}/${filename}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/attachments/upload",
          clientPayload: JSON.stringify({
            kind: "portable-import",
            sessionId: session.sessionId,
            attachmentId: attachment.id,
            token: session.token,
          }),
        },
      );
      uploaded.push({
        id: attachment.id,
        pathname: result.pathname,
        filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        sha256: attachment.sha256,
      });
    }

    const response = await fetch("/api/notebooks/import/portable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destinationFolderId,
        sessionId: session.sessionId,
        token: session.token,
        workspace: archive.workspace satisfies ScopedWorkspaceExport,
        attachments: uploaded,
      }),
    });
    const value: unknown = await response.json();
    if (
      !response.ok ||
      typeof value !== "object" ||
      value === null ||
      !("rootFolderId" in value) ||
      !(typeof value.rootFolderId === "string" || value.rootFolderId === null)
    ) {
      throw new Error("Portable import failed");
    }
    return value.rootFolderId;
  } catch (error) {
    await cleanupSession(
      session,
      uploaded.map((attachment) => attachment.pathname),
    );
    throw error;
  }
}
