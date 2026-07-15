import { secondaryButtonClass } from "../ui/buttonStyles";

interface ImportNotebookDialogProps {
  fileName: string;
  notebookCount: number;
  cellCount: number;
  isImporting: boolean;
  onAppend: () => void;
  onReplace: () => void;
  onCancel: () => void;
}

export default function ImportNotebookDialog({
  fileName,
  notebookCount,
  cellCount,
  isImporting,
  onAppend,
  onReplace,
  onCancel,
}: ImportNotebookDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40
    p-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        aria-describedby="import-dialog-description"
        className="w-full max-w-lg rounded-lg border border-slate-300 bg-white p-3 shadow-xl"
      >
        <h2
          id="import-dialog-title"
          className="text-lg font-semibold text-slate-950"
        >
          Import notebooks
        </h2>

        <p
          id="import-dialog-description"
          className="mt-2 text-sm text-slate-600"
        >
          Choose how this file should be added to your workspace.
        </p>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-y border-slate-200 py-3 text-sm">
          <dt className="text-slate-500">File</dt>
          <dd className="truncate font-medium text-slate-900">{fileName}</dd>

          <dt className="text-slate-500">Notebooks</dt>
          <dd className="text-slate-900">{notebookCount}</dd>

          <dt className="text-slate-500">Cells</dt>
          <dd className="text-slate-900">{cellCount}</dd>
        </dl>

        <div className="mt-4 space-y-1">
          <button
            type="button"
            onClick={onAppend}
            disabled={isImporting}
            className="flex w-full flex-col rounded-md border border-slate-300 bg-white
            px-3 py-3 text-left transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="text-sm font-medium text-slate-950">
              {isImporting ? "Importing..." : "Append imported notebooks"}
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Adds them after your existing notebooks.
            </span>
          </button>

          <button
            type="button"
            onClick={onReplace}
            disabled={isImporting}
            className="flex w-full flex-col rounded-md border border-red-200 bg-white
            px-3 py-3 text-left transition-colors hover:bg-red-50 disabled:pointer-
            events-none disabled:opacity-50"
          >
            <span className="text-sm font-medium text-red-700">
              {isImporting ? "Importing..." : "Replace current notebooks"}
            </span>
            <span className="mt-1 text-xs text-red-500">
              Deletes your current notebooks before importing this file.
            </span>
          </button>
        </div>

        <div className="mt-1 flex justify-end space-y-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={isImporting}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
