# Notebook-Style Note Taking App Build Steps

This roadmap is for building `note-taking-app`, a fresh Next.js app, using `../notely-nextjs` only as a reference for ideas. The target app should feel similar to Notely, but a notebook contains ordered cells like a Jupyter notebook. Each cell can be text or drawing.

The target project currently uses:

- Next.js 16 with the App Router
- React 19
- TypeScript
- Tailwind CSS 4
- pnpm

## How To Use This File

For each stage, prompt the assistant with the step heading. Example:

```text
Implement Step 04 from APP_BUILD_STEPS.md. I am new to Next.js, so explain the concepts before writing code. Keep the edit scoped to that step.
```

Recommended working rules for future prompts:

- Ask for one step at a time.
- Ask for a concept explanation before code.
- Ask the assistant to show which files it will edit before it edits them.
- Run `pnpm lint` after meaningful code changes.
- Keep `../notely-nextjs` as a reference only. Do not copy it blindly.

## Product Shape

The app will have:

- A left sidebar with notebooks, search, create, rename, and delete.
- A main notebook editor with a title and an ordered list of cells.
- Text cells for typed notes.
- Drawing cells with a canvas, pen, eraser, colors, brush size, and clear.
- Cell actions: add text cell, add drawing cell, delete cell, duplicate cell, move up, move down.
- Local browser persistence first, probably `localStorage`.
- Optional future storage with a database after the local version works.

## Core Data Model

Use a cell-based model instead of the old app's one-note-one-editor model.

Example TypeScript shapes:

```ts
type CellType = "text" | "drawing";

interface Notebook {
  id: string;
  title: string;
  cells: NotebookCell[];
  createdAt: number;
  updatedAt: number;
}

type NotebookCell = TextCell | DrawingCell;

interface BaseCell {
  id: string;
  type: CellType;
  createdAt: number;
  updatedAt: number;
}

interface TextCell extends BaseCell {
  type: "text";
  content: string;
}

interface DrawingCell extends BaseCell {
  type: "drawing";
  drawing: string | null;
}
```

Reasoning:

- The `Notebook` owns cell order by storing cells in an array.
- Each cell has its own data, so editing one cell does not require switching the whole note between text and draw mode.
- Drawing data can start as a base64 PNG data URL, like the reference app.

## Suggested File Structure

Create this gradually. Do not create every file in the first step.

```text
app/
  page.tsx
  layout.tsx
  globals.css
components/
  notebook/
    NotebookApp.tsx
    NotebookSidebar.tsx
    NotebookEditor.tsx
    CellList.tsx
    CellFrame.tsx
    TextCellEditor.tsx
    DrawingCellEditor.tsx
    NotebookToolbar.tsx
lib/
  notebook-types.ts
  notebook-utils.ts
  notebook-storage.ts
```

## Step 01 - Confirm The Starting Point

Goal: understand the empty app before changing it.

Tasks:

- Read `package.json`, `app/page.tsx`, `app/layout.tsx`, and `app/globals.css`.
- Confirm whether Tailwind CSS is already configured.
- Run the dev server with `pnpm dev`.
- Open the app in the browser and note what the starter page looks like.

Learning focus:

- What `app/page.tsx` controls.
- What `app/layout.tsx` controls.
- The difference between a Server Component and a Client Component.

Expected result:

- No feature code yet.
- A short explanation of the existing scaffold.

## Step 02 - Replace The Starter Page With A Static App Shell

Goal: make the app look like a note-taking workspace without adding state yet.

Tasks:

- Replace the starter homepage with a static layout.
- Add a left sidebar area.
- Add a main editor area.
- Add placeholder notebook title text.
- Add two or three fake static cells.

Learning focus:

- Next.js route files.
- JSX layout.
- CSS classes with Tailwind.

Files likely changed:

- `app/page.tsx`
- `app/globals.css`

Example structure:

```tsx
export default function Home() {
  return (
    <main>
      <aside>{/* notebook list placeholder */}</aside>
      <section>{/* notebook editor placeholder */}</section>
    </main>
  );
}
```

Expected result:

