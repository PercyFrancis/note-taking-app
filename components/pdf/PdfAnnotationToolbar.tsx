"use client";

export type PdfAnnotationTool =
  | "selection"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "eraser";

export type PdfToolbarDock = "top" | "right" | "bottom" | "left";

export interface PdfAnnotationToolbarState {
  tool: PdfAnnotationTool;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "hachure" | "cross-hatch" | "solid";
  strokeWidth: 1 | 2 | 4;
  strokeStyle: "solid" | "dashed" | "dotted";
  roughness: 0 | 1 | 2;
}

export const DEFAULT_PDF_ANNOTATION_TOOLBAR_STATE: PdfAnnotationToolbarState = {
  tool: "selection",
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
};

const TOOLS: Array<{
  value: PdfAnnotationTool;
  label: string;
  shortLabel: string;
}> = [
  { value: "selection", label: "Select", shortLabel: "Select" },
  { value: "rectangle", label: "Rectangle", shortLabel: "Rect" },
  { value: "ellipse", label: "Ellipse", shortLabel: "Ellipse" },
  { value: "diamond", label: "Diamond", shortLabel: "Diamond" },
  { value: "arrow", label: "Arrow", shortLabel: "Arrow" },
  { value: "line", label: "Line", shortLabel: "Line" },
  { value: "freedraw", label: "Draw", shortLabel: "Draw" },
  { value: "text", label: "Text", shortLabel: "Text" },
  { value: "eraser", label: "Eraser", shortLabel: "Erase" },
];

export function PdfAnnotationToolbar({
  state,
  dock,
  activePage,
  onChange,
  onDockChange,
  onUndo,
  onRedo,
}: {
  state: PdfAnnotationToolbarState;
  dock: PdfToolbarDock;
  activePage: number;
  onChange: (change: Partial<PdfAnnotationToolbarState>) => void;
  onDockChange: (dock: PdfToolbarDock) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const isVertical = dock === "left" || dock === "right";
  const fieldClass = isVertical
    ? "w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
    : "rounded border border-slate-300 bg-white px-2 py-1 text-xs";

  return (
    <div
      role="toolbar"
      aria-label={`Annotation tools for page ${activePage}`}
      className={`pdf-shared-annotation-toolbar z-40 flex shrink-0 gap-2 border-slate-300 bg-white p-2 shadow-sm ${
        isVertical
          ? "w-28 flex-col overflow-y-auto border-x"
          : "flex-wrap items-center border-y"
      }`}
    >
      <span className="text-xs font-semibold text-slate-500">
        Page {activePage}
      </span>
      <div className={`flex gap-1 ${isVertical ? "flex-col" : "flex-wrap"}`}>
        {TOOLS.map((tool) => (
          <button
            key={tool.value}
            type="button"
            aria-label={tool.label}
            aria-pressed={state.tool === tool.value}
            title={tool.label}
            className={`rounded border px-2 py-1 text-xs ${
              state.tool === tool.value
                ? "border-sky-600 bg-sky-600 text-white"
                : "border-slate-300 hover:bg-slate-100"
            }`}
            onClick={() => onChange({ tool: tool.value })}
          >
            {tool.shortLabel}
          </button>
        ))}
      </div>

      <label
        className={`flex items-center gap-1 text-xs ${isVertical ? "justify-between" : ""}`}
      >
        Stroke
        <input
          type="color"
          value={state.strokeColor}
          onChange={(event) => onChange({ strokeColor: event.target.value })}
          className="h-7 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
        />
      </label>

      <label
        className={`flex items-center gap-1 text-xs ${isVertical ? "justify-between" : ""}`}
      >
        Fill
        <input
          type="color"
          value={
            state.backgroundColor === "transparent"
              ? "#ffffff"
              : state.backgroundColor
          }
          onChange={(event) =>
            onChange({ backgroundColor: event.target.value })
          }
          className="h-7 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
        />
      </label>
      <button
        type="button"
        aria-pressed={state.backgroundColor === "transparent"}
        className={`rounded border px-2 py-1 text-xs ${
          state.backgroundColor === "transparent"
            ? "border-sky-600 bg-sky-50 text-sky-700"
            : "border-slate-300"
        }`}
        onClick={() => onChange({ backgroundColor: "transparent" })}
      >
        No fill
      </button>

      <label className="text-xs">
        <span className="sr-only">Stroke width</span>
        <select
          className={fieldClass}
          value={state.strokeWidth}
          onChange={(event) =>
            onChange({
              strokeWidth: Number(event.target.value) as 1 | 2 | 4,
            })
          }
          title="Stroke width"
        >
          <option value={1}>Thin</option>
          <option value={2}>Medium</option>
          <option value={4}>Thick</option>
        </select>
      </label>

      <label className="text-xs">
        <span className="sr-only">Stroke style</span>
        <select
          className={fieldClass}
          value={state.strokeStyle}
          onChange={(event) =>
            onChange({
              strokeStyle: event.target
                .value as PdfAnnotationToolbarState["strokeStyle"],
            })
          }
          title="Stroke style"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>

      <label className="text-xs">
        <span className="sr-only">Fill style</span>
        <select
          className={fieldClass}
          value={state.fillStyle}
          onChange={(event) =>
            onChange({
              fillStyle: event.target
                .value as PdfAnnotationToolbarState["fillStyle"],
            })
          }
          title="Fill style"
        >
          <option value="hachure">Hachure fill</option>
          <option value="cross-hatch">Cross-hatch fill</option>
          <option value="solid">Solid fill</option>
        </select>
      </label>

      <label className="text-xs">
        <span className="sr-only">Edge style</span>
        <select
          className={fieldClass}
          value={state.roughness}
          onChange={(event) =>
            onChange({
              roughness: Number(event.target.value) as 0 | 1 | 2,
            })
          }
          title="Edge style"
        >
          <option value={0}>Sharp</option>
          <option value={1}>Drawn</option>
          <option value={2}>Rough</option>
        </select>
      </label>

      <div className={`flex gap-1 ${isVertical ? "flex-col" : ""}`}>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          onClick={onUndo}
          title={`Undo on page ${activePage}`}
        >
          Undo
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          onClick={onRedo}
          title={`Redo on page ${activePage}`}
        >
          Redo
        </button>
      </div>

      <label
        className={`flex items-center gap-1 text-xs ${isVertical ? "flex-col items-stretch" : ""}`}
      >
        Dock
        <select
          className={fieldClass}
          value={dock}
          onChange={(event) =>
            onDockChange(event.target.value as PdfToolbarDock)
          }
        >
          <option value="top">Top</option>
          <option value="right">Right</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
        </select>
      </label>
    </div>
  );
}
