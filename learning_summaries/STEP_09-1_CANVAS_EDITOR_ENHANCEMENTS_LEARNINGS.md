# Step 09.1 Learnings - Canvas Editor Enhancements

After Step 09, the drawing editor was improved with several practical canvas features before moving on to Step 10.

These changes focused on making the canvas work better across devices, avoiding stretched drawings, supporting adjustable cell height, improving click behavior, and reducing flicker after saving strokes.

## What Changed

The post-Step-09 enhancements updated:

- `components/notebook/DrawingCellEditor.tsx`
- `components/notebook/TextCellEditor.tsx`
- `components/notebook/CellFrame.tsx`
- `components/notebook/CellList.tsx`
- `components/notebook/NotebookEditor.tsx`
- `components/notebook/NotebookApp.tsx`
- `lib/types.ts`
- `lib/utils.ts`

The main features added were:

- Pointer event support for mouse, touch, and stylus input.
- Dynamic canvas aspect ratio.
- Adjustable cell heights.
- A height slider in the shared cell frame.
- Single-click dot drawing.
- Reduced canvas flicker after a stroke.
- Image smoothing control during drawing restore.
- A Biome-compliant canvas restore effect.

## Main Concept: Pointer Events

The drawing editor originally used mouse events:

```tsx
onMouseDown
onMouseMove
onMouseUp
onMouseLeave
```

That works on desktop, but it does not cover phones, tablets, or stylus input well.

The editor was changed to pointer events:

```tsx
onPointerDown={startDrawing}
onPointerMove={draw}
onPointerUp={stopDrawing}
onPointerLeave={stopDrawing}
onPointerCancel={stopDrawing}
```

Pointer events work across:

```text
mouse
touch
stylus
```

This avoids maintaining separate mouse and touch event handlers.

## Main Concept: Pointer Capture

When drawing starts, the canvas captures the pointer:

```tsx
event.currentTarget.setPointerCapture(event.pointerId);
```

This means:

```text
Keep sending events for this pointer to the canvas,
even if the pointer moves slightly outside the canvas.
```

When drawing stops, the capture is released:

```tsx
if (event.currentTarget.hasPointerCapture(event.pointerId)) {
  event.currentTarget.releasePointerCapture(event.pointerId);
}
```

This makes drawing feel more reliable, especially on touchscreens and tablets.

## Main Concept: Ignoring Non-Primary Input

The drawing start function checks:

```tsx
if (!event.isPrimary || event.button !== 0) return;
```

This means:

```text
Only draw with the primary pointer.
Only draw with the main mouse button.
Ignore secondary fingers or non-primary mouse buttons.
```

This prevents accidental drawing from extra touches or alternate mouse actions.

## Main Concept: `touch-none`

The canvas uses:

```tsx
className="... touch-none ..."
```

This tells the browser:

```text
Do not treat touch gestures on this canvas as page scrolling,
pinching, or panning.
The app is handling the interaction.
```

Without `touch-none`, drawing on a phone or tablet can accidentally scroll the page instead of drawing.

## Main Concept: Canvas Stretching

Canvas has two separate sizes:

```text
Canvas attributes:
  width and height define the internal drawing surface.

CSS size:
  classes and style define how large the canvas appears on screen.
```

If those aspect ratios do not match, the browser stretches the drawing.

For example:

```tsx
width={900}
height={360}
className="h-64 w-full"
```

can stretch because `h-64 w-full` may not match the internal `900:360` ratio.

The fix was to keep the displayed aspect ratio aligned with the internal canvas ratio.

## Main Concept: Dynamic Canvas Aspect Ratio

The drawing editor now uses canvas size constants:

```tsx
const canvasWidth = 900;
const canvasHeight = cell.heightPx;
```

The canvas uses those values:

```tsx
<canvas
  width={canvasWidth}
  height={canvasHeight}
  style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
/>
```

This means:

```text
The internal canvas size and displayed canvas shape stay in sync.
```

That prevents horizontal or vertical stretching when the cell height changes.

## Main Concept: Adjustable Cell Height

Cells now have a shared height field:

```ts
export interface BaseCell {
  id: string;
  type: CellType;
  heightPx: number;
  createdAt: number;
  updatedAt: number;
}
```

Because `TextCell` and `DrawingCell` both extend `BaseCell`, both cell types now have:

```ts
heightPx: number;
```

This is better than storing height only inside a component because the height is now part of the notebook data model.

## Main Concept: Default Heights

Text cells and drawing cells have different default heights:

```ts
heightPx: 160
```

for text cells, and:

```ts
heightPx: 360
```

for drawing cells.

This matches the idea that drawing cells naturally need more vertical space than text cells.

## Main Concept: Updating Cell Height

The app added a helper:

```ts
export function applyCellHeightUpdate(
  cell: NotebookCell,
  heightPx: number,
): NotebookCell {
  return {
    ...cell,
    heightPx,
    updatedAt: Date.now(),
  };
}
```

Its job is:

```text
Take any notebook cell.
Return an updated copy.
Replace heightPx.
Refresh updatedAt.
```

This follows the same immutable update pattern used for text and drawing updates.

## Main Concept: Height Update Prop Flow

Height changes follow the same parent-owned state pattern as the other cell updates:

```text
CellFrame
  user changes height slider

NotebookApp
  updates the matching cell in the active notebook
```

The callback is passed through:

```text
NotebookApp
  -> NotebookEditor
  -> CellList
  -> CellFrame
```

The update function maps over cells:

```tsx
cells: activeNotebook.cells.map((cell) =>
  cell.id === cellId ? applyCellHeightUpdate(cell, heightPx) : cell,
)
```

This means:

```text
Only the matching cell gets a new height.
Every other cell is returned unchanged.
```

## Main Concept: Height Slider Placement

The height slider belongs in `CellFrame`.

That is because height is a shared cell-level setting, not something specific only to text cells or drawing cells.

The cell frame already owns shared cell UI:

```text
cell type label
future move/copy/delete buttons
shared cell controls
```

So placing the height slider there keeps the editors focused on editing content.

## Main Concept: Text Cell Height

Text cells use `heightPx` as an inline style:

```tsx
<textarea
  style={{ height: cell.heightPx }}
/>
```

This means:

```text
The shared cell height setting controls the textarea height.
```

One subtle point is that Tailwind min/max height classes can constrain the visible result:

```tsx
min-h-[clamp(8rem,25vh,18rem)] max-h-[60vh]
```

Those constraints are useful for responsive layout, but they can prevent the slider from exactly matching the visible textarea height.

The tradeoff is:

```text
Keep min/max classes:
  better responsive constraints.

Remove min/max classes:
  slider controls the height more exactly.
```

## Main Concept: Drawing Cell Height

Drawing cells use `heightPx` differently from text cells.

The canvas uses the height as part of its actual drawing surface:

```tsx
<canvas
  width={canvasWidth}
  height={canvasHeight}
/>
```

This matters because the canvas backing store is the real pixel surface.

Changing the canvas height changes the drawing surface. The saved drawing must be restored after that happens.

## Main Concept: Restore Effect And Height Changes

The canvas restore effect depends on:

```tsx
[cell.drawing, canvasHeight]
```

This means:

```text
Restore the saved drawing when the drawing data changes.
Also restore the saved drawing when the canvas height changes.
```

That is important because changing the canvas backing height can clear the canvas.

## Main Concept: Biome Hook Dependencies

Biome complained when the effect dependency array contained:

```tsx
[cell.drawing, cell.heightPx]
```

but the effect body did not directly reference `cell.heightPx`.

The fix was to create:

```tsx
const canvasHeight = cell.heightPx;
```

and then use `canvasHeight` inside the effect.

That made the dependency explicit:

```tsx
context.clearRect(0, 0, canvasWidth, canvasHeight);
context.drawImage(image, 0, 0, canvasWidth, canvasHeight);
```

Now Biome understands why the effect depends on `canvasHeight`.

## Main Concept: Image Smoothing

The restore logic uses:

```ts
context.imageSmoothingEnabled = false;
```

This affects image scaling during:

```ts
context.drawImage(...)
```

