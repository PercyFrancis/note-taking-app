# Step 05 Learnings - Sidebar Component And Notebook Actions

Step 05 moved the sidebar UI out of `NotebookApp.tsx` and into its own component. It also added real notebook-level actions: select, search, create, and delete.

## What Changed

Step 05 created:

- `components/notebook/NotebookSidebar.tsx`

Step 05 updated:

- `components/notebook/NotebookApp.tsx`

`NotebookApp` still owns the state. `NotebookSidebar` receives data and callback functions through props.

That means the structure now looks like:

```text
NotebookApp
  owns notebook state
  owns search state
  owns create/delete/select functions
  renders NotebookSidebar
  renders the editor area

NotebookSidebar
  displays notebooks
  displays search input
  displays New Notebook button
  displays delete buttons
  calls parent callbacks when the user interacts
```

## Main Concept: Component Extraction

Before Step 05, `NotebookApp.tsx` contained both:

- State logic.
- Sidebar JSX.

Step 05 moved the sidebar JSX into `NotebookSidebar.tsx`.

This makes `NotebookApp.tsx` easier to read because it no longer directly contains every part of the UI.

The extracted component focuses on one job:

```text
Render and control the sidebar.
```

## Main Concept: State Ownership

Even though the sidebar moved into its own file, notebook state stayed in `NotebookApp`.

That is intentional.

`NotebookApp` owns:

```tsx
const [notebooks, setNotebooks] = useState<Notebook[]>(...);
const [activeNotebookId, setActiveNotebookId] = useState<string>(...);
const [searchQuery, setSearchQuery] = useState("");
```

The sidebar does not own this state.

This keeps `NotebookApp` as the source of truth for notebook data.

## Main Concept: Props

Props are values passed from a parent component to a child component.

`NotebookApp` passes data into `NotebookSidebar`:

```tsx
<NotebookSidebar
  notebooks={filteredNotebooks}
  activeNotebookId={activeNotebookId}
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  onSelectNotebook={setActiveNotebookId}
  onCreateNotebook={createNotebook}
  onDeleteNotebook={deleteNotebook}
/>
```

The sidebar receives those values through its props interface:

```ts
interface NotebookSidebarProps {
  notebooks: Notebook[];
  activeNotebookId: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: () => void;
  onDeleteNotebook: (id: string) => void;
}
```

This interface documents exactly what the sidebar needs.

## Main Concept: Callback Props

Some props are functions.

Those are callback props.

Example:

```tsx
onCreateNotebook={createNotebook}
```

This means:

```text
NotebookApp gives NotebookSidebar a function it can call when the user clicks New Notebook.
```

Inside the sidebar:

```tsx
<button type="button" onClick={onCreateNotebook}>
  + New Notebook
</button>
```

The sidebar does not know how notebook creation works internally. It only calls the callback.

That separation is important:

```text
Child component reports user intent.
Parent component updates state.
```

## Main Concept: Controlled Search Input

The search input uses:

```tsx
<input
  value={searchQuery}
  onChange={(event) => onSearchChange(event.target.value)}
/>
```

This is a controlled input.

The input value comes from React state:

```tsx
value={searchQuery}
```

When the user types, the new text is sent back to `NotebookApp`:

```tsx
onChange={(event) => onSearchChange(event.target.value)}
```

The flow is:

```text
User types
-> input onChange runs
-> sidebar calls onSearchChange(newText)
-> NotebookApp updates searchQuery
-> filteredNotebooks recalculates
-> sidebar receives the filtered notebook list
```

## Main Concept: Derived Filtered Data

`filteredNotebooks` should not be stored as separate state.

It is derived from:

- `notebooks`
- `searchQuery`

Example:

```tsx
const filteredNotebooks = notebooks.filter((notebook) =>
  notebook.title.toLowerCase().includes(searchQuery.toLowerCase())
);
```

This means:

```text
Show notebooks whose title contains the search text.
```

Using derived data avoids duplicating state.

## Main Concept: Creating A Notebook

The create function lives in `NotebookApp`:

