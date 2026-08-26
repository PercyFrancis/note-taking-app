import { auth } from "@clerk/nextjs/server";
import { del, head } from "@vercel/blob";
import {
  createPrivateImageUrl,
  isAllowedImageContentType,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/attachments";
import { isRecord, isScopedWorkspaceExport } from "@/lib/notebook-validation";
import { getCurrentUserId } from "@/lib/server/current-user";
import {
  portableImportPathPrefix,
  verifyPortableImportSession,
} from "@/lib/server/portable-import-session";
import { importScopedWorkspace } from "@/lib/server/scoped-workspace-repository";
import type {
  PortableImportAttachment,
  PortableWorkspaceImportInput,
  ScopedWorkspaceExport,
} from "@/lib/types";
import { isUuid } from "@/lib/utils";

const PORTABLE_REFERENCE_PATTERN = /note-attachment:\/\/([0-9a-f-]{36})/gi;
const MAX_TOTAL_SIZE_BYTES = 100 * 1024 * 1024;

function isPortableAttachment(
  value: unknown,
): value is PortableImportAttachment {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isUuid(value.id) &&
    typeof value.pathname === "string" &&
    typeof value.filename === "string" &&
    value.filename.length > 0 &&
    value.filename.length <= 120 &&
    !value.filename.includes("/") &&
    !value.filename.includes("\\") &&
    typeof value.contentType === "string" &&
    isAllowedImageContentType(value.contentType) &&
    typeof value.sizeBytes === "number" &&
    Number.isInteger(value.sizeBytes) &&
    value.sizeBytes >= 0 &&
    value.sizeBytes <= MAX_IMAGE_SIZE_BYTES &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256)
  );
}

function isPortableInput(
  value: unknown,
): value is PortableWorkspaceImportInput {
  return (
    isRecord(value) &&
    (value.destinationFolderId === null ||
      (typeof value.destinationFolderId === "string" &&
        isUuid(value.destinationFolderId))) &&
    typeof value.sessionId === "string" &&
    isUuid(value.sessionId) &&
    typeof value.token === "string" &&
    isScopedWorkspaceExport(value.workspace) &&
    Array.isArray(value.attachments) &&
    value.attachments.every(isPortableAttachment) &&
    new Set(value.attachments.map((attachment) => attachment.id)).size ===
      value.attachments.length &&
    value.attachments.reduce(
      (total, attachment) => total + attachment.sizeBytes,
      0,
    ) <= MAX_TOTAL_SIZE_BYTES
  );
}

function rewriteWorkspace(
  workspace: ScopedWorkspaceExport,
  attachments: PortableImportAttachment[],
): ScopedWorkspaceExport {
  const urls = new Map(
    attachments.map((attachment) => [
      attachment.id,
      createPrivateImageUrl(attachment.pathname),
    ]),
  );
  const foundIds = new Set<string>();
  const replace = (value: string | null) =>
    value?.replace(PORTABLE_REFERENCE_PATTERN, (_match, id: string) => {
      const normalizedId = id.toLowerCase();
      const url = urls.get(normalizedId);
      if (!url) throw new Error("Archive references an unknown attachment");
      foundIds.add(normalizedId);
      return url;
    }) ?? null;

  const rewritten: ScopedWorkspaceExport = {
    ...workspace,
    notebooks: workspace.notebooks.map((notebook) => ({
      ...notebook,
      cells: notebook.cells.map((cell) =>
        cell.type === "text"
          ? { ...cell, content: replace(cell.content) ?? "" }
          : { ...cell, drawing: replace(cell.drawing) },
      ),
    })),
  };
  if (foundIds.size !== attachments.length) {
    throw new Error("Archive contains unreferenced attachments");
  }
  return rewritten;
}

export async function POST(request: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId)
    return Response.json({ error: "Not signed in" }, { status: 401 });

  let stagedPathnames: string[] = [];
  try {
    const body: unknown = await request.json();
    if (!isPortableInput(body)) {
      return Response.json(
        { error: "Invalid portable import" },
        { status: 400 },
      );
    }
    const appUserId = await getCurrentUserId();
    verifyPortableImportSession(body.token, {
      sessionId: body.sessionId,
      appUserId,
      clerkUserId,
    });
    stagedPathnames = body.attachments.map((attachment) => attachment.pathname);

    await Promise.all(
      body.attachments.map(async (attachment) => {
        const expectedPrefix = portableImportPathPrefix(
          clerkUserId,
          body.sessionId,
          attachment.id,
        );
        if (!attachment.pathname.startsWith(expectedPrefix)) {
          throw new Error("Invalid staged attachment path");
        }
        const metadata = await head(attachment.pathname);
        if (
          metadata.size !== attachment.sizeBytes ||
          metadata.contentType !== attachment.contentType
        ) {
          throw new Error("Staged attachment metadata does not match");
        }
      }),
    );

    const workspace = rewriteWorkspace(body.workspace, body.attachments);
    const rootFolderId = await importScopedWorkspace(
      appUserId,
      { destinationFolderId: body.destinationFolderId, workspace },
      body.attachments.map((attachment) => ({
        pathname: attachment.pathname,
        filename: attachment.filename,
        sizeBytes: attachment.sizeBytes,
      })),
    );
    return Response.json({ rootFolderId });
  } catch {
    if (stagedPathnames.length > 0) {
      try {
        await del(stagedPathnames);
      } catch {
        // A later library cleanup can retry removal of abandoned blobs.
      }
    }
    return Response.json(
      { error: "Failed to import portable archive" },
      { status: 500 },
    );
  }
}