- The app has the rough visual structure.
- Nothing is editable yet.

## Step 03 - Add Notebook Types And Utilities

Goal: define the shape of notebooks and cells before adding React state.

Tasks:

- Create `lib/notebook-types.ts`.
- Create `lib/notebook-utils.ts`.
- Add a simple ID helper.
- Add date formatting and word count helpers.
- Add a function that creates a default notebook.

Learning focus:

- TypeScript interfaces.
- Union types.
- Keeping non-React logic in `lib`.

Files likely created:

- `lib/notebook-types.ts`
- `lib/notebook-utils.ts`

Example utility:

```ts
export function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
```

Expected result:

- Types compile.
- No UI behavior changes yet.

## Step 04 - Create A Client-Side Notebook App Component

Goal: introduce React state in one root Client Component.

Tasks:

- Create `components/notebook/NotebookApp.tsx`.
- Mark it with `"use client"` at the top.
- Store notebooks in `useState`.
- Store the active notebook ID in `useState`.
- Render the same static-ish UI from state.
- Import and render `NotebookApp` from `app/page.tsx`.

Learning focus:

- Why interactive components need `"use client"`.
- `useState`.
- Passing data down as props.
- Updating state immutably.

Files likely changed:

- `app/page.tsx`
- `components/notebook/NotebookApp.tsx`

Example state:

```tsx
const [notebooks, setNotebooks] = useState<Notebook[]>([
  createDefaultNotebook(),
]);
const [activeNotebookId, setActiveNotebookId] = useState(notebooks[0].id);
```

Expected result:

- The page is still simple, but the data now comes from React state.

## Step 05 - Build The Sidebar Component

Goal: move notebook list UI into its own component.

Tasks:

- Create `NotebookSidebar`.
- Show all notebooks.
- Highlight the active notebook.
- Add a search input.
- Add a New Notebook button.
- Add delete buttons, but use a browser `confirm` for now.

Learning focus:

- Component props.
- Callback props.
- Derived values such as filtered notebooks.
- Why child components should not mutate parent state directly.

Files likely created or changed:

- `components/notebook/NotebookSidebar.tsx`
- `components/notebook/NotebookApp.tsx`

Expected result:

- You can create, select, search, and delete notebooks.

## Step 06 - Build The Notebook Editor Component

Goal: move the main editing area into its own component.

Tasks:

- Create `NotebookEditor`.
- Show an editable notebook title.
- Show the notebook's cells.
- Add buttons for adding text and drawing cells.

Learning focus:

- Controlled inputs.
- Partial update functions.
- Component boundaries.

Files likely created or changed:

- `components/notebook/NotebookEditor.tsx`
- `components/notebook/NotebookApp.tsx`

Example controlled title:

```tsx
<input
  value={notebook.title}
  onChange={(event) => onUpdateNotebook({ title: event.target.value })}
/>
```

Expected result:

- You can rename the active notebook.
- You can add placeholder cells.

## Step 07 - Render Cells With A Cell List And Cell Frame

Goal: create reusable cell rendering before implementing the editors deeply.

Tasks:

- Create `CellList`.
- Create `CellFrame`.
- Render each cell based on its `type`.
- Put common cell UI in `CellFrame`: drag handle placeholder, type label, move buttons, duplicate button, delete button.

Learning focus:

- Rendering arrays with `.map`.
- Stable React keys.
- Conditional rendering.
- Keeping repeated layout in one component.

Files likely created or changed:

- `components/notebook/CellList.tsx`
- `components/notebook/CellFrame.tsx`
- `components/notebook/NotebookEditor.tsx`

Example conditional rendering:

```tsx
if (cell.type === "text") {
  return <TextCellEditor cell={cell} onChange={onChange} />;
}

return <DrawingCellEditor cell={cell} onChange={onChange} />;
```

Expected result:

- The notebook shows an ordered list of text and drawing cells.
- Cell action buttons can be wired one at a time.

## Step 08 - Implement Text Cells

Goal: make text cells editable.

Tasks:

- Create `TextCellEditor`.
- Use a controlled `<textarea>`.
- Update only the edited cell.
- Show small metadata such as word count or character count.