It tells the canvas:

```text
When drawing a saved image back onto the canvas,
do not blur/interpolate the image if it must be scaled.
```

It does not remove anti-aliasing from normal pen strokes:

```ts
context.stroke();
```

So the distinction is:

```text
imageSmoothingEnabled:
  affects drawImage scaling.

stroke anti-aliasing:
  still handled by the browser.
```

## Main Concept: Drawing A Dot On Click

Originally, the drawing editor only drew inside the move handler.

That meant this did not draw anything:

```text
press down
do not move
release
```

The fix was to draw an initial dot in `startDrawing`.

The dot is created with:

```ts
context.beginPath();
context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
context.fill();
```

This means:

```text
Draw a filled circle at the starting point.
Use half the brush size as the radius.
```

Now:

```text
click and release:
  draws a dot.

click and drag:
  draws a dot first, then line segments.
```

## Main Concept: `configureContext`

The drawing editor added a helper:

```ts
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
```

This centralizes the tool settings.

It is useful because both line drawing and dot drawing need the same configuration:

```text
brush size
rounded stroke ends
pen color
eraser mode
fill color for dots
```

Without this helper, the same setup code would be duplicated in multiple places.

## Main Concept: Reducing Flicker After A Stroke

The flicker came from this sequence:

```text
user draws on canvas
stopDrawing saves a PNG data URL
parent state updates
cell.drawing changes
useEffect clears the canvas
image reloads
image is drawn back
```

The canvas already looked correct immediately after the stroke, so clearing and redrawing it was unnecessary.

The fix was:

```tsx
const skipNextRestoreRef = useRef(false);
```

Before saving a stroke:

```tsx
skipNextRestoreRef.current = true;
onChange(dataUrl);
```

Then the restore effect starts with:

```tsx
if (skipNextRestoreRef.current) {
  skipNextRestoreRef.current = false;
  return;
}
```

This means:

```text
If the drawing change came from this same canvas,
skip the immediate restore because the pixels are already correct.
```

This reduces visible flicker after each stroke.

## Main Concept: Clear Drawing And Restore Skipping

Clearing the canvas also uses the skip flag:

```tsx
context.clearRect(0, 0, canvas.width, canvas.height);

skipNextRestoreRef.current = true;
onChange(null);
```

That means:

```text
Clear the visible canvas immediately.
Update React state to drawing: null.
Skip the next restore pass because the visible canvas is already cleared.
```

## What Was Verified

The changes were checked with:

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

## What This Did Not Do

These enhancements did not add:

- Drag handles for resizing cells.
- Undo and redo.
- Pressure-sensitive brush size.
- Multi-touch gestures.
- Pinch zoom inside the canvas.
- Persistence after page refresh.
- Cell move, duplicate, or delete behavior.

Those can be considered later.

## Mental Model To Keep

The improved drawing editor now has several layers:

```text
Pointer events:
  input from mouse, touch, and stylus.

Canvas refs:
  access to the real drawing surface and internal drawing state.

React state:
  visible tool choices and saved notebook data.

Cell data:
  content, drawing data, and height.

Effects:
  restore saved images when needed.
```

The most important idea is:

```text
Canvas pixels are not normal React-rendered UI.
React coordinates the data, tools, and lifecycle.
The canvas API handles live drawing.
```

## Key Takeaways

- Pointer events are better than separate mouse and touch handlers for this editor.
- `touch-none` is required so drawing does not turn into page scrolling on touch devices.
- Canvas internal size and displayed aspect ratio must match to avoid stretching.
- Adjustable cell height belongs in the shared cell data model.
- Shared cell controls belong in `CellFrame`.
- Resizing a canvas can clear pixels, so saved drawings must be restored after height changes.
- Biome hook dependency warnings should be fixed by making dependencies explicit, not by blindly removing them.
- `imageSmoothingEnabled = false` affects restored image scaling, not normal line anti-aliasing.
- Drawing a dot on pointer down fixes click-without-move behavior.
- Skipping the next restore after a local save reduces canvas flicker.
- The enhanced canvas editor is now more usable on desktop, phones, tablets, and stylus devices.
