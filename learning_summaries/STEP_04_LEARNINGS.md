# Step 04 Learnings - Client-Side Notebook App State

Step 04 moved the app from static JSX to state-driven React UI. The visible page still looks similar to Step 02, but the data now comes from React state instead of hardcoded text.

## What Changed

The homepage was split into two responsibilities:

- `app/page.tsx` now renders the app component.
- `components/notebook/NotebookApp.tsx` owns the notebook UI and state.

`app/page.tsx` became small:

```tsx
import NotebookApp from "@/components/notebook/NotebookApp";

export default function Home() {
  return <NotebookApp />;
}
```

The notebook shell moved into `NotebookApp.tsx`, where it can use React state.

## Main Concept: Server Component And Client Component Boundary

In the Next.js App Router, files are Server Components by default.

`app/page.tsx` can stay a Server Component because it does not use browser-only React features. It only renders:

```tsx
<NotebookApp />
```

`NotebookApp.tsx` needs:

```tsx
"use client";
```

That directive must be at the top of the file.

It is needed because `NotebookApp` uses `useState`, and React state only works in Client Components.

## Main Concept: `useState`

`useState` lets a React component remember a value between renders.

Basic shape:

```tsx
const [value, setValue] = useState(initialValue);
```

For the notebook app:

```tsx
const [notebooks, setNotebooks] = useState<Notebook[]>(() => {
  const notebook = createDefaultNotebook();
  return [notebook];
});
```

This means:

- `notebooks` is the current array of notebooks.
- `setNotebooks` is the function that will update that array later.
- `useState<Notebook[]>` tells TypeScript this state must be an array of `Notebook` objects.

If the setter is not used yet, ESLint warns about it. For Step 04, that warning can be fixed by temporarily omitting the setter:

```tsx
const [notebooks] = useState<Notebook[]>(() => {
  const notebook = createDefaultNotebook();
  return [notebook];
});
```

The setter will become useful in later steps when creating, deleting, or editing notebooks.

## Main Concept: Lazy Initial State

This version passes a function to `useState`:

```tsx
useState<Notebook[]>(() => {
  const notebook = createDefaultNotebook();
  return [notebook];
});
```

That is called lazy initialization.

React calls this function only when the component first initializes its state.

This is useful because `createDefaultNotebook()` creates IDs and timestamps. You do not want to create unnecessary new notebook objects on every render.

## Main Concept: Active Notebook ID

The app needs to know which notebook is currently selected.

That can be stored as an ID:

```tsx
const [activeNotebookId, setActiveNotebookId] = useState<string>(() => {
  return notebooks[0].id;
});
```

This means:

- `activeNotebookId` stores the selected notebook's ID.
- `setActiveNotebookId` changes which notebook is selected.

Using an ID is better than storing the whole active notebook separately because the notebook already exists inside the `notebooks` array.

## Main Concept: Derived Data

The active notebook can be calculated from existing state:

```tsx
const activeNotebook =
  notebooks.find((notebook) => notebook.id === activeNotebookId) ?? notebooks[0];
```

This is called derived data.

The app stores:

- `notebooks`
- `activeNotebookId`

The app derives:

- `activeNotebook`

This avoids duplicating the same notebook data in multiple state variables.

## Main Concept: Rendering Lists With `.map()`

The sidebar no longer hardcodes notebook buttons.

Instead, it maps over the notebook array:

```tsx
{notebooks.map((notebook) => (
  <button key={notebook.id}>
    {notebook.title}
  </button>
))}
```

This means:

```text
For each notebook in the notebooks array, render one button.
```

The same pattern is used for notebook cells:

```tsx
{activeNotebook.cells.map((cell) => (
  <article key={cell.id}>
    ...
  </article>
))}
```

This means:

```text
For each cell in the active notebook, render one cell block.
```

This is one of the most common React patterns.

## Main Concept: React Keys

When rendering a list, each item needs a `key`:

```tsx
key={notebook.id}
```

or:

```tsx
key={cell.id}
```

React uses keys to track which rendered element belongs to which data item.

Stable IDs are better than array indexes because notebooks and cells will later be added, deleted, moved, and duplicated.

## Main Concept: Conditional Rendering

Cells can have different types.

The app chooses what to display based on `cell.type`:

```tsx
{cell.type === "text" ? "Text cell" : "Drawing cell"}
```

This uses a ternary operator:

```ts
condition ? valueIfTrue : valueIfFalse
```

For the cell body:

```tsx
{cell.type === "text" ? (
  <p>{cell.content || "Empty text cell"}</p>
) : (
  <div className="h-48 rounded-md border border-dashed border-slate-300 bg-slate-50" />
)}
```

This means:

- Text cells render paragraph content.
- Drawing cells render a placeholder drawing area.

## Main Concept: Discriminated Unions In React Rendering

Step 03 defined:

```ts
export type NotebookCell = TextCell | DrawingCell;
```

Each cell has a `type` field:

```ts
type: "text"
```

or:

```ts
type: "drawing"
```

In Step 04, React uses that field:

```tsx
cell.type === "text"
```

Inside the text branch, TypeScript knows the cell is a `TextCell`, so `cell.content` is valid.

Inside the drawing branch, TypeScript knows the cell is a `DrawingCell`.

This is why the cell model from Step 03 matters.

## Main Concept: Event Handlers

The sidebar can use a click handler to select a notebook:

```tsx
onClick={() => setActiveNotebookId(notebook.id)}
```

This means:

```text
When this button is clicked, set the active notebook ID to this notebook's ID.
```

Even if there is currently only one notebook, this prepares the app for multiple notebooks in Step 05.

## Main Concept: State Updates Should Be Immutable

Step 04 mostly reads state, but later steps will update it.

The important rule is:

```text
Do not mutate state directly.
```

Avoid:

```tsx
notebooks.push(newNotebook);
setNotebooks(notebooks);
```

Prefer:

```tsx
setNotebooks([...notebooks, newNotebook]);
```

This creates a new array. React can reliably notice that the state changed.

## What Was Verified

Step 04 was checked with:

```bash
pnpm exec tsc --noEmit
```

TypeScript passed.

The app was also checked with:

```bash
pnpm lint
```

Lint may warn if a state setter is created but not used yet, such as:

```text
setNotebooks is assigned a value but never used
```

That warning is not a logic failure, but it should be cleaned up by removing the unused setter until it is needed.

## What Step 04 Did Not Do

Step 04 did not add:

- Creating notebooks.
- Deleting notebooks.
- Searching notebooks.
- Editable notebook titles.
- Editable text cells.
- Real drawing canvas behavior.
- localStorage persistence.
- Separate sidebar or editor components.

Those are later steps.

## Mental Model To Keep

Step 02 asked:

```text
What should the app look like?
```

Step 03 asked:

```text
What should the app data look like?
```

Step 04 asked:

```text
Can the UI be rendered from real notebook data in React state?
```

The answer is now yes.

The app is still simple, but it has crossed an important boundary: the UI is no longer only hardcoded markup.

## Key Takeaways

- `app/page.tsx` can stay small and render the main app component.
- A component that uses `useState` must be a Client Component.
- `"use client"` belongs at the top of the Client Component file.
- `useState` stores data between renders.
- Lazy initial state avoids unnecessary object creation.
- Store IDs for selection, then derive the selected object from state.
- `.map()` renders arrays as JSX lists.
- React list items need stable `key` values.
- Conditional rendering lets different cell types show different UI.
- The Step 03 discriminated union makes Step 04 rendering safer.
- Unused state setters create lint warnings and should be removed until needed.