```tsx
function createNotebook() {
  const notebook = createDefaultNotebook();

  setNotebooks((currentNotebooks) => [notebook, ...currentNotebooks]);
  setActiveNotebookId(notebook.id);
}
```

Concepts:

- `createDefaultNotebook()` creates a valid notebook object.
- `[notebook, ...currentNotebooks]` creates a new array with the new notebook first.
- `setActiveNotebookId(notebook.id)` selects the newly created notebook.

This uses an immutable state update. It creates a new array instead of mutating the old one.

## Main Concept: Deleting A Notebook

The delete function also lives in `NotebookApp`.

It first asks the user to confirm:

```tsx
const shouldDelete = window.confirm("Delete this notebook?");
```

If the user cancels, the function returns early:

```tsx
if (!shouldDelete) {
  return;
}
```

Then it filters out the deleted notebook:

```tsx
const remaining = currentNotebooks.filter(
  (notebook) => notebook.id !== id
);
```

Filtering creates a new array without the deleted notebook.

## Main Concept: Handling Edge Cases When Deleting

Deleting has edge cases.

Three cases matter:

- Deleting a notebook that is not active.
- Deleting the currently active notebook.
- Deleting the last remaining notebook.

If the active notebook is deleted, the app needs to select another notebook.

If the last notebook is deleted, the app should create a replacement notebook so the editor still has valid data to show.

This prevents the app from reaching an invalid state where `activeNotebook` is missing.

## Main Concept: Active Styling

The sidebar uses `activeNotebookId` to decide which row is active:

```tsx
const isActive = notebook.id === activeNotebookId;
```

Then it uses conditional classes:

```tsx
className={`flex items-center gap-2 rounded-md px-2 py-1 ${
  isActive ? "bg-slate-900" : "hover:bg-slate-100"
}`}
```

This means:

```text
If this notebook is active, use a dark background.
Otherwise, only show a light background on hover.
```

The UI is now driven by state.

## Main Concept: Two Buttons Per Notebook Row

Each notebook row has two actions:

- Select the notebook.
- Delete the notebook.

Do not put one button inside another button.

Instead, use a wrapper `div` with two sibling buttons:

```tsx
<div>
  <button type="button">Notebook title</button>
  <button type="button">Delete</button>
</div>
```

This keeps the HTML valid and makes the two actions clear.

## Main Concept: Accessibility Labels

The delete button can use an accessible label:

```tsx
aria-label={`Delete ${notebook.title}`}
```

This gives screen readers a clearer label than just:

```text
x
```

The visible button can be short, while the accessible label is descriptive.

## Main Concept: Avoiding Unused Imports

`NotebookSidebar` should not import things it does not use.

For example, it should not import:

```tsx
useState
createDefaultNotebook
```

if the sidebar does not call them.

Unused imports create lint warnings and make ownership less clear.

The sidebar does not create notebooks directly. It calls `onCreateNotebook`.

## What Was Verified

Step 05 was checked with:

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

The delete button displayed as an encoded character in one terminal readout:

```text
Ã—
```

For now, a plain ASCII `x` is safer:

```tsx
x
```

That avoids encoding issues while learning.

## What Step 05 Did Not Do

Step 05 did not add:

- Editable notebook titles.
- A separate notebook editor component.
- Editable text cells.
- Drawing canvas behavior.
- Cell add/delete/move operations.
- localStorage persistence.

Those are later steps.

## Mental Model To Keep

Step 05 introduced the parent-child component pattern:

```text
Parent owns state.
Parent passes data down.
Parent passes callback functions down.
Child renders UI.
Child calls callbacks when something happens.
Parent updates state.
React re-renders the UI.
```

This pattern will repeat throughout the app.

## Key Takeaways

- Extracting a component can make a growing file easier to understand.
- State should live in the closest shared parent that needs to coordinate behavior.
- Props pass data from parent to child.
- Callback props let child components request state changes.
- Controlled inputs use `value` and `onChange`.
- Search results should be derived from state, not stored separately.
- Notebook creation and deletion should happen in `NotebookApp`, not the sidebar.
- Delete logic needs to handle active and last-notebook edge cases.
- Active styling is driven by `activeNotebookId`.
- Sibling buttons are better than nested buttons for row actions.
