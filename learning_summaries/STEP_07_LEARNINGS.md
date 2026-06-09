# Step 07 Learnings - Cell List And Cell Frame

Step 07 refactored cell rendering out of `NotebookEditor.tsx` and into two smaller components: `CellList` and `CellFrame`.

The goal was not to make cells fully editable yet. The goal was to create reusable cell-rendering structure before adding deeper text editing, drawing, and cell operations.

## What Changed

Step 07 created:

- `components/notebook/CellList.tsx`
- `components/notebook/CellFrame.tsx`

Step 07 updated:

- `components/notebook/NotebookEditor.tsx`

Before Step 07, `NotebookEditor` directly mapped over `notebook.cells`.

After Step 07, `NotebookEditor` delegates that job:

```tsx
<CellList cells={notebook.cells} />
```

## Main Concept: Component Responsibility

Each component now has a clearer job:

```text
NotebookEditor
  Displays notebook-level controls:
  title input, add text cell button, add drawing cell button.

CellList
  Receives an array of cells and renders one CellFrame per cell.

CellFrame
  Receives one cell and renders the shared cell wrapper, label, actions, and preview content.
```

This keeps `NotebookEditor` from knowing every detail about how cells are displayed.

## Main Concept: `CellList`

`CellList` receives an array of notebook cells:

```ts
interface CellListProps {
  cells: NotebookCell[];
}
```

Then it maps over them:

```tsx
{cells.map((cell) => (
  <CellFrame key={cell.id} cell={cell} />
))}
```

Its job is:

```text
Take the cells array.
Render one CellFrame for each cell.
```

`CellList` does not decide the details of how a single cell looks. It delegates that to `CellFrame`.

## Main Concept: Rendering Arrays With `.map()`

React uses `.map()` to turn arrays of data into arrays of JSX.

Example:

```tsx
cells.map((cell) => (
  <CellFrame key={cell.id} cell={cell} />
))
```

This means:

```text
For every cell in the cells array, create one CellFrame component.
```

If the notebook has three cells, React renders three `CellFrame` components.

## Main Concept: React Keys

Each rendered list item needs a stable key:

```tsx
key={cell.id}
```

React uses keys to understand which rendered component belongs to which data item.

This matters because cells will later be:

- Added.
- Deleted.
- Duplicated.
- Moved up.
- Moved down.

Using `cell.id` is better than using the array index because IDs stay tied to the cell even if the order changes.

## Main Concept: `CellFrame`

`CellFrame` receives one cell:

```ts
interface CellFrameProps {
  cell: NotebookCell;
}
```

Its job is to render the common frame around every cell:

- Outer `article`.
- Border and background.
- Cell type label.
- Placeholder action buttons.
- Cell preview content.

This shared frame is useful because text cells and drawing cells should feel like members of the same notebook system.

## Main Concept: Shared Cell UI

Every cell has common UI, regardless of whether it is text or drawing.

For example:

```tsx
<article className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
  ...
</article>
```

This shared wrapper gives every cell:

- Spacing.
- Border.
- White background.
- Rounded corners.
- Consistent layout.

Keeping that wrapper in `CellFrame` avoids duplicating it later in separate text and drawing components.

## Main Concept: Placeholder Action Buttons

Step 07 added placeholder buttons such as:

```text
Up
Down
Copy
Delete
```

They are disabled for now:

```tsx
<button type="button" disabled>
  Up
</button>
```

That is intentional.

The buttons show where future cell operations will live, but they do not need real behavior yet.

The real operations come later:

- Move up.
- Move down.
- Duplicate.
- Delete.

Those are part of Step 10.

## Main Concept: Conditional Rendering

`CellFrame` renders different content depending on the cell type.

```tsx
{cell.type === "text" ? (
  <p>{cell.content || "Empty text cell"}</p>
) : (
  <div className="h-48 rounded-md border border-dashed border-slate-300 bg-slate-50" />
)}
```

This means:

```text
If the cell is a text cell, render paragraph content.
Otherwise, render a drawing placeholder box.
```

This uses a ternary operator:

```ts
condition ? valueIfTrue : valueIfFalse
```

## Main Concept: Discriminated Unions In UI

The cell type comes from the TypeScript union:

```ts
export type NotebookCell = TextCell | DrawingCell;
```

Text cells have:

```ts
type: "text";
content: string;
```

Drawing cells have:

```ts
type: "drawing";
drawing: string | null;
```

When React checks:

```tsx
cell.type === "text"
```

TypeScript knows that `cell.content` is available in that branch.

This is the discriminated union pattern from earlier steps being used in real UI rendering.

## Main Concept: Placeholder Content

Text cells currently show:

```tsx
{cell.content || "Empty text cell"}
```

This means:

```text
Show the cell content if it has text.
Otherwise, show "Empty text cell".
```

Drawing cells currently show a dashed box, not a real canvas.

That is correct for Step 07. Text editing comes in Step 08, and real drawing comes in Step 09.

## What Was Verified

Step 07 was checked with:

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

## What Step 07 Did Not Do

Step 07 did not add:

- Editable text cell content.
- Real drawing canvas behavior.
- Working cell delete.
- Working cell duplicate.
- Working move up/down actions.
- Drag-and-drop.
- Cell-specific editor components.
- Persistence.

Those are later steps.

## Mental Model To Keep

Step 07 split cell rendering into layers:

```text
NotebookEditor
  notebook-level editor

CellList
  list-level rendering

CellFrame
  single-cell frame and preview
```

This is a common React pattern:

```text
Parent component owns broader context.
List component maps arrays.
Item component renders one item.
```

## Key Takeaways

- `NotebookEditor` should not directly contain all cell rendering details.
- `CellList` is responsible for rendering the cells array.
- `CellFrame` is responsible for rendering one cell.
- `.map()` turns data arrays into JSX lists.
- Stable `key` values help React track list items.
- Shared wrappers belong in reusable components.
- Conditional rendering lets text and drawing cells display differently.
- Disabled placeholder buttons can mark future UI without adding behavior too early.
- Step 07 prepares the app for editable text cells in Step 08.
