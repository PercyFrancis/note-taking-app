# Step 03 Learnings - Notebook Types And Utilities

Step 03 added the first non-UI code for the notebook app. The visible page did not change. The purpose was to define the app's data shapes and helper functions before adding React state.

## What Changed

Two files were added in `lib/`:

- `lib/notebook-types.ts`
- `lib/notebook-utils.ts`

`notebook-types.ts` defines the shape of notebooks and cells.

`notebook-utils.ts` defines small helper functions for creating IDs, formatting dates, counting words, and creating default notebook data.

## Main Concept: The `lib/` Folder

The `lib/` folder is a common place for non-React logic.

Good things to put in `lib/`:

- TypeScript types.
- Data creation helpers.
- Formatting helpers.
- Storage helpers.
- Pure utility functions.

React components should usually go somewhere like `components/`, not `lib/`.

Step 03 kept data logic separate from UI logic. This will make later components easier to read.

## Main Concept: TypeScript Interfaces

An interface describes the shape of an object.

Example:

```ts
export interface Notebook {
  id: string;
  title: string;
  cells: NotebookCell[];
  createdAt: number;
  updatedAt: number;
}
```

This says every `Notebook` must have:

- `id`: a string identifier.
- `title`: the notebook title.
- `cells`: an array of notebook cells.
- `createdAt`: a timestamp.
- `updatedAt`: a timestamp.

TypeScript uses this information to catch mistakes before the app runs in the browser.

## Main Concept: Shared Cell Fields

Text cells and drawing cells have some fields in common:

- `id`
- `type`
- `createdAt`
- `updatedAt`

Instead of repeating those fields in every cell interface, Step 03 used a shared base interface:

```ts
export interface BaseCell {
  id: string;
  type: CellType;
  createdAt: number;
  updatedAt: number;
}
```

This describes the fields every cell must have.

## Main Concept: Extending Interfaces

The text and drawing cell interfaces extend `BaseCell`.

Example:

```ts
export interface TextCell extends BaseCell {
  type: "text";
  content: string;
}
```

`extends BaseCell` means:

```text
A TextCell has all fields from BaseCell, plus its own fields.
```

So a `TextCell` effectively has:

```ts
{
  id: string;
  type: "text";
  createdAt: number;
  updatedAt: number;
  content: string;
}
```

The drawing cell follows the same pattern:

```ts
export interface DrawingCell extends BaseCell {
  type: "drawing";
  drawing: string | null;
}
```

## Main Concept: Literal Types

This type:

```ts
export type CellType = "text" | "drawing";
```

means a cell type can only be one of two exact strings:

- `"text"`
- `"drawing"`

This is stricter than saying:

```ts
type CellType = string;
```

Using exact string values helps TypeScript understand which kind of cell is being handled.

## Main Concept: Discriminated Unions

The app can store different cell shapes in one array:

```ts
export type NotebookCell = TextCell | DrawingCell;
```

This means a `NotebookCell` can be either a `TextCell` or a `DrawingCell`.

The `type` field tells TypeScript which one it is:

```ts
if (cell.type === "text") {
  cell.content;
}

if (cell.type === "drawing") {
  cell.drawing;
}
```

This pattern is called a discriminated union.

The `type` field is the discriminator. It lets TypeScript narrow the object to the correct interface.

This will be important later when rendering different React components for different cell types.

## Main Concept: UUIDs

Each notebook and cell needs an ID.

IDs are important because later the app will need to:

- Select a notebook.
- Update a specific cell.
- Delete a specific cell.
- Move a specific cell.
- Duplicate a specific cell.
- Render lists with stable React keys.

The ID helper uses `crypto.randomUUID()` when available:

```ts
export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
```

`crypto.randomUUID()` creates IDs like:

```text
3b3fdb81-0f91-42e5-a61f-06cf4ef12b62
```

The fallback is useful in environments where `randomUUID()` is not available.

## Main Concept: Factory Functions

Step 03 added helper functions that create valid app objects.

For example:

```ts
export function createTextCell(): TextCell {
  const now = Date.now();

  return {
    id: createId(),
    type: "text",
    content: "",
    createdAt: now,
    updatedAt: now,
  };
}
```

This is called a factory function.

Instead of manually creating a text cell in many different places, the app can call `createTextCell()`.

That keeps object creation consistent.

## Main Concept: `null` For Missing Drawing Data

Drawing cells use:

```ts
drawing: string | null;
```

The `string` will eventually hold a canvas image data URL.

`null` means:

```text
This drawing cell does not have a saved drawing yet.
```

Using `null` is clearer than using an empty string because it directly represents missing data.

## Main Concept: Date Formatting

`formatDate` converts a timestamp into readable text.

Example:

```ts
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
```

Concepts:

- `Date.now()` returns a timestamp number.
- `new Date(timestamp)` converts the number into a Date object.
- `date.getTime()` can be checked for invalid dates.
- `toLocaleDateString()` formats the date for display.

This helper can later show notebook and cell dates in the UI.

## Main Concept: Word Counting

`countWords` counts words in a string.

The important edge case is empty text.

Without trimming, an empty string can be counted incorrectly.

The helper:

```ts
export function countWords(text: string): number {
  const clean = text.trim();

  if (clean === "") {
    return 0;
  }

  return clean.split(/\s+/).length;
}
```

Concepts:

- `trim()` removes leading and trailing whitespace.
- `""` should return `0`.
- `/\s+/` splits on one or more whitespace characters.

This helper can later show word counts for text cells.

## Main Concept: `import type`

The utility file only needs TypeScript types from `notebook-types.ts`.

For type-only imports, the cleaner pattern is:

```ts
import type { TextCell, DrawingCell, Notebook } from "./notebook-types";
```

This tells TypeScript:

```text
These imports are only for checking types, not runtime JavaScript behavior.
```

It also avoids unnecessary runtime imports.

## What Was Verified

Step 03 was checked with:

```bash
pnpm exec tsc --noEmit
```

That passed, which means TypeScript accepted the types and helpers.

It was also checked with:

```bash
pnpm lint
```

Lint passed, but reported one warning when `NotebookCell` was imported but not used.

That warning can be fixed by removing the unused import and using `import type`.

## What Step 03 Did Not Do

Step 03 did not add:

- React state.
- Client Components.
- New visible UI.
- Editable text.
- Drawing behavior.
- localStorage.
- Real notebook selection.

Those are later steps.

## Mental Model To Keep

Step 03 created the app's data foundation.

Before React can render real notebooks and cells, the app needs to know:

- What a notebook is.
- What a text cell is.
- What a drawing cell is.
- How to create valid starter objects.
- How to identify objects later.

The next step will use these types and helpers inside React state.

## Key Takeaways

- TypeScript interfaces define object shapes.
- Shared fields belong in a base interface.
- `extends` lets specialized interfaces reuse common fields.
- Literal types like `"text"` and `"drawing"` make data safer.
- Discriminated unions let one array hold multiple related object shapes.
- Every notebook and cell needs an ID for future updates and rendering.
- Factory functions keep object creation consistent.
- `lib/` is for reusable non-UI logic.
- Step 03 prepares the app for state, but does not add state yet.
