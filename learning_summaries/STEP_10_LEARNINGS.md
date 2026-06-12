# Step 10 Learnings - Cell Operations

Step 10 made notebook cells behave like real notebook blocks.

Before this step, cells could be edited, but their order and existence were mostly fixed. After this step, cells can be added below other cells, deleted, duplicated, and moved up or down.

The main goal was to learn how ordered arrays work in React state and how to keep array operations immutable.

## What Changed

Step 10 updated:

- `lib/utils.ts`
- `components/notebook/NotebookApp.tsx`
- `components/notebook/NotebookEditor.tsx`
- `components/notebook/CellList.tsx`
- `components/notebook/CellFrame.tsx`

The main features added were:

- Add text cell below a specific cell.
- Add drawing cell below a specific cell.
- Delete a cell.
- Duplicate a cell.
- Move a cell up.
- Move a cell down.
- Keep the notebook from ending with zero cells.

## Main Concept: Cells Are An Ordered Array

The notebook stores cells like this:

```ts
cells: NotebookCell[];
```

That array is the source of truth for cell order.

This means:

```text
The first item in the array appears first in the notebook.
The second item appears second.
Moving a cell means changing its position in the array.
Deleting a cell means removing it from the array.
Adding a cell means inserting it into the array.
```

Step 10 was mostly about creating new versions of this array.

## Main Concept: Pure Helper Functions

The cell array helpers live in `lib/utils.ts`.

They are pure data helpers:

```text
Receive an array.
Return a new array.
Do not call React state setters.
Do not know about components.
```

This keeps array logic out of JSX components.

The main helpers added were:

```ts
insertCellAfter()
deleteCell()
duplicateCell()
moveItem()
moveCellUp()
moveCellDown()
```

The responsibility split is:

```text
lib/utils.ts:
  knows how cell arrays change.

NotebookApp.tsx:
  owns React state and calls the helpers.

CellFrame.tsx:
  owns the buttons users click.
```

## Main Concept: Insert Cell After

The insert helper finds a target cell and inserts a new cell after it:

```ts
export function insertCellAfter(
  cells: NotebookCell[],
  targetCellId: string,
  newCell: NotebookCell,
): NotebookCell[] {
  const targetIndex = cells.findIndex((cell) => cell.id === targetCellId);

  if (targetIndex === -1) {
    return [...cells, newCell];
  }

  return [
    ...cells.slice(0, targetIndex + 1),
    newCell,
    ...cells.slice(targetIndex + 1),
  ];
}
```

The helper uses:

```ts
findIndex()
```

to locate the target cell, and:

```ts
slice()
```

to copy sections of the array.

The important part is that it does not mutate the original `cells` array.

It returns a new array:

```text
cells before target
target cell
new cell
cells after target
```

## Main Concept: Delete Cell

Deleting a cell uses `filter()`:

```ts
export function deleteCell(
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] {
  return cells.filter((cell) => cell.id !== cellId);
}
```

This means:

```text
Keep every cell whose id does not match the deleted id.
```

`filter()` returns a new array, so it works well with React state.

## Main Concept: Duplicate Cell

Duplicating a cell means:

```text
Find the original cell.
Copy its data.
Give the copy a new id.
Give the copy new timestamps.
Insert the copy after the original.
```

The helper uses:

```ts
const copiedCell: NotebookCell = {
  ...targetCell,
  id: createId(),
  createdAt: now,
  updatedAt: now,
};
```

The spread operator copies the original cell's content:

```text
Text cell copy keeps its text.
Drawing cell copy keeps its drawing data.
Both copies keep the same height.
```

But the duplicate gets a new identity:

```text
new id
new createdAt
new updatedAt
```

That matters because React keys and cell operations depend on stable unique IDs.

## Main Concept: Generic Move Helper

Step 10 added a generic `moveItem` helper:

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

This helper is generic because it can move any item type:

```ts
moveItem<T>
```

For this app, it is used for notebook cells, but the helper itself is not cell-specific.

The important detail is:

```ts
const nextItems = [...items];
```

`splice()` mutates an array, but this code mutates the copied array, not the original array.

So the original React state remains untouched.

## Main Concept: Move Up And Move Down

Cell-specific helpers wrap the generic move helper:

```ts
export function moveCellUp(
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] {
  const index = cells.findIndex((cell) => cell.id === cellId);
  return moveItem(cells, index, index - 1);
}
```

and:

```ts
export function moveCellDown(
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] {
  const index = cells.findIndex((cell) => cell.id === cellId);
  return moveItem(cells, index, index + 1);
}
```

This means:

```text
Move up:
  move from current index to index - 1.

Move down:
  move from current index to index + 1.
```

If the cell is already first or already last, `moveItem()` safely returns the array unchanged.

## Main Concept: State Functions In `NotebookApp`

The helper functions do not update React state by themselves.

`NotebookApp.tsx` owns the real state update functions:

```ts
function addTextCellAfter(cellId: string) {
  updateNotebook({
    cells: insertCellAfter(activeNotebook.cells, cellId, createTextCell()),
  });
}
```

