import {
  isAllowedImageContentType,
  MAX_IMAGE_SIZE_BYTES,
  sanitizeImageFilename,
} from "../attachments";
import {
  isNotebook,
  isRecord,
  isStoredNotebooks,
} from "../notebook-validation";
import type { ParsedPortableArchive } from "../portable-workspace-transfer";
import type {
  Folder,
  Notebook,
  PortableArchiveAttachment,
  ScopedWorkspaceExport,
  TrashItem,
  UploadedImage,
} from "../types";
import { createDefaultNotebook, createId } from "../utils";

const DATABASE_NAME = "note-taking-app-guest";
const DATABASE_VERSION = 1;
const WORKSPACE_STORE = "workspace";
const ATTACHMENT_STORE = "attachments";
const WORKSPACE_KEY = "current";
const LEGACY_NOTEBOOKS_KEY = "note-taking-app:notebooks";

export interface GuestTrashEntry {
  item: TrashItem;
  notebooks: Notebook[];
  folders: Folder[];
}

export interface GuestWorkspace {
  version: 1;
  notebooks: Notebook[];
  folders: Folder[];
  trash: GuestTrashEntry[];
}

interface GuestAttachmentRecord {
  id: string;
  blob: Blob;
  pathname: string;
  displayName: string;
  originalFilename: string;
  size: number;
  uploadedAt: number;
  cellId: string | null;
  trashedAt: number | null;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function openGuestDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(WORKSPACE_STORE)) {
      database.createObjectStore(WORKSPACE_STORE);
    }
    if (!database.objectStoreNames.contains(ATTACHMENT_STORE)) {
      database.createObjectStore(ATTACHMENT_STORE, { keyPath: "id" });
    }
  };
  return requestResult(request);
}

function defaultWorkspace(): GuestWorkspace {
  return {
    version: 1,
    notebooks: [createDefaultNotebook()],
    folders: [],
    trash: [],
  };
}

export function isGuestWorkspace(value: unknown): value is GuestWorkspace {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.notebooks) ||
    !value.notebooks.every(isNotebook) ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.trash)
  ) {
    return false;
  }
  const foldersValid = value.folders.every(
    (folder) =>
      isRecord(folder) &&
      typeof folder.id === "string" &&
      typeof folder.name === "string" &&
      (folder.parentId === null || typeof folder.parentId === "string") &&
      typeof folder.position === "number" &&
      typeof folder.createdAt === "number" &&
      typeof folder.updatedAt === "number",
  );
  const trashValid = value.trash.every(
    (entry) =>
      isRecord(entry) &&
      isRecord(entry.item) &&
      typeof entry.item.id === "string" &&
      (entry.item.kind === "folder" || entry.item.kind === "notebook") &&
      typeof entry.item.name === "string" &&
      typeof entry.item.trashedAt === "number" &&
      Array.isArray(entry.notebooks) &&
      entry.notebooks.every(isNotebook) &&
      Array.isArray(entry.folders),
  );
  return foldersValid && trashValid;
}

function loadLegacyWorkspace(): GuestWorkspace | null {
  try {
    const value = localStorage.getItem(LEGACY_NOTEBOOKS_KEY);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    if (!isStoredNotebooks(parsed)) return null;
    return {
      version: 1,
      notebooks: parsed.notebooks.map((notebook) => ({
        ...notebook,
        folderId: notebook.folderId ?? null,
      })),
      folders: [],
      trash: [],
    };
  } catch {
    return null;
  }
}

export async function loadGuestWorkspace(): Promise<GuestWorkspace> {
  const database = await openGuestDatabase();
  const transaction = database.transaction(WORKSPACE_STORE, "readonly");
  const stored = (await requestResult(
    transaction.objectStore(WORKSPACE_STORE).get(WORKSPACE_KEY),
  )) as GuestWorkspace | undefined;
  database.close();
  if (isGuestWorkspace(stored)) return stored;

  const initial = loadLegacyWorkspace() ?? defaultWorkspace();
  await saveGuestWorkspace(initial);
  return initial;
}

