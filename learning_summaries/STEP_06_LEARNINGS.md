# Step 06 Learnings - Notebook Editor Component

Step 06 moved the main editor area out of `NotebookApp.tsx` and into its own component. It also made the notebook title editable and added buttons for adding text and drawing cells.

## What Changed

Step 06 created:

- `components/notebook/NotebookEditor.tsx`

Step 06 updated:

- `components/notebook/NotebookApp.tsx`
- `lib/types.ts`
- `lib/utils.ts`

The app structure now looks like:

```text
NotebookApp
  owns notebook state
  owns sidebar state
  owns update/create/delete/add-cell functions
  renders NotebookSidebar
  renders NotebookEditor

NotebookSidebar
  controls notebook navigation actions

NotebookEditor
  displays the active notebook
  edits the active notebook title
  displays cells
  provides buttons to add cells
```

## Main Concept: Editor Component Extraction

Before Step 06, `NotebookApp.tsx` still contained the full main editor JSX.

Step 06 moved that editor section into:

```text
components/notebook/NotebookEditor.tsx
```

This keeps `NotebookApp` focused on state coordination and keeps `NotebookEditor` focused on rendering the active notebook.

The editor component receives its data through props:

```tsx
<NotebookEditor
  notebook={activeNotebook}
  onUpdateNotebook={updateNotebook}
  onAddTextCell={addTextCell}
  onAddDrawingCell={addDrawingCell}
/>
```

## Main Concept: State Still Belongs In `NotebookApp`

Even though the editor UI moved, notebook state stayed in `NotebookApp`.

That is correct because `NotebookApp` coordinates both:

- Sidebar behavior.
- Editor behavior.

The sidebar needs to know which notebook is active. The editor needs to display and update that active notebook.

So `NotebookApp` remains the shared parent and source of truth.

## Main Concept: Props For The Editor

`NotebookEditor` uses a props interface:

```ts
interface NotebookEditorProps {
  notebook: Notebook;
  onUpdateNotebook: (fields: NotebookUpdate) => void;
  onAddTextCell: () => void;
  onAddDrawingCell: () => void;
}
```

This means:

- `notebook` is the active notebook to display.
- `onUpdateNotebook` updates notebook fields.
- `onAddTextCell` adds a text cell.
- `onAddDrawingCell` adds a drawing cell.

The editor does not directly call `setNotebooks`. It calls callback props that were passed from `NotebookApp`.

## Main Concept: Controlled Title Input

The notebook title changed from display-only text to a controlled input.

Example:

```tsx
<input
  value={notebook.title}
  onChange={(event) => onUpdateNotebook({ title: event.target.value })}
/>
```

This means:

```text
The input displays notebook.title.
When the user types, call onUpdateNotebook with the new title.
```

The flow is:

```text
User types
-> input onChange runs
-> NotebookEditor calls onUpdateNotebook({ title: newValue })
-> NotebookApp updates notebook state
-> React re-renders
-> NotebookEditor receives the updated notebook prop
```

This is the same controlled-input pattern used for the sidebar search box.

## Main Concept: `NotebookUpdate`

Step 06 added this type:

```ts
export type NotebookUpdate = Partial<Pick<Notebook, "title" | "cells">>;
```

This type means:

```text
An update object may contain title, cells, or both.
It may not update id, createdAt, or updatedAt directly.
```

It is equivalent to:

```ts
{
  title?: string;
  cells?: NotebookCell[];
}
```

This keeps notebook updates focused and safer.

## Main Concept: `Pick`

`Pick<Notebook, "title" | "cells">` creates a smaller type from `Notebook`.

It means:

```text
Take only the title and cells fields from Notebook.
```

So:

```ts
Pick<Notebook, "title" | "cells">
```

becomes conceptually:

```ts
{
  title: string;
  cells: NotebookCell[];
}
```

## Main Concept: `Partial`

`Partial` makes all fields optional.

So:

```ts
Partial<Pick<Notebook, "title" | "cells">>
```

becomes:

```ts
{
  title?: string;
  cells?: NotebookCell[];
}
```

That allows:

```ts
updateNotebook({ title: "New title" });
```

and:

```ts
updateNotebook({ cells: nextCells });
```

without requiring both fields every time.

## Main Concept: `updateNotebook`

`updateNotebook` lives in `NotebookApp` because it updates React state.

Its job is:

```text
Find the active notebook.
Apply the requested fields.
Leave all other notebooks unchanged.
```

Conceptually:

```tsx
function updateNotebook(fields: NotebookUpdate) {
  setNotebooks((currentNotebooks) =>
    currentNotebooks.map((notebook) =>
      notebook.id === activeNotebookId
        ? applyNotebookUpdate(notebook, fields)
        : notebook
    )
  );
}
```

This uses `.map()` to create a new notebooks array.

Only the active notebook is changed.

## Main Concept: Pure Helper For Applying Updates

The timestamp update was moved into a utility helper:

```ts
export function applyNotebookUpdate(
  notebook: Notebook,
  fields: NotebookUpdate
): Notebook {
  return {
    ...notebook,
    ...fields,
    updatedAt: Date.now(),
  };
}
```

This helper belongs in `lib/utils.ts` because it is data transformation logic.

It does not render UI and does not call React state setters.

## Main Concept: Why `Date.now()` Was Moved

Calling `Date.now()` directly in component render logic can trigger React lint warnings because it is impure.

`Date.now()` is impure because it can return a different value every time it is called.

Moving timestamp behavior into a helper keeps `NotebookApp` focused on state flow:

```text
Find notebook.
Apply update helper.
Return next state.
```

The helper owns the timestamp detail.

## Main Concept: Adding Text And Drawing Cells

Step 06 added two functions in `NotebookApp`:

```tsx
function addTextCell() {
  updateNotebook({
    cells: [...activeNotebook.cells, createTextCell()],
  });
}
```

and:

```tsx
function addDrawingCell() {
  updateNotebook({
    cells: [...activeNotebook.cells, createDrawingCell()],
  });
}
```

These functions:

- Create a new cell.
- Create a new cells array.
- Ask `updateNotebook` to update the active notebook.

The editor only renders buttons that call these functions through props.

## Main Concept: Spread Syntax For Arrays

This line:

```tsx
cells: [...activeNotebook.cells, createTextCell()]
```

means:

```text
Create a new array.
Copy every existing cell into it.
Add one new text cell at the end.
```

This avoids mutating the original cells array.

Avoid:

```tsx
activeNotebook.cells.push(createTextCell());
```

React state should be updated immutably.

## Main Concept: Spread Syntax For Objects

This line:

```ts
{ ...notebook, ...fields, updatedAt: Date.now() }
```

means:

```text
Create a new object.
Copy the old notebook fields.
Copy the update fields over them.
Set updatedAt to the current timestamp.
```

Order matters.

Fields on the right overwrite fields copied earlier.

## Main Concept: Editor Buttons Call Parent Callbacks

The add-cell buttons live in `NotebookEditor`:

```tsx
<button type="button" onClick={onAddTextCell}>
  Add text cell
</button>

<button type="button" onClick={onAddDrawingCell}>
  Add drawing cell
</button>
```

But the actual state update happens in `NotebookApp`.

This keeps responsibilities clear:

```text
NotebookEditor displays controls.
NotebookApp changes state.
```

## What Was Verified

Step 06 was checked with:

```bash
pnpm lint
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

## Small Cleanup Note

`NotebookSidebar.tsx` still had an old encoded delete-symbol comment:

```tsx
x{/* ... */}
```

The app works, but the comment can be removed to keep the file clean.

## What Step 06 Did Not Do

Step 06 did not add:

- Editable text cell content.
- Real drawing canvas behavior.
- Cell delete buttons.
- Cell duplicate buttons.
- Cell move up/down buttons.
- A dedicated `CellList` component.
- A dedicated `CellFrame` component.
- localStorage persistence.

Those are later steps.

## Mental Model To Keep

Step 06 introduced another parent-child pattern:

```text
NotebookApp owns state.
NotebookEditor receives the active notebook.
NotebookEditor renders input and buttons.
NotebookEditor calls callback props.
NotebookApp updates notebook state.
React re-renders the editor with updated props.
```

The editor is now becoming a real component, but the state is still centralized in `NotebookApp`.

## Key Takeaways

- Moving UI into a component improves file organization.
- State should stay in the shared parent when multiple components depend on it.
- Controlled inputs use `value` and `onChange`.
- `NotebookUpdate` keeps update objects narrow and safer.
- `Partial` makes selected fields optional.
- `Pick` selects specific fields from a larger type.
- `updateNotebook` updates only the active notebook.
- Utility helpers are good places for reusable data transformation logic.
- Array and object spread help update React state immutably.
- Add-cell buttons belong in the editor, but the state update belongs in `NotebookApp`.