This function does three things:

```text
Create a new text cell.
Insert it after the target cell.
Save the new cells array into the active notebook.
```

The drawing version follows the same pattern:

```ts
function addDrawingCellAfter(cellId: string) {
  updateNotebook({
    cells: insertCellAfter(activeNotebook.cells, cellId, createDrawingCell()),
  });
}
```

This keeps the React state update in the component that owns the notebook state.

## Main Concept: Delete Last Cell Fallback

Step 10 needed to avoid a broken zero-cell notebook.

The deletion function handles that:

```ts
function removeCell(cellId: string) {
  const nextCells = deleteCell(activeNotebook.cells, cellId);

  updateNotebook({
    cells: nextCells.length > 0 ? nextCells : [createTextCell()],
  });
}
```

This means:

```text
Delete the requested cell.
If cells remain, use them.
If no cells remain, create one blank text cell.
```

This is a simple alternative to designing a full empty state.

## Main Concept: Prop Callback Flow

The operation functions live in `NotebookApp`, but the buttons live in `CellFrame`.

So callbacks are passed down:

```text
NotebookApp
  -> NotebookEditor
  -> CellList
  -> CellFrame
```

This is the same pattern used for text editing, drawing editing, and height updates.

The callbacks include:

```ts
onAddTextCellAfter
onAddDrawingCellAfter
onRemoveCell
onCopyCell
onMoveCellUp
onMoveCellDown
```

Each callback receives a `cellId`:

```ts
(cellId: string) => void
```

That lets `CellFrame` say:

```text
The user clicked a button for this specific cell.
```

Then `NotebookApp` decides how the notebook state changes.

## Main Concept: `CellFrame` Owns Cell Buttons

`CellFrame` is the shared wrapper for one cell, so it owns cell-level actions:

```text
Add text below.
Add drawing below.
Move up.
Move down.
Copy.
Delete.
Height.
```

The buttons call callbacks with the current cell ID:

```tsx
<button type="button" onClick={() => onAddTextCellAfter(cell.id)}>
  + Text
</button>
```

and:

```tsx
<button type="button" onClick={() => onRemoveCell(cell.id)}>
  Delete
</button>
```

`CellFrame` does not directly edit the notebook array. It only reports what the user requested.

## Main Concept: IDs Instead Of Indexes

Step 10 operations use:

```ts
cell.id
```

instead of relying on array indexes in the UI.

This matters because cells can now move, duplicate, and be deleted.

Indexes change when the array changes. IDs stay attached to the cell.

The mental model is:

```text
Use index for position.
Use id for identity.
```

## Main Concept: Safe No-Op Behavior

The move helpers safely do nothing when a move is invalid.

For example:

```text
Move first cell up:
  invalid target index.
  return original array.

Move last cell down:
  invalid target index.
  return original array.
```

This means the UI can call the move functions without crashing.

The buttons still appear clickable for invalid moves, but the behavior is safe.

Later, the UI can be improved by passing:

```text
cell index
cell count
```

into `CellFrame` so the first cell's Up button and last cell's Down button can be disabled visually.

## Main Concept: Immutable Array Updates

All Step 10 operations create new arrays.

Examples:

```ts
filter()
slice()
[...items]
```

These approaches avoid direct mutation of React state.

This is important because React notices changes through new references.

The safe pattern is:

```text
old array stays unchanged
new array represents the update
React receives the new array
React re-renders the UI
```

## What Was Verified

Step 10 was checked with:

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

## What Step 10 Did Not Do

Step 10 did not add:

- Drag-and-drop reordering.
- Keyboard shortcuts for moving cells.
- Disabled Up button for the first cell.
- Disabled Down button for the last cell.
- Confirmation before deleting a cell.
- Undo and redo.
- Persistence after refresh.

Those can be added later.

## Mental Model To Keep

Step 10 introduced this operation flow:

```text
User clicks a cell action button
  -> CellFrame calls a callback with cell.id
  -> NotebookApp calls a pure helper
  -> helper returns a new cells array
  -> NotebookApp updates the active notebook
  -> React re-renders the ordered cell list
```

The most important idea is:

```text
The notebook owns the cell order through the cells array.
Cell operations are array transformations.
React state should receive a new array, not a mutated old array.
```

## Key Takeaways

- Notebook cells behave like ordered blocks because they live in an array.
- Cell operation helpers belong in `lib/utils.ts`.
- React state update functions belong in `NotebookApp.tsx`.
- Buttons belong in `CellFrame`.
- Callback props connect the buttons to the state owner.
- `findIndex()` is useful when an operation depends on position.
- `filter()` is useful for deletion.
- `slice()` and spread syntax are useful for insertion.
- A copied cell needs a new ID.
- `splice()` is acceptable only when used on a copied array.
- IDs identify cells; indexes describe current positions.
- Deleting the last cell should not leave the editor in a broken state.
- Step 10 completed basic cell block operations.