export async function saveGuestWorkspace(
  workspace: GuestWorkspace,
): Promise<void> {
  const database = await openGuestDatabase();
  const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
  transaction.objectStore(WORKSPACE_STORE).put(workspace, WORKSPACE_KEY);
  await transactionComplete(transaction);
  database.close();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function mapGuestAttachment(
  record: GuestAttachmentRecord,
): Promise<UploadedImage> {
  return {
    id: record.id,
    pathname: record.pathname,
    url: await blobToDataUrl(record.blob),
    filename: record.displayName,
    originalFilename: record.originalFilename,
    size: record.size,
    uploadedAt: record.uploadedAt,
    cellId: record.cellId,
    trashedAt: record.trashedAt,
  };
}

export async function saveGuestImage(
  blob: Blob,
  filename: string,
  cellId: string | null,
  requestedId?: string,
): Promise<UploadedImage> {
  if (
    !isAllowedImageContentType(blob.type) ||
    blob.size > MAX_IMAGE_SIZE_BYTES
  ) {
    throw new Error("Invalid local image");
  }
  const database = await openGuestDatabase();
  const transaction = database.transaction(ATTACHMENT_STORE, "readwrite");
  const store = transaction.objectStore(ATTACHMENT_STORE);
  const id = requestedId ?? createId();
  const existing = (await requestResult(store.get(id))) as
    | GuestAttachmentRecord
    | undefined;
  const record: GuestAttachmentRecord = existing
    ? { ...existing, blob, size: blob.size, cellId: existing.cellId ?? cellId }
    : {
        id,
        blob,
        pathname: `local/${id}`,
        displayName: filename,
        originalFilename: filename,
        size: blob.size,
        uploadedAt: Date.now(),
        cellId,
        trashedAt: null,
      };
  store.put(record);
  await transactionComplete(transaction);
  database.close();
  return mapGuestAttachment(record);
}

async function changeGuestImage(
  id: string,
  change: (record: GuestAttachmentRecord) => GuestAttachmentRecord | null,
): Promise<UploadedImage | null> {
  const database = await openGuestDatabase();
  const transaction = database.transaction(ATTACHMENT_STORE, "readwrite");
  const store = transaction.objectStore(ATTACHMENT_STORE);
  const record = (await requestResult(store.get(id))) as
    | GuestAttachmentRecord
    | undefined;
  if (!record) {
    database.close();
    return null;
  }
  const next = change(record);
  if (next) store.put(next);
  else store.delete(id);
  await transactionComplete(transaction);
  database.close();
  return next ? mapGuestAttachment(next) : null;
}

export async function listGuestImages(status: "active" | "trash") {
  const database = await openGuestDatabase();
  const transaction = database.transaction(ATTACHMENT_STORE, "readonly");
  const records = (await requestResult(
    transaction.objectStore(ATTACHMENT_STORE).getAll(),
  )) as GuestAttachmentRecord[];
  database.close();
  const filtered = records
    .filter((record) =>
      status === "active"
        ? record.trashedAt === null
        : record.trashedAt !== null,
    )
    .sort((left, right) => right.uploadedAt - left.uploadedAt);
  return Promise.all(filtered.map(mapGuestAttachment));
}

export function renameGuestImage(id: string, displayName: string) {
  return changeGuestImage(id, (record) => ({ ...record, displayName }));
}

export function trashGuestImage(id: string) {
  return changeGuestImage(id, (record) => ({
    ...record,
    trashedAt: Date.now(),
  }));
}

export function restoreGuestImage(id: string) {
  return changeGuestImage(id, (record) => ({ ...record, trashedAt: null }));
}

export async function deleteGuestImage(id: string) {
  await changeGuestImage(id, () => null);
}

export async function getGuestStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
    persisted: navigator.storage.persisted
      ? await navigator.storage.persisted()
      : false,
  };
}

export async function requestGuestStoragePersistence() {
  return navigator.storage?.persist ? navigator.storage.persist() : false;
}

async function digest(bytes: Uint8Array) {
  const value = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function guestWorkspaceHasContent(workspace: GuestWorkspace) {
  return (
    workspace.folders.length > 0 ||
    workspace.notebooks.length > 1 ||
    workspace.notebooks.some(
      (notebook) =>
        notebook.title !== "New note" ||
        notebook.cells.some((cell) => {
          if (cell.type === "text") return cell.content.trim() !== "";
          return cell.drawing !== null;
        }),
    )
  );
}

export async function createGuestCloudTransfer(
  workspace: GuestWorkspace,
): Promise<ParsedPortableArchive> {
  const activeImages = await listGuestImages("active");
  const trashedImages = await listGuestImages("trash");
  const images = [...activeImages, ...trashedImages];
  const attachments: PortableArchiveAttachment[] = [];
  const files = new Map<string, Uint8Array>();
  const replacements = new Map<string, string>();

  for (const image of images) {
    const isReferenced = workspace.notebooks.some((notebook) =>
      notebook.cells.some((cell) => {
        if (cell.type === "drawing") return false;
        const value = cell.type === "text" ? cell.content : cell.drawing;
        return value?.includes(image.url);
      }),
    );
    if (!isReferenced) continue;
    const blob = await fetch(image.url).then((response) => response.blob());
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const id = createId();
    const filename = sanitizeImageFilename(
      image.originalFilename || image.filename,
    );
    const archivePath = `attachments/${id}/${filename}`;
    attachments.push({
      id,
      archivePath,
      filename,
      contentType: blob.type,
      sizeBytes: bytes.byteLength,
      sha256: await digest(bytes),
    });
    files.set(id, bytes);
    replacements.set(image.url, `note-attachment://${id}`);
  }

  const replace = (value: string | null) => {
    if (value === null) return null;
    let next = value;
    for (const [source, destination] of replacements) {
      next = next.replaceAll(source, destination);
    }
    return next;
  };
  const rootId = createId();
  const portableWorkspace: ScopedWorkspaceExport = {
    version: 2,
    kind: "folder",
    exportedAt: Date.now(),
    rootFolderId: rootId,
    folders: [
      { id: rootId, name: "Imported local workspace", parentId: null },
      ...workspace.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId ?? rootId,
      })),
    ],
    notebooks: workspace.notebooks.map((notebook) => ({
      title: notebook.title,
      folderId: notebook.folderId ?? rootId,
      cells: notebook.cells.map((cell) =>
        cell.type === "text"
          ? {
              type: "text",
              content: replace(cell.content) ?? "",
              heightPx: cell.heightPx,
            }
          : {
              type: cell.type,
              drawing:
                cell.type === "drawing" ? cell.drawing : replace(cell.drawing),
              heightPx: cell.heightPx,
            },
      ),
    })),
  };

  return {
    manifest: {
      format: "note-taking-app-portable",
      version: 1,
      exportedAt: Date.now(),
      workspacePath: "workspace.json",
      attachments,
    },
    workspace: portableWorkspace,
    files,
  };
}
