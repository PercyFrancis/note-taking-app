# Step 19 Learnings - Drag And Drop Reordering

Step 19 added drag-and-drop reordering for notebook cells.

Before this step, cells could be reordered with the `Up` and `Down` buttons from Step 10. After this step, cells can also be reordered by dragging a handle.

The main goal was to learn how drag-and-drop connects to the same ordered `cells` array that already powers button-based reordering.

## What Changed

Step 19 updated:

- `package.json`
- `pnpm-lock.yaml`
- `components/notebook/NotebookApp.tsx`
- `components/notebook/NotebookEditor.tsx`
- `components/notebook/CellList.tsx`
- `components/notebook/CellFrame.tsx`

The main features added were:

- Installed `@dnd-kit/react`.
- Added a drag-and-drop provider around the cell list.
- Made each cell frame sortable.
- Added a drag handle to each cell.
- Reused the existing `moveItem()` helper for reordering.
- Kept text editing, canvas drawing, sliders, and buttons separate from drag behavior.

## Main Concept: Drag-And-Drop Is Another Reorder UI

Step 10 already made this possible:

```text
Move cell up.
Move cell down.
```

Step 19 adds another way to do the same underlying operation:

```text
Drag cell from one position to another.
```

The data model does not need to change.

Cells are still stored as:

```ts
cells: NotebookCell[];
```

The array order is still the notebook order.

Drag-and-drop only changes where an item appears in that array.

## Main Concept: Use A Library

The roadmap recommended not hand-rolling complex drag-and-drop.

This step used:

```bash
@dnd-kit/react
```

That is better than manually handling all low-level pointer movement, collision detection, keyboard behavior, and reorder state.

The app already has enough custom pointer logic in the drawing canvas. Drag-and-drop is a good place to rely on a focused library.

## Main Concept: `moveItem()` Was Already Useful

Step 10 added:

```ts
export function moveItem<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);

  return nextItems;
}
```

Drag-and-drop needs the same operation:

```text
Move one item from one index to another index.
```

So Step 19 did not need a new data model.

It reused:

```ts
moveItem(activeNotebook.cells, fromIndex, toIndex)
```

This is an important pattern:

```text
Good pure helpers can support multiple UI features.
```

## Main Concept: Reorder State Lives In `NotebookApp`

The real notebook state still lives in `NotebookApp.tsx`.

So the reorder function belongs there:

```ts
function reorderCells(fromIndex: number, toIndex: number) {
  updateNotebook({
    cells: moveItem(activeNotebook.cells, fromIndex, toIndex),
  });
}
```

This means:

```text
CellList reports where a cell moved.
NotebookApp updates the active notebook.
```

`CellList` does not directly mutate notebook state.

## Main Concept: Callback Flow

The reorder callback flows down like this:

```text
NotebookApp
  owns reorderCells()

NotebookEditor
  receives onReorderCells

CellList
  receives onReorderCells and calls it after drag end
```

Unlike other cell operations, this callback does not need to go all the way into `CellFrame`.

That is because:

```text
CellList owns the drag provider.
CellList receives the final drag result.
CellList knows when to report a reorder.
```

## Main Concept: `CellList` Owns The Drag Provider

`CellList` is the right place for:

```tsx
<DragDropProvider>
  ...
</DragDropProvider>
```

because `CellList` already owns the list mapping:

```tsx
{cells.map((cell, index) => (
  <CellFrame key={cell.id} cell={cell} index={index} />
))}
```

The drag provider wraps the cell list so the sortable cells inside it can participate in the same drag-and-drop operation.

## Main Concept: `onDragEnd`

The list handles the final drag event:

```tsx
<DragDropProvider
  onDragEnd={(event) => {
    if (event.canceled) return;

    const { source } = event.operation;

    if (!isSortable(source)) return;

    const { initialIndex, index } = source;

    if (initialIndex === index) return;

    onReorderCells(initialIndex, index);
  }}
>
```

This means:

```text
If the drag was canceled, do nothing.
Get the thing that was dragged.
Make sure it was a sortable item.
Read where it started and where it ended.
If the position changed, report the reorder.
```

The important values are:

```text
initialIndex:
  where the cell started.

index:
  where the cell ended.
```

