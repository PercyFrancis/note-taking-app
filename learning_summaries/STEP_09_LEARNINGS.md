# Step 09 Learnings - Drawing Cells

Step 09 made drawing cells interactive.

Before this step, drawing cells were only placeholder boxes. After this step, each drawing cell renders a real HTML canvas, supports mouse drawing, saves its drawing data, restores saved drawings, and includes basic drawing tools.

The main goal was to learn how canvas-based UI differs from normal React form UI.

## What Changed

Step 09 created or expanded:

- `components/notebook/DrawingCellEditor.tsx`

Step 09 updated:

- `components/notebook/CellFrame.tsx`
- `components/notebook/CellList.tsx`
- `components/notebook/NotebookEditor.tsx`
- `components/notebook/NotebookApp.tsx`
- `lib/utils.ts`

The drawing cell placeholder was replaced with:

```tsx
<DrawingCellEditor
  cell={cell}
  onChange={(drawing) => onUpdateDrawingCell(cell.id, drawing)}
/>
```

## Main Concept: Canvas Is Different From Textarea

Text cells use controlled inputs:

```tsx
<textarea value={cell.content} />
```

That works because a textarea has a normal text value that React can control.

A canvas does not work that way.

There is no useful pattern like:

```tsx
<canvas value={cell.drawing} />
```

Instead, the canvas owns its pixels while the user draws. React stores the saved drawing data after the canvas is converted to an image string.

The mental model is:

```text
React state stores the saved drawing string.
The browser canvas API controls the live pixels.
useRef connects React code to the real canvas element.
useEffect restores saved pixels back onto the canvas.
```

## Main Concept: `useRef`

Step 09 used `useRef` for values that need to persist between renders without causing re-renders.

The drawing editor uses refs like this:

```tsx
const canvasRef = useRef<HTMLCanvasElement | null>(null);
const isDrawingRef = useRef(false);
const lastPointRef = useRef<{ x: number; y: number } | null>(null);
```

Each ref has a different job:

```text
canvasRef:
  stores the real browser canvas element.

isDrawingRef:
  tracks whether the mouse is currently drawing.

lastPointRef:
  stores the previous mouse position so line segments can be connected.
```

Changing a ref does not re-render the component. That is useful for drawing because mouse movement can happen many times per second.

## Main Concept: Accessing The Canvas Context

The real drawing commands come from the canvas 2D context:

```ts
const canvas = canvasRef.current;
if (!canvas) return;

const context = canvas.getContext("2d");
if (!context) return;
```

The context provides methods such as:

```ts
context.beginPath();
context.moveTo(x1, y1);
context.lineTo(x2, y2);
context.stroke();
```

Those commands draw pixels directly onto the canvas.

## Main Concept: Mouse Drawing Flow

The canvas listens for mouse events:

```tsx
<canvas
  onMouseDown={startDrawing}
  onMouseMove={draw}
  onMouseUp={stopDrawing}
  onMouseLeave={stopDrawing}
/>
```

The event flow is:

```text
mouse down:
  start a stroke and remember the first point.

mouse move:
  if drawing is active, draw from the previous point to the current point.

mouse up:
  finish the stroke and save the canvas.

mouse leave:
  also finish the stroke and save the canvas.
```

This creates continuous lines by drawing many short line segments.

## Main Concept: Canvas Coordinate Conversion

The canvas has two sizes:

```text
Internal canvas size:
  width={900}, height={360}

Displayed CSS size:
  h-64 w-full
```

Mouse events report screen coordinates, not internal canvas coordinates.

The helper converts the mouse position into canvas coordinates:

```ts
function getCanvasPoint(event: React.MouseEvent<HTMLCanvasElement>) {
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}
```

This makes drawing line up with the pointer even when the canvas is stretched by CSS.

## Main Concept: Saving A Drawing

When a stroke ends, the canvas is converted to a PNG data URL:

```ts
const dataUrl = canvas.toDataURL("image/png");
onChange(dataUrl);
```

The data URL is a string that starts with something like:

```text
data:image/png;base64,...
```

That string is stored in the drawing cell:

```ts
drawing: string | null;
```

The value is:

```text
null
```

when the drawing is empty, or:

```text
a PNG data URL string
```

when the drawing has been saved.

## Main Concept: Updating One Drawing Cell

The drawing update flow mirrors the text cell update flow:

```text
DrawingCellEditor
  calls onChange(dataUrl)

CellFrame
  adds the cell id

CellList
  passes the callback down

NotebookEditor
  passes the callback down

NotebookApp
  updates the correct drawing cell
```

The parent update function maps over the active notebook's cells:

```tsx
cells: activeNotebook.cells.map((cell) =>
  cell.id === cellId && cell.type === "drawing"
    ? applyDrawingCellUpdate(cell, drawing)
    : cell,
)
```

This means:

```text
Find the matching drawing cell.
Return an updated copy.
Leave every other cell unchanged.
```

## Main Concept: `applyDrawingCellUpdate`

Step 09 added a helper similar to the text cell helper:

```ts
export function applyDrawingCellUpdate(
  cell: DrawingCell,
  drawing: string | null,
): DrawingCell {
  return {
    ...cell,
    drawing,
    updatedAt: Date.now(),
  };
}
```

Its job is:

```text
Take the old drawing cell.
Return a new drawing cell.
Keep the same id, type, and createdAt.
Replace drawing.
Refresh updatedAt.
```

This keeps notebook state updates immutable and predictable.

## Main Concept: Restoring A Drawing With `useEffect`

