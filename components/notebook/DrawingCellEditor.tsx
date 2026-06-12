"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawingCell } from "@/lib/types";
import { smallDangerButtonClass } from "../ui/buttonStyles";

interface DrawingCellEditorProps {
  cell: DrawingCell;
  onChange: (drawing: string | null) => void;
}

const colorOptions = [
  { name: "Black", value: "#0f172a" },
  { name: "Red", value: "#ef4444" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Yellow", value: "#eab308" },
];

export default function DrawingCellEditor({
  cell,
  onChange,
}: DrawingCellEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const skipNextRestoreRef = useRef(false);

  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#0f172a");
  const [brushSize, setBrushSize] = useState(4);

  const canvasWidth = 900;
  const canvasHeight = cell.heightPx;

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary || event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    const point = getCanvasPoint(event);

    isDrawingRef.current = true;
    lastPointRef.current = point;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    configureContext(context);

    context.beginPath();
    context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const currentPoint = getCanvasPoint(event);
    const lastPoint = lastPointRef.current;

    if (!lastPoint) return;

    context.lineWidth = brushSize;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (tool === "eraser") {
      context.globalCompositeOperation = "destination-out";
    } else {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = color;
    }

    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(currentPoint.x, currentPoint.y);
    context.stroke();

    lastPointRef.current = currentPoint;
  }

  function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");

    skipNextRestoreRef.current = true;
    onChange(dataUrl);
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

    skipNextRestoreRef.current = true;
    onChange(null);
  }

  function configureContext(context: CanvasRenderingContext2D) {
    context.lineWidth = brushSize;
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
        onPointerLeave={stopDrawing}
        onPointerCancel={stopDrawing}
        className="block w-full touch-none rounded-md border border-slate-300 bg-white"
      />

      <p className="mt-2 text-xs text-slate-400">
        {cell.drawing ? "Drawing saved" : "Empty drawing"}
      </p>
    </div>
  );
}
