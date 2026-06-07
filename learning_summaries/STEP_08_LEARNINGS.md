# Step 08 Learnings - Editable Text Cells

Step 08 made text cells editable.

Before this step, text cells were only displayed as static preview content. After this step, each text cell has its own editor, and typing in one text cell updates only that cell.

The main goal was to learn how controlled form inputs work in React and how to update one item inside an array without mutating state directly.

## What Changed

Step 08 created:

- `components/notebook/TextCellEditor.tsx`

Step 08 updated:

- `components/notebook/CellFrame.tsx`
- `components/notebook/CellList.tsx`
- `components/notebook/NotebookEditor.tsx`
- `components/notebook/NotebookApp.tsx`
- `lib/utils.ts`

The text cell rendering moved from this kind of static preview:

```tsx
<p>{cell.content || "Empty text cell"}</p>
```

to a real editor:

```tsx
<TextCellEditor
  cell={cell}
  onChange={(content) => onUpdateTextCell(cell.id, content)}
/>
```

## Main Concept: Controlled Textarea

A controlled textarea is a form field where React state controls the displayed value.

The important pieces are:

```tsx
<textarea
  value={cell.content}
  onChange={(event) => onChange(event.target.value)}
/>
```

This means:

```text
The textarea displays cell.content.
When the user types, onChange sends the new text upward.
React state updates.
The textarea re-renders with the new value.
```

The textarea does not keep its own independent source of truth. The value comes from the app's state.

## Main Concept: `event.target.value`

Inside an input or textarea `onChange` handler, React gives you an event object.

The new text is found here:

```tsx
event.target.value
```

Example:

```tsx
onChange={(event) => onChange(event.target.value)}
```

This means:

```text
When the textarea changes, read its current value and pass that value to the parent callback.
```

The child component does not decide how notebook state changes. It only reports the new text.

## Main Concept: Passing Updates Upward

The text update travels through several components:

```text
TextCellEditor
  User types into textarea.

CellFrame
  Knows which cell is being edited.

CellList
  Passes the update callback to each CellFrame.

NotebookEditor
  Passes the update callback into CellList.

NotebookApp
  Owns the notebooks state and performs the actual update.
```

This is a normal React pattern:

```text
State lives high enough to be shared.
Child components receive data as props.
Child components send events back up with callback props.
```

## Main Concept: Updating One Cell

The active notebook contains an array of cells.

To update one text cell, the app maps over the array:

```tsx
cells: activeNotebook.cells.map((cell) =>
  cell.id === cellId && cell.type === "text"
    ? applyTextCellUpdate(cell, content)
    : cell,
)
```

This means:

```text
Look at every cell.
If this is the matching text cell, return an updated copy.
Otherwise, return the original cell.
```

The result is a new cells array. React can then detect that state changed and re-render the UI.

## Main Concept: Avoiding Direct Mutation

This is not the right pattern:

```ts
cell.content = content;
```

That mutates an existing object.

React state should be updated by creating new objects and arrays:

```ts
return {
  ...cell,
  content,
  updatedAt: Date.now(),
};
```

The spread operator copies the old cell fields, and then specific fields are replaced.

This keeps the update predictable:

```text
Old cell object remains unchanged.
New cell object contains the edited content.
React receives a new array with the updated cell.
```

## Main Concept: `applyTextCellUpdate`

Step 08 added a helper for updating text cells:

```ts
export function applyTextCellUpdate(cell: TextCell, content: string): TextCell {
  return {
    ...cell,
    content,
    updatedAt: Date.now(),
  };
}
```

This helper keeps update logic out of the JSX component.

Its job is:

```text
Take an existing text cell.
Return a new text cell.
Preserve the old id, type, and createdAt.
Replace content.
Refresh updatedAt.
```

This is useful because cell update rules can grow later without cluttering the component.

## Main Concept: Discriminated Union Safety

The app checks both the cell ID and the cell type:

```tsx
cell.id === cellId && cell.type === "text"
```

The type check matters because only text cells have `content`.

The shared cell type is:

```ts
type NotebookCell = TextCell | DrawingCell;
```

Text cells have:

```ts
content: string;
```

Drawing cells do not.

By checking `cell.type === "text"`, TypeScript understands that `cell` is a `TextCell` in that branch.

## Main Concept: Word And Character Counts

The editor also shows small metadata:

```tsx
<span>{countWords(cell.content)} words</span>
<span>{cell.content.length} characters</span>
```

Character count is simple because strings have a `.length` property.

Word count uses a helper:

```ts
export function countWords(text: string): number {
  const clean = text.trim();
  if (clean === "") return 0;
  return clean.split(/\s+/).length;
}
```

This means:

```text
Trim whitespace from the beginning and end.
If nothing remains, there are zero words.
Otherwise, split the text wherever one or more whitespace characters appear.
Count the resulting pieces.
```

Using a helper keeps this logic reusable and easier to test later.

## Main Concept: Text Cells Are Independent

Each text cell has its own `id`.

When editing a cell, the app does not say:

```text
Update the first text cell.
Update the selected paragraph.
Update whatever cell is visible.
```

Instead, it says:

```text
Update the cell whose id matches this cellId.
```

That is why stable IDs from earlier steps are important. They let each cell be edited independently, even after cells are added, deleted, duplicated, or moved.

## Main Concept: Debouncing

Debouncing means waiting until the user stops typing for a short time before doing expensive work.

The important distinction is:

```text
Typing should update the UI immediately.
Saving to slower storage can happen after a short delay.
```

For Step 08, debouncing is not necessary because the app is only updating React state.

React state updates are the correct immediate behavior for a controlled textarea.

Debouncing becomes useful later when adding persistence:

```text
User types.
React state updates immediately.
localStorage, database, or API save happens after a delay.
```

The best future approach is usually:

```text
Do not debounce the textarea itself.
Debounce the save layer instead.
```

That keeps the editor responsive while avoiding too many storage writes.

## What Was Verified

Step 08 was checked with:

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

## What Step 08 Did Not Do

Step 08 did not add:

- Rich text editing.
- Markdown preview.
- Autosave to `localStorage`.
- Database persistence.
- Debounced persistence.
- Drawing canvas behavior.
- Working move, duplicate, or delete cell buttons.

Those are later steps.

## Mental Model To Keep

Step 08 introduced this data flow:

```text
User types in textarea
  -> TextCellEditor reads event.target.value
  -> CellFrame adds the cell id
  -> NotebookApp maps over cells
  -> matching text cell is replaced with an updated copy
  -> React re-renders the textarea with the new content
```

The most important idea is:

```text
The child editor reports what happened.
The parent that owns state decides how state changes.
```

## Key Takeaways

- A controlled textarea gets its displayed value from React state.
- `event.target.value` is the current text inside the textarea.
- Child components should use callback props to send changes upward.
- The root state owner should perform the actual notebook update.
- `.map()` is a common way to update one item inside an array.
- Direct mutation should be avoided when updating React state.
- The spread operator creates updated copies of objects.
- Type checks such as `cell.type === "text"` help TypeScript narrow union types.
- Word count and character count are derived values.
- Debouncing should wait until persistence is added.
- Step 08 completed plain editable text cells.
