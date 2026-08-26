import { strFromU8, strToU8, unzip, zip } from "fflate";
import {
  createPrivateImageUrl,
  isAllowedImageContentType,
  MAX_IMAGE_SIZE_BYTES,
  sanitizeImageFilename,
} from "./attachments";
import { isScopedWorkspaceExport } from "./notebook-validation";
import type {
  PortableArchiveAttachment,
  PortableArchiveManifest,
  ScopedWorkspaceExport,
} from "./types";

export const MAX_PORTABLE_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_PORTABLE_ZIP_FILE_BYTES = 105 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2_000;
const PORTABLE_REFERENCE_PREFIX = "note-attachment://";
const PRIVATE_IMAGE_URL_PATTERN =
  /(?:https?:\/\/[^"'\\\s]+)?\/api\/attachments\/files\/[^"'\\\s)\]>]+/g;

export interface ParsedPortableArchive {
  manifest: PortableArchiveManifest;
  workspace: ScopedWorkspaceExport;
  files: Map<string, Uint8Array>;
}

function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  let totalSize = 0;
  let entryCount = 0;
  return new Promise((resolve, reject) => {
    unzip(
      data,
      {
        filter(file) {
          entryCount += 1;
          totalSize += file.originalSize;
          if (
            entryCount > MAX_ARCHIVE_ENTRIES ||
            totalSize > MAX_PORTABLE_ARCHIVE_BYTES
          ) {
            throw new Error("Portable archive exceeds its extraction limit");
          }
          return true;
        },
      },
      (error, files) => {
        if (error) reject(error);
        else resolve(files);
      },
    );
  });
}

function pathnameFromPrivateUrl(url: string): string | null {
  const marker = "/api/attachments/files/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  try {
    const pathname = url
      .slice(markerIndex + marker.length)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    return pathname.startsWith("users/") ? pathname : null;
  } catch {
    return null;
  }
}

function collectPrivateReferences(workspace: ScopedWorkspaceExport) {
  const references = new Map<string, Set<string>>();
  for (const notebook of workspace.notebooks) {
    for (const cell of notebook.cells) {
      const value = cell.type === "text" ? cell.content : cell.drawing;
      if (!value) continue;
      for (const match of value.matchAll(PRIVATE_IMAGE_URL_PATTERN)) {
        const url = match[0];
        const pathname = pathnameFromPrivateUrl(url);
        if (!pathname) continue;
        const urls = references.get(pathname) ?? new Set<string>();
        urls.add(url);
        references.set(pathname, urls);
      }
    }
  }
  return references;
}