## Main Concept: Sortable Items Need `id` And `index`

Each `CellFrame` receives:

```ts
cell: NotebookCell;
index: number;
```

Then it calls:

```tsx
const { ref, handleRef, isDragging } = useSortable({
  id: cell.id,
  index,
});
```

This tells dnd kit:

```text
This sortable item represents this cell.
Its stable identity is cell.id.
Its current list position is index.
```

The distinction matters:

```text
id:
  identity of the cell.

index:
  current position of the cell.
```

Indexes change when cells move. IDs stay attached to the same cells.

## Main Concept: The `article` Ref

The outer cell wrapper is:

```tsx
<article ref={ref}>
```

The `article` element represents one full cell block.

Attaching `ref` tells dnd kit:

```text
This DOM element is the sortable item.
Measure this element.
Track this element.
Move this element in the sortable list.
```

The tag could technically be a `div`, but `article` is reasonable because each notebook cell is a self-contained block of content.

## Main Concept: Drag Handle

The drag handle uses:

```tsx
<button ref={handleRef} type="button">
  Drag
</button>
```

This tells dnd kit:

```text
Only this button starts dragging.
```

This is important because the cell contains many interactive controls:

```text
textarea
canvas
color picker
brush size slider
height slider
add/copy/delete buttons
```

If the whole cell started dragging, it would conflict with editing text, drawing on the canvas, and using controls.

The handle keeps drag behavior intentional.

## Main Concept: `isDragging`

`useSortable` also returns:

```tsx
isDragging
```

This is used for visual feedback:

```tsx
className={`mb-4 rounded-lg border border-slate-200 bg-white p-4 ${
  isDragging ? "opacity-60 shadow-lg" : ""
}`}
```

This means:

```text
If this cell is currently being dragged,
make it slightly transparent and add a stronger shadow.
```

That helps users see which cell is active during the drag operation.

## Main Concept: React Keys Still Matter

The cell list still uses:

```tsx
key={cell.id}
```

React keys and dnd kit IDs are related but not identical.

```text
React key:
  helps React track rendered list items.

dnd kit id:
  helps dnd kit track sortable items.
```

Using `cell.id` for both is correct because it is stable and unique.

## Main Concept: Drag-And-Drop Should Not Replace Buttons

The existing `Up` and `Down` buttons still have value.

They provide:

```text
a simple fallback
a clearer learning path
a non-drag way to reorder
```

Drag-and-drop is an enhancement, not a replacement for all other reorder controls.

## What Was Verified

Step 19 was checked with:

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

A production build was also checked:

```bash
pnpm build
```

The first build attempt failed because the sandbox blocked Google font fetching. After allowing network access, the production build passed.

## What Step 19 Did Not Do

Step 19 did not add:

- Custom drag animations.
- Drag overlays.
- Auto-scroll behavior tuning.
- Keyboard shortcut reordering.
- Disabled visual states for invalid Up/Down moves.
- Persistence after refresh.
- Drag-and-drop between different notebooks.

Those can be considered later.

## Mental Model To Keep

Step 19 introduced this flow:

```text
User drags a cell handle
  -> dnd kit tracks the sortable item
  -> drag ends
  -> CellList reads initialIndex and index
  -> CellList calls onReorderCells
  -> NotebookApp calls moveItem()
  -> active notebook gets a new cells array
  -> React re-renders the cells in the new order
```

The most important idea is:

```text
Drag-and-drop is just another way to produce a new ordered cells array.
```

## Key Takeaways

- The cell order still comes from `cells: NotebookCell[]`.
- Drag-and-drop does not require a new data model.
- `@dnd-kit/react` provides the drag-and-drop behavior.
- `CellList` owns the drag provider because it owns the list.
- `CellFrame` owns `useSortable` because it renders one sortable item.
- `id` identifies the cell; `index` identifies its current position.
- The sortable `ref` belongs on the outer cell wrapper.
- The drag `handleRef` belongs on a small drag handle button.
- The whole cell should not be draggable because cells contain interactive editors.
- `isDragging` gives useful visual feedback.
- Existing Step 10 reorder helpers can power Step 19.
- Step 19 completed drag-and-drop cell reordering.
