"use client";

import { useRef } from "react";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/buttonStyles";

interface NotebookToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
  onAddTextCell: () => void;
  onAddDrawingCell: () => void;
  isTouchDrawingEnabled: boolean;
  onToggleTouchDrawing: () => void;
  onOpenFind: () => void;
  onOpenImageLibrary: () => void;
  onExportNotebooks: () => void;
  onImportNotebooks: (file: File) => void;
}

export default function NotebookToolbar({
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  onAddTextCell,
  onAddDrawingCell,
  isTouchDrawingEnabled,
  onToggleTouchDrawing,
  onOpenFind,
  onOpenImageLibrary,
  onExportNotebooks,
  onImportNotebooks,
}: NotebookToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className={secondaryButtonClass}
        title={
          undoLabel ? `Undo ${undoLabel} (Ctrl/Cmd + Z)` : "Nothing to undo"
        }
      >
        Undo
      </button>

      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className={secondaryButtonClass}
        title={
          redoLabel
            ? `Redo ${redoLabel} (Ctrl/Cmd + Shift + Z)`
            : "Nothing to redo"
        }
      >
        Redo
      </button>

      <button
        type="button"
        onClick={onAddTextCell}
        className={secondaryButtonClass}
      >
        Add text cell
      </button>

      <button
        type="button"
        onClick={onAddDrawingCell}
        className={primaryButtonClass}
      >
        Add drawing cell
      </button>

      <button
        type="button"
        onClick={onToggleTouchDrawing}
        aria-pressed={isTouchDrawingEnabled}
        className={`inline-flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 ${
          isTouchDrawingEnabled
            ? "border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
        title="When off, one-finger gestures scroll over drawing cells"
      >
        Touch drawing: {isTouchDrawingEnabled ? "On" : "Off"}
      </button>

      <button
        type="button"
        onClick={onOpenFind}
        className={secondaryButtonClass}
        title="Find and replace (Ctrl/Cmd + F)"
      >
        Find and replace
      </button>

      <button
        type="button"
        onClick={onOpenImageLibrary}
        className={secondaryButtonClass}
      >
        Image library
      </button>

      <button
        type="button"
        onClick={onExportNotebooks}
        className={secondaryButtonClass}
      >
        Export JSON
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (!file) {
            return;
          }

          onImportNotebooks(file);
          event.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={secondaryButtonClass}
      >
        Import JSON
      </button>
    </div>
  );
}
