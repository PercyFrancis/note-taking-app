# Step 11 Learnings - localStorage Persistence

Step 11 added local browser persistence for notebooks.

Before this step, notebook data lived only in React state. Refreshing the page reset the app back to a default notebook. After this step, notebooks can be saved to `localStorage` and loaded again when the app opens.

The main goal was to persist user content locally while keeping the first storage version simple.

## What Changed

Step 11 updated:

- `lib/notebook-storage.ts`
- `components/notebook/NotebookApp.tsx`

The main features added were:

- A dedicated storage helper file.
- A `localStorage` key for notebook data.
- A versioned stored-data shape.
- A load helper for reading saved notebooks.
- A save helper for writing notebooks.
- Browser guards to avoid using `localStorage` outside the browser.
- `useEffect` loading in `NotebookApp`.
- `useEffect` saving in `NotebookApp`.
- A loaded flag to avoid overwriting saved data on first render.
- Basic validation for stored data.

## Main Concept: React State Is Temporary

React state is memory inside the running page.

For example:

```ts
const [notebooks, setNotebooks] = useState<Notebook[]>(...)
```

This state disappears when the page refreshes.

That means:

```text
React state alone:
  good for live interaction
  not enough for persistence
```

Step 11 added `localStorage` so notebook data can survive a refresh.

## Main Concept: `localStorage`

`localStorage` is a browser storage API.

It stores string values by key:

```ts
window.localStorage.setItem("key", "value");
```

and reads them back:

```ts
window.localStorage.getItem("key");
```

For the notebook app, the storage key is:

```ts
const STORAGE_KEY = "note-taking-app:notebooks";
```

This key identifies the saved notebook data for this app.

## Main Concept: Storage Boundary

Storage logic was placed in:

```text
lib/notebook-storage.ts
```

instead of directly inside `NotebookApp.tsx`.

This keeps responsibilities separate:

```text
NotebookApp.tsx:
  owns React state and user interactions.

notebook-storage.ts:
  owns loading, saving, parsing, and basic validation.
```

This matters because later steps will add:

- Import/export.
- Possibly real storage.
- Better validation.
- Maybe migrations.

Keeping storage behind helper functions makes those changes easier.

## Main Concept: Versioned Storage Shape

The saved data is wrapped in a versioned object:

```ts
interface StoredNotebooks {
  version: 1;
  notebooks: Notebook[];
}
```

Instead of storing only:

```ts
Notebook[]
```

the app stores:

```ts
{
  version: 1,
  notebooks: [...]
}
```

This gives the data format room to evolve later.

For example, a future version might add:

```ts
version: 2
```

and migrate old data.

This also lines up well with Step 15 import/export, where exported files should probably have a version number too.

## Main Concept: Browser-Only APIs In Next.js

`localStorage` exists only in the browser.

It does not exist during server rendering.

That is why storage helpers check:

```ts
if (typeof window === "undefined") {
  return null;
}
```

or:

```ts
if (typeof window === "undefined") {
  return;
}
```

This guard means:

```text
If this code is not running in a browser, do not touch localStorage.
```

Without this guard, server-side code could crash with:

```text
window is not defined
```

## Main Concept: JSON Serialization

`localStorage` stores strings.

Notebook data is made of objects and arrays.

So saving requires:

```ts
JSON.stringify(storedNotebooks)
```

This converts the notebook object into a string.

Loading requires:

```ts
JSON.parse(storedValue)
```

This converts the string back into JavaScript data.

The flow is:

```text
Notebook[] -> JSON.stringify -> localStorage string
localStorage string -> JSON.parse -> Notebook[]
```

## Main Concept: `loadStoredNotebooks`

The load helper reads saved notebooks:

```ts
export function loadStoredNotebooks(): Notebook[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);

    if (!isStoredNotebooks(parsedValue)) {
      return null;
    }

    return parsedValue.notebooks;
  } catch {
    return null;
  }
}
```

This function returns either:

```ts
Notebook[]
```

or:

```ts
null
```

`null` means:

```text
No usable stored notebooks were found.
```

## Main Concept: `unknown`

Parsed JSON is typed as:

```ts
const parsedValue: unknown = JSON.parse(storedValue);
```

`unknown` means:

```text
This value could be anything.
Validate it before trusting it.
```

That is better than assuming parsed JSON is already a valid notebook object.

Data from storage, imports, APIs, or user files should generally be treated as untrusted until checked.

