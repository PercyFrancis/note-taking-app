"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  secondaryButtonClass,
  smallSecondaryButtonClass,
} from "@/components/ui/buttonStyles";
import type { NotebookCell, TextCellMatch } from "@/lib/types";
import {
  findTextCellMatches,
  replaceAllTextMatches,
  replaceTextMatch,
} from "@/lib/utils";

interface NotebookFindReplaceProps {
  cells: NotebookCell[];
  focusRequestId: number;
  query: string;
  onQueryChange: (query: string) => void;
  onUpdateTextCell: (cellId: string, content: string) => void;
  onUpdateTextCells: (updates: ReadonlyMap<string, string>) => void;
  onNavigate: (match: TextCellMatch) => void;
  onClose: () => void;
}

export default function NotebookFindReplace({
  cells,
  focusRequestId,
  query,
  onQueryChange,
  onUpdateTextCell,
  onUpdateTextCells,
  onNavigate,
  onClose,
}: NotebookFindReplaceProps) {
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const [replacement, setReplacement] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [status, setStatus] = useState("");
  const matches = useMemo(
    () => findTextCellMatches(cells, query),
    [cells, query],
  );
  const safeMatchIndex =
    matches.length && currentMatchIndex >= 0
      ? Math.min(currentMatchIndex, matches.length - 1)
      : 0;

  useEffect(() => {
    if (focusRequestId < 0) {
      return;
    }

    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [focusRequestId]);

  function navigate(direction: 1 | -1) {
    if (matches.length === 0) {
      return;
    }

    const nextIndex =
      currentMatchIndex === -1
        ? direction === 1
          ? 0
          : matches.length - 1
        : (safeMatchIndex + direction + matches.length) % matches.length;
    setCurrentMatchIndex(nextIndex);
    onNavigate(matches[nextIndex]);
  }

  function replaceCurrent() {
    const match = matches[safeMatchIndex];

    if (!match) {
      return;
    }

    const cell = cells.find(
      (candidate) => candidate.id === match.cellId && candidate.type === "text",
    );

    if (cell?.type !== "text") {
      return;
    }

    const nextContent = replaceTextMatch(cell.content, match, replacement);
    const nextCells = cells.map((candidate) =>
      candidate.id === cell.id && candidate.type === "text"
        ? { ...candidate, content: nextContent }
        : candidate,
    );
    const nextMatches = findTextCellMatches(nextCells, query);

    onUpdateTextCell(cell.id, nextContent);

    if (nextMatches.length > 0) {
      const replacedCellIndex = cells.findIndex(
        (candidate) => candidate.id === match.cellId,
      );
      const positionAfterReplacement = match.start + replacement.length;
      const followingMatchIndex = nextMatches.findIndex((candidate) => {
        const candidateCellIndex = cells.findIndex(
          (nextCell) => nextCell.id === candidate.cellId,
        );

        return (
          candidateCellIndex > replacedCellIndex ||
          (candidateCellIndex === replacedCellIndex &&
            candidate.start >= positionAfterReplacement)
        );
      });
      const nextMatchIndex =
        followingMatchIndex === -1 ? 0 : followingMatchIndex;

      setCurrentMatchIndex(nextMatchIndex);
      onNavigate(nextMatches[nextMatchIndex]);
    } else {
      setCurrentMatchIndex(-1);
    }

    setStatus("Replaced 1 match.");
  }

  function replaceAll() {
    if (matches.length === 0) {
      return;
    }

    const replacementCount = matches.length;
    onUpdateTextCells(replaceAllTextMatches(cells, query, replacement));
    setStatus(
      `Replaced ${replacementCount} ${replacementCount === 1 ? "match" : "matches"}.`,
    );
  }

  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50 px-4 py-3 shadow-sm md:px-8">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-end">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-600">
          Find in this notebook
          <input
            ref={findInputRef}
            type="text"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setCurrentMatchIndex(-1);
              setStatus("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                navigate(event.shiftKey ? -1 : 1);
              }
            }}
            className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-400"
            placeholder="Find text"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="min-w-16 text-center text-sm tabular-nums text-slate-500"
            aria-live="polite"
          >
            {matches.length === 0
              ? "0 matches"
              : `${safeMatchIndex + 1} of ${matches.length}`}
          </span>
          <button
            type="button"
            className={smallSecondaryButtonClass}
            disabled={matches.length === 0}
            onClick={() => navigate(-1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={smallSecondaryButtonClass}
            disabled={matches.length === 0}
            onClick={() => navigate(1)}
          >
            Next
          </button>
        </div>

        <label className="min-w-0 flex-1 text-xs font-medium text-slate-600">
          Replace with
          <input
            type="text"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-400"
            placeholder="Replacement text"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={smallSecondaryButtonClass}
            disabled={matches.length === 0}
            onClick={replaceCurrent}
          >
            Replace
          </button>
          <button
            type="button"
            className={smallSecondaryButtonClass}
            disabled={matches.length === 0}
            onClick={replaceAll}
          >
            Replace all
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={onClose}
            aria-label="Close find and replace"
            title="Close find and replace (Escape)"
          >
            Close
          </button>
        </div>
      </div>
      <p className="mt-2 min-h-4 text-xs text-slate-500" aria-live="polite">
        {status ||
          "Case-insensitive search of text cells. Markdown source is included."}
      </p>
    </div>
  );
}