When a canvas first renders, it is blank.

If the drawing cell already has saved drawing data, the app must load that image and draw it onto the canvas.

That is done with `useEffect`:

```tsx
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);

  if (!cell.drawing) return;

  const image = new Image();

  image.onload = () => {
    context.globalCompositeOperation = "source-over";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  };

  image.src = cell.drawing;
}, [cell.drawing]);
```

This means:

```text
When the saved drawing changes:
  clear the canvas.
  if there is saved drawing data, load it as an image.
  draw that image onto the canvas.
```

The dependency array:

```tsx
[cell.drawing]
```

tells React to rerun the effect when this cell's saved drawing changes.

## Main Concept: Pen And Eraser

The pen uses normal drawing:

```ts
context.globalCompositeOperation = "source-over";
context.strokeStyle = color;
```

The eraser uses:

```ts
context.globalCompositeOperation = "destination-out";
```

This means:

```text
Instead of drawing a white line, remove pixels from the canvas.
```

That is better than using white as an eraser because it actually clears pixels.

One important fix was resetting the composite mode before restoring a saved image:

```ts
context.globalCompositeOperation = "source-over";
```

Without that, restoring an image after using the eraser could accidentally draw in eraser mode.

## Main Concept: Tool State

The drawing editor uses React state for visible tool choices:

```tsx
const [tool, setTool] = useState<"pen" | "eraser">("pen");
const [color, setColor] = useState("#0f172a");
const [brushSize, setBrushSize] = useState(4);
```

These are good uses of state because they affect the visible UI:

```text
Which tool button is active.
Which color is selected.
Which brush size is shown.
```

Refs are used for internal drawing mechanics. State is used for user-facing tool settings.

## Main Concept: Color Swatches And Color Picker

Step 09 added preset color buttons:

```ts
const colorOptions = [
  { name: "Black", value: "#0f172a" },
  { name: "Red", value: "#ef4444" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Yellow", value: "#eab308" },
];
```

Then the UI maps over the options:

```tsx
{colorOptions.map((option) => (
  <button
    key={option.value}
    type="button"
    onClick={() => {
      setColor(option.value);
      setTool("pen");
    }}
    style={{ backgroundColor: option.value }}
  />
))}
```

The custom color picker uses:

```tsx
<input
  type="color"
  value={color}
  onChange={(event) => {
    setColor(event.target.value);
    setTool("pen");
  }}
/>
```

Choosing a color also switches back to the pen:

```ts
setTool("pen");
```

That matches what users usually expect.

## Main Concept: Brush Size

The brush size is controlled by a range input:

```tsx
<input
  type="range"
  min={1}
  max={24}
  value={brushSize}
  onChange={(event) => setBrushSize(Number(event.target.value))}
/>
```

The value from an input event is a string, so it is converted to a number:

```ts
Number(event.target.value)
```

The drawing code then uses:

```ts
context.lineWidth = brushSize;
```

## Main Concept: Clear Drawing

The clear button clears the canvas and tells the parent that the saved drawing is now empty:

```ts
function clearDrawing() {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  onChange(null);
}
```

This updates both layers:

```text
Canvas pixels are cleared immediately.
React state is updated to drawing: null.
```

## Main Concept: Styling Tool Buttons

The drawing toolbar uses Tailwind classes for layout and interaction feedback:

```tsx
className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2"
```

The pen and eraser buttons use conditional styling:

```tsx
tool === "pen"
  ? "border-slate-900 bg-slate-900 text-white"
  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
```

This means:

```text
If the tool is active, show strong selected styling.
Otherwise, show normal button styling.
```

The color buttons use a selected ring:

```tsx
color === option.value && tool === "pen"
  ? "border-white ring-2 ring-slate-900 ring-offset-2"
  : "border-slate-300 hover:scale-105"
```

This gives the user visible feedback about the selected color.

## What Was Verified

Step 09 was checked with:

```bash
pnpm check
```

and:

```bash
pnpm exec tsc --noEmit
```

Both passed.

The app also responded successfully at:

```text
http://localhost:3000
```

## What Step 09 Did Not Do

Step 09 did not add:

- Touch or pointer event support for tablets and phones.
- Pressure-sensitive stylus support.
- Undo and redo.
- Shape tools.
- Text labels inside drawings.
- Persistence after page refresh.
- Cell move, duplicate, or delete behavior.

Those are later improvements.

## Mental Model To Keep

Step 09 introduced this data flow:

```text
User draws on canvas
  -> browser canvas API changes pixels
  -> stroke ends
  -> canvas is converted to a PNG data URL
  -> DrawingCellEditor calls onChange(dataUrl)
  -> NotebookApp updates the matching drawing cell
  -> useEffect can restore saved drawing data later
```

The most important distinction is:

```text
React does not manage every canvas pixel.
React manages the saved drawing data and tool UI.
The canvas API manages live drawing.
```

## Key Takeaways

- Canvas drawing is imperative, not controlled like a textarea.
- `useRef` gives access to the real canvas element.
- Refs are also useful for fast-changing internal values such as drawing state.
- `getContext("2d")` gives access to canvas drawing methods.
- Mouse coordinates must be converted into canvas coordinates.
- `toDataURL("image/png")` saves the canvas as a string.
- `useEffect` restores saved drawing data onto the canvas.
- `globalCompositeOperation = "destination-out"` can implement a real eraser.
- Tool settings such as pen, eraser, color, and brush size belong in React state.
- The drawing update flow mirrors the text cell update flow.
- Step 09 completed mouse-based editable drawing cells.
