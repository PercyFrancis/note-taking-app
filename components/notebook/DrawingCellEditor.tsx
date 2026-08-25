"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawingCell } from "@/lib/types";
import { smallDangerButtonClass } from "../ui/buttonStyles";

interface DrawingCellEditorProps {
  cell: DrawingCell;
  isTouchDrawingEnabled: boolean;
  onChange: (drawing: string | null) => void;
}

const colorOptions = [
  { name: "Black", value: "#0f172a" },
  { name: "Red", value: "#ef4444" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Yellow", value: "#eab308" },
];

interface CanvasPoint {
  x: number;
  y: number;
}

type ActivePointerMode = "drawing" | "scrolling";

export default function DrawingCellEditor({
  cell,
  isTouchDrawingEnabled,
  onChange,
}: DrawingCellEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerModeRef = useRef<ActivePointerMode | null>(null);
  const lastPointRef = useRef<CanvasPoint | null>(null);
  const lastScrollClientYRef = useRef<number | null>(null);
  const skipNextRestoreRef = useRef(false);
  const saveRequestIdRef = useRef(0);

  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#0f172a");
  const [brushSize, setBrushSize] = useState(4);
  const [isSaving, setIsSaving] = useState(false);

  const canvasWidth = 900;
  const canvasHeight = cell.heightPx;

  function canStartPointer(
    event: React.PointerEvent<HTMLCanvasElement>,
  ): boolean {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      activePointerIdRef.current !== null
    ) {
      return false;
    }

    return true;
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!canStartPointer(event)) return;

    event.preventDefault();

    const canvas = event.currentTarget;

    canvas.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;

    if (event.pointerType === "touch" && !isTouchDrawingEnabled) {
      activePointerModeRef.current = "scrolling";
      lastScrollClientYRef.current = event.clientY;
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      resetActivePointer(canvas, event.pointerId, true);
      return;
    }

    activePointerModeRef.current = "drawing";
    saveRequestIdRef.current += 1;

    const point = getCanvasPoint(event.nativeEvent, canvas);
    const strokeWidth = getStrokeWidth(event.nativeEvent);

    lastPointRef.current = point;
    configureContext(context, strokeWidth);

    context.beginPath();
    context.arc(point.x, point.y, strokeWidth / 2, 0, Math.PI * 2);
    context.fill();
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();

    if (activePointerModeRef.current === "scrolling") {
      scrollNotebookFromTouch(event);
      return;
    }

    if (activePointerModeRef.current !== "drawing") return;

    const canvas = event.currentTarget;

    const context = canvas.getContext("2d");
    if (!context) return;

    const coalescedEvents = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const samples =
      coalescedEvents.length > 0 ? coalescedEvents : [event.nativeEvent];

    for (const sample of samples) {
      const currentPoint = getCanvasPoint(sample, canvas);
      const lastPoint = lastPointRef.current;

      if (!lastPoint) {
        lastPointRef.current = currentPoint;
        continue;
      }

      configureContext(context, getStrokeWidth(sample));

      context.beginPath();
      context.moveTo(lastPoint.x, lastPoint.y);
      context.lineTo(currentPoint.x, currentPoint.y);
      context.stroke();

      lastPointRef.current = currentPoint;
    }
  }

  function scrollNotebookFromTouch(
    event: React.PointerEvent<HTMLCanvasElement>,
  ) {
    const lastClientY = lastScrollClientYRef.current;

    if (lastClientY === null) {
      lastScrollClientYRef.current = event.clientY;
      return;
    }

    const scrollContainer = event.currentTarget.closest<HTMLElement>(
      "[data-cell-scroll-container]",
    );

    if (scrollContainer) {
      scrollContainer.scrollTop += lastClientY - event.clientY;
    }

    lastScrollClientYRef.current = event.clientY;
  }

  function getCanvasPoint(event: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function getStrokeWidth(event: PointerEvent): number {
    if (event.pointerType !== "pen") {
      return brushSize;
    }

    const pressure = event.pressure > 0 ? event.pressure : 0.5;
    const pressureMultiplier = 0.35 + pressure * 1.3;

    return Math.max(0.5, brushSize * pressureMultiplier);
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    finishDrawing(event.currentTarget, event.pointerId, true);
  }

  function finishDrawing(
    canvas: HTMLCanvasElement,
    pointerId: number,
    shouldReleaseCapture: boolean,
  ) {
    const pointerMode = activePointerModeRef.current;
    resetActivePointer(canvas, pointerId, shouldReleaseCapture);

    if (pointerMode !== "drawing") {
      return;
    }

    saveDrawing(canvas);
  }

  function resetActivePointer(
    canvas: HTMLCanvasElement,
    pointerId: number,
    shouldReleaseCapture: boolean,
  ) {
    activePointerIdRef.current = null;
    activePointerModeRef.current = null;
    lastPointRef.current = null;
    lastScrollClientYRef.current = null;

    if (shouldReleaseCapture && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
  }

  function saveDrawing(canvas: HTMLCanvasElement) {
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setIsSaving(true);

    canvas.toBlob((blob) => {
      if (saveRequestIdRef.current !== requestId) {
        return;
      }

      if (!blob) {
        persistDrawing(canvas.toDataURL("image/png"), requestId);
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          persistDrawing(reader.result, requestId);
        }
      };
      reader.onerror = () => {
        if (saveRequestIdRef.current === requestId) {
          setIsSaving(false);
        }
      };
      reader.readAsDataURL(blob);
    }, "image/png");
  }

  function persistDrawing(dataUrl: string, requestId: number) {
    if (saveRequestIdRef.current !== requestId) {
      return;
    }

    skipNextRestoreRef.current = true;
    onChange(dataUrl);
    setIsSaving(false);
  }

  useEffect(() => {
    if (skipNextRestoreRef.current) {
      skipNextRestoreRef.current = false;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!cell.drawing) return;

    const image = new Image();

    image.onload = () => {
      context.globalCompositeOperation = "source-over";
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvasWidth, canvasHeight);
    };

    image.src = cell.drawing;
  }, [cell.drawing, canvasHeight]);

  function clearDrawing() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);

    saveRequestIdRef.current += 1;
    setIsSaving(false);
    skipNextRestoreRef.current = true;
    onChange(null);
  }

  function configureContext(
    context: CanvasRenderingContext2D,
    strokeWidth: number,
  ) {
    context.lineWidth = strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (tool === "eraser") {
      context.globalCompositeOperation = "destination-out";
    } else {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = color;
      context.fillStyle = color;
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
        <button
          type="button"
          onClick={() => setTool("pen")}
          aria-pressed={tool === "pen"}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
            tool === "pen"
              ? "border-slate-900 bg-slate-900 text-white outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          }`}
        >
          Pen
        </button>

        <button
          type="button"
          onClick={() => setTool("eraser")}
          aria-pressed={tool === "eraser"}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
            tool === "eraser"
              ? "border-slate-900 bg-slate-900 text-white outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          }`}
        >
          Eraser
        </button>

        <div className="flex items-center gap-1">
          {colorOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setColor(option.value);
                setTool("pen");
              }}
              aria-label={`Use ${option.name}`}
              title={option.name}
              className={`h-7 w-7 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 ${
                color === option.value && tool === "pen"
                  ? "border-white ring-2 ring-slate-900 ring-offset-2"
                  : "border-slate-300 hover:scale-105"
              }`}
              style={{ backgroundColor: option.value }}
            />
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
          Custom
          <input
            type="color"
            value={color}
            onChange={(event) => {
              setColor(event.target.value);
              setTool("pen");
            }}
            className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5 outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          />
        </label>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
          Size
          <input
            type="range"
            min={1}
            max={24}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            className="w-28 accent-slate-900 outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          />
          <span className="w-6 text-right text-slate-400">{brushSize}</span>
        </label>

        <button
          type="button"
          onClick={clearDrawing}
          className={smallDangerButtonClass}
        >
          Clear
        </button>
      </div>

      <canvas
        width={900}
        height={cell.heightPx}
        style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
        ref={canvasRef}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onLostPointerCapture={(event) => {
          if (activePointerIdRef.current === event.pointerId) {
            finishDrawing(event.currentTarget, event.pointerId, false);
          }
        }}
        className="block w-full touch-none rounded-md border border-slate-300 bg-white"
      />

      <p className="mt-2 text-xs text-slate-400">
        {isSaving
          ? "Saving drawing..."
          : cell.drawing
            ? "Drawing saved"
            : "Empty drawing"}{" "}
        | Pen pressure is automatic when supported.
      </p>
    </div>
  );
}
