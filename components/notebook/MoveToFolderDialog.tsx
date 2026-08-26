"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Folder } from "@/lib/types";

interface MoveToFolderDialogProps {
  itemKind: "notebook" | "folder";
  itemId: string;
  itemName: string;
  currentFolderId: string | null;
  folders: Folder[];
  onClose: () => void;
  onMove: (folderId: string | null) => void;
}

type FolderChoice = Folder & { depth: number; path: string };

export default function MoveToFolderDialog({
  itemKind,
  itemId,
  itemName,
  currentFolderId,
  folders,
  onClose,
  onMove,
}: MoveToFolderDialogProps) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const { choices, invalidFolderIds } = useMemo(() => {
    const foldersByParent = new Map<string | null, Folder[]>();
    for (const folder of folders) {
      const siblings = foldersByParent.get(folder.parentId) ?? [];
      siblings.push(folder);
      foldersByParent.set(folder.parentId, siblings);
    }
    for (const siblings of foldersByParent.values()) {
      siblings.sort((left, right) => left.name.localeCompare(right.name));
    }

    const flattened: FolderChoice[] = [];
    const walk = (
      parentId: string | null,
      depth: number,
      parentPath: string,
    ) => {
      for (const folder of foldersByParent.get(parentId) ?? []) {
        const path = parentPath
          ? `${parentPath} / ${folder.name}`
          : folder.name;
        flattened.push({ ...folder, depth, path });
        walk(folder.id, depth + 1, path);
      }
    };
    walk(null, 0, "");

    const invalidIds = new Set<string>();
    if (itemKind === "folder") {
      invalidIds.add(itemId);
      let changed = true;
      while (changed) {
        changed = false;
        for (const folder of folders) {
          if (
            folder.parentId &&
            invalidIds.has(folder.parentId) &&
            !invalidIds.has(folder.id)
          ) {
            invalidIds.add(folder.id);
            changed = true;
          }
        }
      }
    }

    return { choices: flattened, invalidFolderIds: invalidIds };
  }, [folders, itemId, itemKind]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleChoices = normalizedQuery
    ? choices.filter((folder) =>
        folder.path.toLocaleLowerCase().includes(normalizedQuery),
      )
    : choices;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/35"
        onClick={onClose}
        aria-label="Close move dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-dialog-title"
        className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-white p-5 shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="move-dialog-title" className="text-lg font-semibold">
              Move {itemKind}
            </h2>
            <p className="mt-1 truncate text-sm text-slate-500">{itemName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close move dialog"
          >
            ×
          </button>
        </div>

        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search folders..."
          className="mt-4 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        />

        <div className="mt-3 min-h-0 overflow-y-auto rounded-md border border-slate-200 p-1">
          <button
            type="button"
            disabled={currentFolderId === null}
            onClick={() => onMove(null)}
            className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-100 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-400"
          >
            Unfiled / root {currentFolderId === null ? "(current)" : ""}
          </button>
          {visibleChoices.map((folder) => {
            const isCurrent = folder.id === currentFolderId;
            const isInvalid = invalidFolderIds.has(folder.id);
            return (
              <button
                key={folder.id}
                type="button"
                disabled={isCurrent || isInvalid}
                onClick={() => onMove(folder.id)}
                className="block w-full rounded py-2 pr-3 text-left text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                style={{
                  paddingLeft: normalizedQuery ? 12 : folder.depth * 18 + 12,
                }}
                title={folder.path}
              >
                📁 {normalizedQuery ? folder.path : folder.name}
                {isCurrent ? " (current)" : ""}
                {isInvalid ? " (unavailable)" : ""}
              </button>
            );
          })}
          {visibleChoices.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-slate-400">
              No matching folders.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