Learning focus:

- Controlled textarea.
- Updating one item inside an array.
- Avoiding direct mutation.

Files likely created or changed:

- `components/notebook/TextCellEditor.tsx`
- `components/notebook/NotebookApp.tsx`
- `lib/notebook-utils.ts`

Example array update:

```ts
const nextCells = notebook.cells.map((cell) =>
  cell.id === cellId ? { ...cell, content: nextContent } : cell
);
```

Expected result:

- Text cells can be edited independently.

## Step 09 - Implement Drawing Cells

Goal: make drawing cells work with an HTML canvas.

Tasks:

- Create `DrawingCellEditor`.
- Use a `<canvas>`.
- Add pen and eraser tools.
- Add color swatches.
- Add brush size control.
- Save the canvas as a PNG data URL after each stroke.
- Restore the saved drawing when the cell changes.

Learning focus:

- `useRef` for DOM access.
- `useEffect` for restoring canvas content.
- Mouse and touch events.
- Why canvas pixels are not normal React state.

Files likely created or changed:

- `components/notebook/DrawingCellEditor.tsx`
- `components/notebook/NotebookApp.tsx`

Example canvas save:

```ts
const dataUrl = canvas.toDataURL("image/png");
onChange(dataUrl);
```

Expected result:

- Drawing cells can be drawn on, cleared, and preserved while switching notebooks or cells.

## Step 10 - Add Cell Operations

Goal: make cells behave like notebook blocks.

Tasks:

- Add text cell below the current cell.
- Add drawing cell below the current cell.
- Delete a cell.
- Duplicate a cell.
- Move a cell up.
- Move a cell down.
- Keep at least one cell in a new notebook, or show a helpful empty state.

Learning focus:

- Array insertion.
- Array filtering.
- Reordering arrays.
- Small pure helper functions.

Files likely changed:

- `components/notebook/NotebookApp.tsx`
- `components/notebook/NotebookEditor.tsx`
- `components/notebook/CellFrame.tsx`
- `lib/notebook-utils.ts`

Example move helper:

```ts
function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
```

Expected result:

- The notebook now has useful cell management.

## Step 11 - Persist Notebooks In localStorage

Goal: keep notes after a page refresh.

Tasks:

- Create `lib/notebook-storage.ts`.
- Load notebooks from `localStorage` only in the browser.
- Save notebooks whenever they change.
- Handle invalid stored data gracefully.
- Keep the first version simple: no sync, no login, no database.

Learning focus:

- Browser-only APIs in Next.js.
- `useEffect`.
- Why localStorage cannot run in Server Components.
- JSON serialization and parsing.

Files likely created or changed:

- `lib/notebook-storage.ts`
- `components/notebook/NotebookApp.tsx`

Example guard:

```ts
if (typeof window === "undefined") {
  return [];
}
```

Expected result:

- Refreshing the browser keeps notebooks and cells.

## Step 12 - Improve Search

Goal: make search useful for notebooks and cells.

Tasks:

- Search notebook titles.
- Search text cell content.
- Show a small preview from the first matching text cell.
- Decide whether drawing cells should match by title only or by a label.

Learning focus:

- Derived state.
- Case-insensitive string matching.
- Why search results should be computed from current state, not stored separately.

Files likely changed:

- `components/notebook/NotebookApp.tsx`
- `components/notebook/NotebookSidebar.tsx`
- `lib/notebook-utils.ts`

Expected result:

- Sidebar search finds notebooks by title and text cell contents.

## Step 13 - Add Keyboard And Focus Behavior

Goal: make notebook editing smoother.

Tasks:

- Focus a new text cell after it is created.
- Add keyboard shortcuts only after buttons work.
- Possible shortcuts:
  - `Ctrl+Enter`: add text cell below.
  - `Ctrl+Shift+D`: add drawing cell below.
  - `Ctrl+Backspace`: delete current cell, with care.
- Avoid shortcuts while typing unless they are intentional.

Learning focus:

- Refs for focus.
- Keyboard events.
- Accessibility concerns.

Files likely changed:

