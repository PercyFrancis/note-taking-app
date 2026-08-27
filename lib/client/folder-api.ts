import {
  isFolderResponse,
  isFoldersResponse,
  isTrashResponse,
} from "../notebook-validation";
import type { Folder, TrashItem } from "../types";

export async function loadRemoteFolders(): Promise<Folder[]> {
  const response = await fetch("/api/folders");
  const data: unknown = await response.json();
  if (!response.ok || !isFoldersResponse(data)) {
    throw new Error(`Folders request failed (${response.status})`);
  }
  return data.folders;
}

export async function createRemoteFolder(
  name: string,
  parentId: string | null,
): Promise<Folder> {
  const response = await fetch("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId }),
  });
  const data: unknown = await response.json();
  if (!response.ok || !isFolderResponse(data)) {
    throw new Error("Failed to create folder");
  }
  return data.folder;
}

export async function renameRemoteFolder(
  folderId: string,
  name: string,
): Promise<Folder> {
  return updateFolder(folderId, { action: "rename", name });
}

export async function moveRemoteFolder(
  folderId: string,
  parentId: string | null,
): Promise<Folder> {
  return updateFolder(folderId, { action: "move", parentId });
}

async function updateFolder(
  folderId: string,
  body:
    | { action: "rename"; name: string }
    | { action: "move"; parentId: string | null },
): Promise<Folder> {
  const response = await fetch(`/api/folders/${folderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok || !isFolderResponse(data)) {
    throw new Error("Failed to update folder");
  }
  return data.folder;
}

export async function deleteRemoteFolder(
  folderId: string,
  permanent = false,
): Promise<void> {
  const response = await fetch(
    `/api/folders/${folderId}${permanent ? "?permanent=true" : ""}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error("Failed to delete folder");
}

export async function restoreRemoteFolder(folderId: string): Promise<void> {
  const response = await fetch(`/api/folders/${folderId}/restore`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to restore folder");
}

export async function loadRemoteTrash(): Promise<TrashItem[]> {
  const response = await fetch("/api/trash");
  const data: unknown = await response.json();
  if (!response.ok || !isTrashResponse(data)) {
    throw new Error(`Trash request failed (${response.status})`);
  }
  return data.items;
}
