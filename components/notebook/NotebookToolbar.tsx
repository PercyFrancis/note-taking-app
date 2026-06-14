"use client";

import { useRef } from "react";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/buttonStyles";

interface NotebookToolbarProps {
  onAddTextCell: () => void;
  onAddDrawingCell: () => void;
  onExportNotebooks: () => void;
  onImportNotebooks: (file: File) => void;
}

export default function NotebookToolbar({
  onAddTextCell,
  onAddDrawingCell,
  onExportNotebooks,
  onImportNotebooks,
}: NotebookToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
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