## Main Concept: `try/catch`

Loading uses:

```ts
try {
  ...
} catch {
  return null;
}
```

This is important because `JSON.parse` can throw an error if the stored string is not valid JSON.

For example:

```text
not valid json
```

would fail to parse.

Instead of crashing the app, the helper catches the error and returns `null`.

The app can then fall back to the default notebook.

## Main Concept: Basic Validation

The storage file includes:

```ts
function isStoredNotebooks(value: unknown): value is StoredNotebooks {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { version?: unknown; notebooks?: unknown };

  return candidate.version === 1 && Array.isArray(candidate.notebooks);
}
```

This checks:

```text
value is an object
version is exactly 1
notebooks is an array
```

It uses a TypeScript type predicate:

```ts
value is StoredNotebooks
```

That tells TypeScript:

```text
If this function returns true, value can be treated as StoredNotebooks.
```

## Main Concept: Shallow Validation Caveat

The current validation is shallow.

It catches invalid data like:

```json
"hello"
```

or:

```json
{ "version": 2, "notebooks": [] }
```

or:

```json
{ "version": 1, "notebooks": "wrong" }
```

But it would still accept:

```json
{ "version": 1, "notebooks": [{}] }
```

because `notebooks` is technically an array.

That means the app could still receive notebook objects missing:

- `id`
- `title`
- `cells`
- `createdAt`
- `updatedAt`

For Step 11, shallow validation is acceptable as a first pass.

For Step 15 import/export, validation should become deeper because imported files are more likely to contain invalid or incompatible data.

## Main Concept: `saveStoredNotebooks`

The save helper writes notebooks:

```ts
export function saveStoredNotebooks(notebooks: Notebook[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const storedNotebooks: StoredNotebooks = {
    version: 1,
    notebooks,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedNotebooks));
  } catch {
    // Ignore storage failures for now.
  }
}
```

This function:

```text
checks for the browser
wraps notebooks in a versioned object
converts the object to JSON
saves it to localStorage
catches storage errors
```

## Main Concept: Saving Can Fail

Saving to `localStorage` can fail.

Possible reasons include:

- Browser storage is full.
- Storage is blocked.
- Private browsing restrictions.
- The saved data is too large.

The first version catches the error and ignores it:

```ts
catch {
  // Ignore storage failures for now.
}
```

That keeps the app from crashing.

Later, the app could show a warning if saving fails.

## Main Concept: Loading With `useEffect`

`NotebookApp` loads stored notebooks in an effect:

```tsx
useEffect(() => {
  const storedNotebooks = loadStoredNotebooks();

  if (storedNotebooks && storedNotebooks.length > 0) {
    setNotebooks(storedNotebooks);
    setActiveNotebookId(storedNotebooks[0].id);
  }

  setHasLoadedStoredNotebooks(true);
}, []);
```

This effect runs after the component mounts in the browser.

The empty dependency array:

```ts
[]
```

means:

```text
Run once when the component mounts.
```

This is the right place to load from `localStorage` because browser-only APIs are safe inside effects.

## Main Concept: Initial Default Notebook

The app still creates a default notebook first:

```ts
const [notebooks, setNotebooks] = useState<Notebook[]>(() => {
  const notebook = createDefaultNotebook();
  return [notebook];
});
```

This gives the app valid data for the first render.

Then the load effect can replace that default notebook with stored notebooks if they exist.

The startup flow is:

```text
create default notebook
render app
load effect runs in browser
if saved notebooks exist, replace default notebook
otherwise keep default notebook
```

## Main Concept: Active Notebook After Loading

When stored notebooks load, the app sets:

```ts
setActiveNotebookId(storedNotebooks[0].id);
```

This makes the first stored notebook active.

This is simple and reliable.

The app does not persist active notebook ID yet.

That is fine because the durable user data is the notebook content.

## Main Concept: Save Effect

`NotebookApp` saves notebooks in a second effect:

```tsx
useEffect(() => {
  if (!hasLoadedStoredNotebooks) {
    return;
  }

  saveStoredNotebooks(notebooks);
}, [notebooks, hasLoadedStoredNotebooks]);
```

This effect runs whenever:

```text
notebooks changes
or
hasLoadedStoredNotebooks changes
```

The important behavior is:

```text
After loading is complete, save the current notebooks whenever they change.
```

This centralizes saving in one place instead of saving manually inside every event handler.