function rewriteWorkspace(
  workspace: ScopedWorkspaceExport,
  replacements: Map<string, string>,
): ScopedWorkspaceExport {
  const replace = (value: string | null): string | null => {
    if (value === null) return null;
    let result = value;
    for (const [source, destination] of replacements) {
      result = result.replaceAll(source, destination);
    }
    return result;
  };

  return {
    ...workspace,
    folders: workspace.folders.map((folder) => ({ ...folder })),
    notebooks: workspace.notebooks.map((notebook) => ({
      ...notebook,
      cells: notebook.cells.map((cell) =>
        cell.type === "text"
          ? { ...cell, content: replace(cell.content) ?? "" }
          : { ...cell, drawing: replace(cell.drawing) },
      ),
    })),
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function filenameFromPathname(pathname: string): string {
  return sanitizeImageFilename(pathname.split("/").at(-1) ?? "image");
}

function isPortableManifest(value: unknown): value is PortableArchiveManifest {
  if (typeof value !== "object" || value === null) return false;
  const manifest = value as Partial<PortableArchiveManifest>;
  if (
    manifest.format === "note-taking-app-portable" &&
    manifest.version === 1 &&
    typeof manifest.exportedAt === "number" &&
    manifest.workspacePath === "workspace.json" &&
    Array.isArray(manifest.attachments) &&
    manifest.attachments.every(
      (attachment) =>
        typeof attachment === "object" &&
        attachment !== null &&
        typeof attachment.id === "string" &&
        typeof attachment.archivePath === "string" &&
        attachment.archivePath.startsWith("attachments/") &&
        !attachment.archivePath.includes("..") &&
        typeof attachment.filename === "string" &&
        typeof attachment.contentType === "string" &&
        isAllowedImageContentType(attachment.contentType) &&
        typeof attachment.sizeBytes === "number" &&
        attachment.sizeBytes >= 0 &&
        attachment.sizeBytes <= MAX_IMAGE_SIZE_BYTES &&
        typeof attachment.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(attachment.sha256),
    )
  ) {
    const attachmentIds = new Set(
      manifest.attachments.map((attachment) => attachment.id),
    );
    const archivePaths = new Set(
      manifest.attachments.map((attachment) => attachment.archivePath),
    );
    return (
      attachmentIds.size === manifest.attachments.length &&
      archivePaths.size === manifest.attachments.length
    );
  }
  return false;
}

export async function createPortableArchive(
  workspace: ScopedWorkspaceExport,
): Promise<Blob> {
  const privateReferences = collectPrivateReferences(workspace);
  const files: Record<string, Uint8Array> = {};
  const attachments: PortableArchiveAttachment[] = [];
  const replacements = new Map<string, string>();
  const attachmentByDigest = new Map<string, PortableArchiveAttachment>();
  const missing: string[] = [];
  let totalBytes = 0;

  for (const [pathname, urls] of privateReferences) {
    const response = await fetch(createPrivateImageUrl(pathname));
    if (!response.ok) {
      missing.push(pathname);
      continue;
    }
    const contentType = response.headers.get("Content-Type")?.split(";")[0];
    if (!contentType || !isAllowedImageContentType(contentType)) {
      missing.push(pathname);
      continue;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(`${pathname} exceeds the 10 MB image limit`);
    }
    const digest = await sha256(bytes);
    const dedupeKey = `${digest}:${contentType}:${bytes.byteLength}`;
    let attachment = attachmentByDigest.get(dedupeKey);
    if (!attachment) {
      const id = crypto.randomUUID();
      const filename = filenameFromPathname(pathname);
      attachment = {
        id,
        archivePath: `attachments/${id}/${filename}`,
        filename,
        contentType,
        sizeBytes: bytes.byteLength,
        sha256: digest,
      };
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_PORTABLE_ARCHIVE_BYTES) {
        throw new Error("Attachments exceed the 100 MB portable export limit");
      }
      attachmentByDigest.set(dedupeKey, attachment);
      attachments.push(attachment);
      files[attachment.archivePath] = bytes;
    }
    for (const url of urls) {
      replacements.set(url, `${PORTABLE_REFERENCE_PREFIX}${attachment.id}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing private images:\n${missing.join("\n")}`);
  }

  const manifest: PortableArchiveManifest = {
    format: "note-taking-app-portable",
    version: 1,
    exportedAt: Date.now(),
    workspacePath: "workspace.json",
    attachments,
  };
  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  const workspaceBytes = strToU8(
    JSON.stringify(rewriteWorkspace(workspace, replacements), null, 2),
  );
  if (
    totalBytes + manifestBytes.byteLength + workspaceBytes.byteLength >
    MAX_PORTABLE_ARCHIVE_BYTES
  ) {
    throw new Error("Portable export exceeds the 100 MB uncompressed limit");
  }
  files["manifest.json"] = manifestBytes;
  files["workspace.json"] = workspaceBytes;
  const archive = await zipAsync(files);
  return new Blob([archive.slice().buffer], { type: "application/zip" });
}

export async function parsePortableArchive(
  file: File,
): Promise<ParsedPortableArchive> {
  if (file.size > MAX_PORTABLE_ZIP_FILE_BYTES) {
    throw new Error("Portable ZIP exceeds the 105 MB file limit");
  }
  const entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()));
  const manifestBytes = entries["manifest.json"];
  const workspaceBytes = entries["workspace.json"];
  if (!manifestBytes || !workspaceBytes)
    throw new Error("Archive is incomplete");

  const manifestValue: unknown = JSON.parse(strFromU8(manifestBytes));
  const workspaceValue: unknown = JSON.parse(strFromU8(workspaceBytes));
  if (
    !isPortableManifest(manifestValue) ||
    !isScopedWorkspaceExport(workspaceValue)
  ) {
    throw new Error("Archive manifest or workspace is invalid");
  }

  const files = new Map<string, Uint8Array>();
  let totalBytes = 0;
  for (const attachment of manifestValue.attachments) {
    const bytes = entries[attachment.archivePath];
    if (!bytes || bytes.byteLength !== attachment.sizeBytes) {
      throw new Error(
        `Attachment ${attachment.filename} is missing or damaged`,
      );
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_PORTABLE_ARCHIVE_BYTES) {
      throw new Error("Attachments exceed the 100 MB import limit");
    }
    if ((await sha256(bytes)) !== attachment.sha256) {
      throw new Error(`Attachment ${attachment.filename} failed verification`);
    }
    files.set(attachment.id, bytes);
  }

  return { manifest: manifestValue, workspace: workspaceValue, files };
}

export function restorePortableReferences(
  workspace: ScopedWorkspaceExport,
  attachmentUrls: Map<string, string>,
): ScopedWorkspaceExport {
  const replacements = new Map<string, string>();
  for (const [id, url] of attachmentUrls) {
    replacements.set(`${PORTABLE_REFERENCE_PREFIX}${id}`, url);
  }
  return rewriteWorkspace(workspace, replacements);
}

export function createPortableExportFilename(
  name: string,
  kind: "notebook" | "folder",
) {
  return `${
    name
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || kind
  }-${kind}-portable.zip`;
}