- `TextCellEditor.tsx`
- `CellFrame.tsx`
- `NotebookApp.tsx`

Expected result:

- Creating and navigating cells feels less clumsy.

## Step 14 - Polish The UI With Tailwind

Goal: make the app coherent and comfortable to use.

Tasks:

- Replace rough placeholder styles.
- Use a restrained productivity-app layout.
- Keep the first screen as the actual app, not a landing page.
- Make the sidebar usable on narrow screens.
- Keep buttons and controls visually consistent.
- Use stable sizes for cell toolbars and canvas areas to avoid layout jumps.

Learning focus:

- Tailwind utility classes.
- Responsive layout.
- Visual hierarchy.
- Accessibility basics such as focus rings and button labels.

Files likely changed:

- `app/globals.css`
- All notebook components as needed

Expected result:

- The app looks like a focused notebook editor rather than a generated demo.

## Step 15 - Add Import And Export

Goal: give yourself a backup path before adding a database.

Tasks:

- Add Export JSON button.
- Add Import JSON button.
- Validate imported data enough to avoid crashing.
- Consider adding an exported file version number.

Learning focus:

- Downloading generated files in the browser.
- Reading uploaded files.
- Basic data validation.

Files likely changed:

- `NotebookToolbar.tsx`
- `notebook-storage.ts`
- `notebook-types.ts`

Example exported shape:

```ts
interface NotebookExport {
  version: 1;
  notebooks: Notebook[];
  exportedAt: number;
}
```

Expected result:

- You can back up and restore local notebooks.

## Step 16 - Add Quality Checks

Goal: keep the app maintainable as it grows.

Tasks:

- Run `pnpm lint`.
- Fix TypeScript and ESLint warnings.
- Add a few pure utility tests only if a test framework is installed later.
- Manually test create, edit, draw, move, delete, refresh, import, and export.

Learning focus:

- Why linting catches problems earlier than the browser.
- Separating pure helper logic from React makes testing easier.

Expected result:

- The app should be stable enough to use locally.

## Step 17 - Optional: Add Real Storage Later

Goal: move beyond localStorage only after the local app works.

Options:

- Browser IndexedDB for larger local storage.
- Supabase for auth and cloud sync.
- SQLite through a local backend if building a desktop-style app later.
- Vercel Postgres or another hosted database if deploying.

Do not start here. A local-only notebook app is the right first milestone.

## Step 18 - Optional: Add Rich Text Later

Goal: improve text cells without complicating the first version.

Options:

- Markdown preview.
- Rich text editor.
- Code blocks.
- Checklists.
- Images.

Suggested rule:

- Start with plain text cells.
- Add rich text only after the cell model, drawing cells, and persistence are working.

## Step 19 - Optional: Add Drag And Drop Later

Goal: reorder cells by dragging.

Options:

- Use buttons first.
- Later add a library such as `@dnd-kit`.

Suggested rule:

- Do not hand-roll complex drag-and-drop while learning Next.js.
- Add it after move up/down works reliably.

## Milestone Checklist

- [ ] Static shell visible.
- [ ] Notebook types created.
- [ ] Client state works.
- [ ] Sidebar creates, selects, searches, and deletes notebooks.
- [ ] Notebook title can be edited.
- [ ] Text cells can be added and edited.
- [ ] Drawing cells can be added and edited.
- [ ] Cells can be deleted, duplicated, and reordered.
- [ ] Data persists after refresh.
- [ ] UI is responsive enough for desktop and narrow screens.
- [ ] Import and export work.
- [ ] `pnpm lint` passes.

## Notes From The Reference App

Useful ideas from `../notely-nextjs`:

- A left sidebar plus right editor layout.
- Central state in a root Client Component.
- A `lib/types.ts` style file for shared TypeScript types.
- A `lib/utils.ts` style file for small helpers.
- Canvas drawing saved as a PNG data URL.

Things to improve in `note-taking-app`:

- Use notebook cells instead of a single text/draw mode per note.
- Use Tailwind rather than large inline style objects.
- Keep components smaller from the beginning.
- Preserve drawing and text per cell.
- Add persistence after the basic state model works.
