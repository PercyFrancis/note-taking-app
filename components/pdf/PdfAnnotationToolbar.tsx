"use client";

import {
  PEN_STROKE_WIDTHS,
  type PenPressureMode,
  type PenStrokeWidth,
} from "@/lib/excalidraw-pen";

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
  toolLocked: boolean;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "hachure" | "cross-hatch" | "solid";
  strokeWidth: PenStrokeWidth;
  pressureMode: PenPressureMode;
  strokeStyle: "solid" | "dashed" | "dotted";
  roughness: 0 | 1 | 2;
  opacity: number;
  roundness: "round" | "sharp";
  fontFamily: number;
  fontSize: number;
  textAlign: "left" | "center" | "right";
  startArrowhead: "arrow" | "bar" | "dot" | "triangle" | null;
  endArrowhead: "arrow" | "bar" | "dot" | "triangle" | null;
}

export const DEFAULT_PDF_ANNOTATION_TOOLBAR_STATE: PdfAnnotationToolbarState = {
  tool: "selection",
  toolLocked: false,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  pressureMode: "dynamic",
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  roundness: "round",
  fontFamily: 5,
  fontSize: 20,
  textAlign: "left",
  startArrowhead: null,
  endArrowhead: "arrow",
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

const COMPACT_TOOLS = new Set<PdfAnnotationTool>([
  "selection",
  "freedraw",
  "text",
  "eraser",
]);

export function PdfAnnotationToolbar({
  state,
  dock,
  activePage,
  isCompact,
  onChange,
  onCompactChange,
  onDockChange,
  onInsertImage,
  onOpenImageLibrary,
  onUndo,
  onRedo,
}: {
  state: PdfAnnotationToolbarState;
  dock: PdfToolbarDock;
  activePage: number;
  isCompact: boolean;
  onChange: (change: Partial<PdfAnnotationToolbarState>) => void;
  onCompactChange: (isCompact: boolean) => void;
  onDockChange: (dock: PdfToolbarDock) => void;
  onInsertImage: () => void;
  onOpenImageLibrary: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const isVertical = dock === "left" || dock === "right";
  const fieldClass = isVertical
    ? "w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
    : "rounded border border-slate-300 bg-white px-2 py-1 text-xs";
  const showTextControls = state.tool === "text" || state.tool === "selection";
  const showArrowControls =
    state.tool === "arrow" ||
    state.tool === "line" ||
    state.tool === "selection";
  const showRoundness = !["freedraw", "text", "eraser"].includes(state.tool);
  const canLockTool = state.tool !== "selection" && state.tool !== "eraser";

  if (isCompact) {
    return (
      <div
        role="toolbar"
        aria-label={`Compact annotation tools for page ${activePage}`}
        className={`pdf-shared-annotation-toolbar z-40 flex shrink-0 gap-1 border-slate-300 bg-white p-2 shadow-sm ${
          isVertical
            ? "w-20 flex-col overflow-y-auto border-x"
            : "items-center border-y"
        }`}
      >
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
          onClick={() => onCompactChange(false)}
          aria-label="Expand annotation toolbar"
          title="Show all annotation tools"
        >
          More
        </button>

        <div className={`flex gap-1 ${isVertical ? "flex-col" : ""}`}>
          {TOOLS.filter((tool) => COMPACT_TOOLS.has(tool.value)).map((tool) => (
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

        <label className="text-xs">
          <span className="sr-only">Pen size</span>
          <select
            className={fieldClass}
            value={state.strokeWidth}
            onChange={(event) =>
              onChange({
                strokeWidth: Number(event.target.value) as PenStrokeWidth,
              })
            }
            title="Pen size"
          >
            {PEN_STROKE_WIDTHS.map((width) => (
              <option key={width} value={width}>
                {width} px
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center text-xs">
          <span className="sr-only">Pen colour</span>
          <input
            type="color"
            value={state.strokeColor || "#1e1e1e"}
            onChange={(event) => onChange({ strokeColor: event.target.value })}
            className="h-7 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
            title="Pen colour"
          />
        </label>

        <div className={`flex gap-1 ${isVertical ? "flex-col" : ""}`}>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
            onClick={onUndo}
            title={`Undo on page ${activePage}`}
          >
            Undo
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
            onClick={onRedo}
            title={`Redo on page ${activePage}`}
          >
            Redo
          </button>
        </div>
      </div>
    );
  }

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
      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        onClick={() => onCompactChange(true)}
        aria-label="Collapse annotation toolbar"
        title="Show essential annotation tools only"
      >
        Compact
      </button>
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

      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        onClick={onInsertImage}
        title={`Upload an image to page ${activePage}`}
      >
        Upload image
      </button>
      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        onClick={onOpenImageLibrary}
        title={`Insert an existing library image into page ${activePage}`}
      >
        Image library
      </button>

      <label
        className={`flex items-center gap-1 text-xs ${isVertical ? "justify-between" : ""}`}
      >
        Stroke
        <input
          type="color"
          value={state.strokeColor || "#1e1e1e"}
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
              : state.backgroundColor || "#ffffff"
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
              strokeWidth: Number(event.target.value) as PenStrokeWidth,
            })
          }
          title="Stroke width"
        >
          {PEN_STROKE_WIDTHS.map((width) => (
            <option key={width} value={width}>
              {width} px
            </option>
          ))}
        </select>
      </label>

      {state.tool === "freedraw" && (
        <label className="text-xs">
          <span className="sr-only">Pen pressure behavior</span>
          <select
            className={fieldClass}
            value={state.pressureMode}
            onChange={(event) =>
              onChange({
                pressureMode: event.target.value as PenPressureMode,
              })
            }
            title="Pen pressure behavior"
          >
            <option value="dynamic">Dynamic pen</option>
            <option value="constant">Constant-width pen</option>
          </select>
        </label>
      )}

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

      <label
        className={`flex items-center gap-1 text-xs ${isVertical ? "flex-col items-stretch" : ""}`}
      >
        Opacity
        <input
          type="range"
          min={10}
          max={100}
          step={10}
          value={Number.isFinite(state.opacity) ? state.opacity : 100}
          onChange={(event) =>
            onChange({ opacity: Number(event.target.value) })
          }
          className={isVertical ? "w-full" : "w-20"}
        />
        <span className="tabular-nums">{state.opacity}%</span>
      </label>

      {showRoundness && (
        <label className="text-xs">
          <span className="sr-only">Shape edges</span>
          <select
            className={fieldClass}
            value={state.roundness}
            onChange={(event) =>
              onChange({
                roundness: event.target
                  .value as PdfAnnotationToolbarState["roundness"],
              })
            }
            title="Shape edges"
          >
            <option value="round">Rounded edges</option>
            <option value="sharp">Sharp edges</option>
          </select>
        </label>
      )}

      {showTextControls && (
        <>
          <label
            className={`flex items-center gap-1 text-xs ${isVertical ? "flex-col items-stretch" : ""}`}
          >
            Font
            <select
              className={fieldClass}
              value={state.fontFamily}
              onChange={(event) =>
                onChange({ fontFamily: Number(event.target.value) })
              }
              title="Font family"
            >
              <option value={5}>Excalifont</option>
              <option value={1}>Virgil</option>
              <option value={2}>Helvetica</option>
              <option value={3}>Cascadia</option>
              <option value={6}>Nunito</option>
              <option value={7}>Lilita One</option>
              <option value={8}>Comic Shanns</option>
              <option value={9}>Liberation Sans</option>
            </select>
          </label>
          <label
            className={`flex items-center gap-1 text-xs ${isVertical ? "flex-col items-stretch" : ""}`}
          >
            Size
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              value={Number.isFinite(state.fontSize) ? state.fontSize : 20}
              onChange={(event) =>
                onChange({
                  fontSize: Math.min(
                    200,
                    Math.max(1, Number(event.target.value)),
                  ),
                })
              }
              className={`${fieldClass} ${isVertical ? "" : "w-20"}`}
              title="Font size"
            />
          </label>
          <label
            className={`flex items-center gap-1 text-xs ${isVertical ? "flex-col items-stretch" : ""}`}
          >
            Align
            <select
              className={fieldClass}
              value={state.textAlign}
              onChange={(event) =>
                onChange({
                  textAlign: event.target
                    .value as PdfAnnotationToolbarState["textAlign"],
                })
              }
              title="Text alignment"
            >
              <option value="left">Align left</option>
              <option value="center">Align center</option>
              <option value="right">Align right</option>
            </select>
          </label>
        </>
      )}

      {showArrowControls && (
        <>
          <label className="text-xs">
            <span className="sr-only">Start arrowhead</span>
            <select
              className={fieldClass}
              value={state.startArrowhead ?? "none"}
              onChange={(event) =>
                onChange({
                  startArrowhead:
                    event.target.value === "none"
                      ? null
                      : (event.target
                          .value as PdfAnnotationToolbarState["startArrowhead"]),
                })
              }
              title="Start arrowhead"
            >
              <option value="none">No start head</option>
              <option value="arrow">Start arrow</option>
              <option value="triangle">Start triangle</option>
              <option value="dot">Start dot</option>
              <option value="bar">Start bar</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="sr-only">End arrowhead</span>
            <select
              className={fieldClass}
              value={state.endArrowhead ?? "none"}
              onChange={(event) =>
                onChange({
                  endArrowhead:
                    event.target.value === "none"
                      ? null
                      : (event.target
                          .value as PdfAnnotationToolbarState["endArrowhead"]),
                })
              }
              title="End arrowhead"
            >
              <option value="none">No end head</option>
              <option value="arrow">End arrow</option>
              <option value="triangle">End triangle</option>
              <option value="dot">End dot</option>
              <option value="bar">End bar</option>
            </select>
          </label>
        </>
      )}

      {canLockTool && (
        <button
          type="button"
          aria-pressed={state.toolLocked}
          className={`rounded border px-2 py-1 text-xs ${
            state.toolLocked
              ? "border-sky-600 bg-sky-50 text-sky-700"
              : "border-slate-300"
          }`}
          onClick={() => onChange({ toolLocked: !state.toolLocked })}
          title="Keep the selected tool active after drawing"
        >
          Keep tool
        </button>
      )}

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