## Main Concept: Loaded Flag

The app tracks:

```ts
const [hasLoadedStoredNotebooks, setHasLoadedStoredNotebooks] =
  useState(false);
```

This flag means:

```text
Has the app already attempted to load notebooks from localStorage?
```

It protects saved data.

Without the flag, the app could:

```text
create a default notebook
save the default notebook
then load from storage
```

That could overwrite real saved notes with the default notebook.

With the flag, the flow becomes:

```text
create a default notebook
skip saving because load is not complete
load stored notebooks if available
mark load complete
save future notebook changes
```

## Main Concept: One Save Point

Many actions change notebook data:

- Creating a notebook.
- Deleting a notebook.
- Renaming a notebook.
- Adding a cell.
- Editing a text cell.
- Drawing on canvas.
- Changing cell height.
- Duplicating a cell.
- Reordering cells.

Instead of saving in every handler, the app saves in one effect that watches:

```ts
notebooks
```

This is cleaner because all notebook changes flow through `setNotebooks`.

The mental model is:

```text
Any time notebooks changes, persistence catches up.
```

## Main Concept: Durable State Versus UI State

Step 11 saves:

```ts
notebooks
```

It does not save:

- `searchQuery`
- `focusedCellId`
- Write/Preview mode.
- Drag state.

That is intentional.

Notebook data is durable user content.

Search, focus, and editor mode are temporary UI state.

The rule is:

```text
Persist durable user content first.
Do not persist temporary UI state unless there is a clear reason.
```

## Main Concept: Preparing For Import/Export

Step 15 will add import/export.

Step 11 helps prepare for that by:

- Creating a storage boundary.
- Introducing versioned saved data.
- Introducing basic validation.
- Keeping notebook data JSON-serializable.

Import/export will likely reuse similar ideas:

```text
versioned JSON
parse JSON
validate shape
load notebooks into state
save/export notebooks from state
```

The validation should become deeper during Step 15.

## Main Concept: Preparing For Real Storage

Step 17 may replace local-only storage with something larger or remote.

Possible future storage options include:

- IndexedDB.
- Supabase.
- SQLite through a backend.
- Hosted database storage.

Because storage logic now lives in `lib/notebook-storage.ts`, future changes can be more contained.

The app already has a simple boundary:

```ts
loadStoredNotebooks()
saveStoredNotebooks(notebooks)
```

Later, the internals can change while `NotebookApp` stays more stable.

## What Was Verified

Step 11 was checked with:

```bash
pnpm check
```

and:

```bash
pnpm exec tsc --noEmit
```

Both passed.

A production build was also checked:

```bash
pnpm build
```

The app also responded successfully at:

```text
http://localhost:3000
```

## What Step 11 Did Not Do

Step 11 did not add:

- Deep validation of every notebook and cell.
- Import/export UI.
- Exported file downloads.
- Uploaded file reading.
- User accounts.
- Cloud sync.
- Database storage.
- IndexedDB storage.
- Save status messages.
- Conflict resolution.
- Cross-tab synchronization.
- Persistence for active notebook ID.
- Persistence for temporary UI state.

Those can be considered later.

## Mental Model To Keep

Step 11 introduced this persistence flow:

```text
App starts
  -> create default notebook for initial render
  -> load effect checks localStorage in the browser
  -> valid stored notebooks replace default notebook
  -> loading is marked complete
  -> save effect watches notebook state
  -> future notebook changes are saved to localStorage
```

The most important idea is:

```text
React state powers the live app. localStorage keeps a JSON copy across refreshes.
```

## Key Takeaways

- React state does not survive page refreshes.
- `localStorage` is browser-only storage.
- Next.js code must guard browser-only APIs with `typeof window`.
- `localStorage` stores strings, so objects need `JSON.stringify`.
- Stored strings need `JSON.parse` when loading.
- Parsed JSON should be treated as `unknown` until validated.
- `try/catch` prevents invalid JSON from crashing the app.
- A storage key identifies this app's saved data.
- A versioned storage shape makes future migrations easier.
- Storage helpers keep persistence logic out of React components.
- `useEffect` is the right place to load browser-only data.
- A loaded flag prevents overwriting saved data during initial startup.
- A single save effect can persist all notebook changes.
- Save durable notebook data before saving temporary UI state.
- Current validation is shallow and should be strengthened for import/export.
- Step 11 completed the first localStorage persistence pass.
