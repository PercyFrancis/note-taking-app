# Step 15 Learnings - Import And Export

Step 15 added a manual backup and restore path for notebooks.

Before this step, notebook data could persist automatically in `localStorage`, but there was no way to create a backup file or restore from one. After this step, the app can export notebooks as a JSON file and import a valid JSON backup file.

The main goal was to create a safe backup path before moving toward real storage later.

## What Changed

Step 15 updated:

- `lib/types.ts`
- `lib/notebook-storage.ts`
- `components/notebook/NotebookApp.tsx`
- `components/notebook/NotebookEditor.tsx`
- `components/notebook/NotebookToolbar.tsx`

The main features added were:

- A `NotebookExport` type.
- A versioned export format.
- Export creation with `createNotebookExport()`.
- Import parsing with `parseNotebookExport()`.
- Deeper validation for imported notebooks and cells.
- An `exportNotebooks()` handler in `NotebookApp`.
- An `importNotebooks()` handler in `NotebookApp`.
- A dedicated `NotebookToolbar` component.
- Export JSON and Import JSON buttons.
- A hidden file input for importing JSON files.

## Main Concept: Import/Export Is A Backup Layer

Step 11 added automatic local persistence:

```text
React state -> localStorage
localStorage -> React state
```

Step 15 added manual backup and restore:

```text
React state -> downloadable JSON file
uploaded JSON file -> React state
```

These are different storage layers:

```text
localStorage:
  automatic local persistence.

export:
  manual backup.

import:
  manual restore.
```

This is useful before real storage because a user can back up their notes before changing storage architecture.

## Main Concept: Versioned Export Shape

The shared export type is:

```ts
export interface NotebookExport {
  version: 1;
  notebooks: Notebook[];
  exportedAt: number;
}
```

This means an exported file contains:

```text
version:
  the export format version.

notebooks:
  the actual notebook data.

exportedAt:
  timestamp for when the export was created.
```

The exported file is not just a raw `Notebook[]`.

It is a wrapper object:

```json
{
  "version": 1,
  "notebooks": [],
  "exportedAt": 1710000000000
}
```

This makes the file easier to validate and easier to migrate later.

## Main Concept: Why Version Numbers Matter

The field:

```ts
version: 1
```

marks the format of the export file.

Later, the app might change the notebook model.

For example:

```text
version 1:
  text and drawing cells.

version 2:
  text, drawing, and code cells.
```

With a version number, the import code can decide:

```text
version is supported:
  import it.

version is unsupported:
  reject it or migrate it.
```

This is the same general idea used by database migrations and file formats.

## Main Concept: `createNotebookExport`

The export helper creates a `NotebookExport` object:

```ts
export function createNotebookExport(notebooks: Notebook[]): NotebookExport {
  return {
    version: 1,
    notebooks,
    exportedAt: Date.now(),
  };
}
```

Line by line:

```ts
export function createNotebookExport(notebooks: Notebook[]): NotebookExport {
```

Creates a function that accepts the current notebook array and returns a `NotebookExport`.

```ts
version: 1,
```

Marks the file as version 1 of the export format.

```ts
notebooks,
```

Includes the current notebooks.

This is shorthand for:

```ts
notebooks: notebooks
```

```ts
exportedAt: Date.now(),
```

Stores the current timestamp.

This records when the backup was created.

## Main Concept: `exportNotebooks`

`exportNotebooks()` lives in `NotebookApp` because `NotebookApp` owns the notebook state.

The handler turns app state into a downloadable JSON file:

```ts
function exportNotebooks() {
  const exportData = createNotebookExport(notebooks);
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `notebooks-${Date.now()}.json`;
  link.click();

  URL.revokeObjectURL(url);
}
```

The flow is:

```text
notebooks state
  -> versioned export object
  -> JSON string
  -> Blob
  -> temporary object URL
  -> temporary download link
  -> browser download
  -> cleanup
```

## Main Concept: `JSON.stringify(exportData, null, 2)`

This line converts export data into readable JSON:

```ts
const json = JSON.stringify(exportData, null, 2);
```

The arguments mean:

```text
exportData:
  the object to convert.

null:
  no custom replacer function.

2:
  indent nested JSON by 2 spaces.
```

Without `null, 2`, the exported file would still work, but it would be harder to read.

## Main Concept: Blob

This line creates file-like data in memory:

```ts
const blob = new Blob([json], { type: "application/json" });
```

A `Blob` is a browser object for raw file-like data.

Here, the Blob contains:

```text
the JSON string
```

and has the MIME type:

```text
application/json
```

This tells the browser that the generated file is JSON.

## Main Concept: Object URLs

This line creates a temporary URL for the Blob:

```ts
const url = URL.createObjectURL(blob);
```

The URL points to the generated file data in memory.

It is not a real server route.

It is a temporary browser-managed URL, usually starting with:

```text
blob:
```

After the download is triggered, the URL is cleaned up:

```ts
URL.revokeObjectURL(url);
```

This tells the browser:

```text
This temporary in-memory URL is no longer needed.
```

## Main Concept: Programmatic Download Link

The export handler creates a temporary anchor:

```ts
const link = document.createElement("a");
link.href = url;
link.download = `notebooks-${Date.now()}.json`;
link.click();
```

This means:

```text
create a link
point it at the Blob URL
set a download filename
click it with JavaScript
```

The `download` attribute tells the browser to download the file instead of navigating to it.

## Main Concept: Import Needs File Input

Import is different from export because the user must choose a file.

Browsers require a file input for that:

```tsx
<input type="file" />
```

A normal button cannot directly read files from the user's computer.

The app uses a common pattern:

```text
hidden file input:
  does the real file selection.

visible Import JSON button:
  provides the styled UI.
```

## Main Concept: Hidden File Input

The toolbar uses:

```tsx
<input
  ref={fileInputRef}
  type="file"
  accept="application/json,.json"
  className="sr-only"
  onChange={(event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    onImportNotebooks(file);
    event.target.value = "";
  }}
/>
```

This input is visually hidden with:

```tsx
className="sr-only"
```

The input is still available to the browser and assistive technology, but the visible UI is a normal styled button.

## Main Concept: `useRef` For File Input

The toolbar uses:

```ts
const fileInputRef = useRef<HTMLInputElement | null>(null);
```

This ref points to the hidden file input after render.

The visible button can then call:

```ts
fileInputRef.current?.click()
```

That programmatically opens the file picker.

The flow is:

```text
user clicks Import JSON button
  -> button clicks hidden file input
  -> browser opens file picker
```

## Main Concept: `accept`

The file input uses:

```tsx
accept="application/json,.json"
```

This hints to the browser that the app expects JSON files.

The two parts help across different systems:

```text
application/json:
  JSON MIME type.

.json:
  JSON file extension.
```

This is helpful UI, but it is not validation.

The selected file must still be parsed and validated.

## Main Concept: Getting The Selected File

The input change handler uses:

```ts
const file = event.target.files?.[0];
```

This means:

```text
look at the selected files
take the first one
if there is no file list, return undefined instead of crashing
```

Then:

```ts
if (!file) {
  return;
}
```

handles the case where the user cancels the file picker.

## Main Concept: Resetting The File Input

After calling the import callback, the toolbar resets the input:

```ts
event.target.value = "";
```

This matters because browsers may not fire `onChange` if the user selects the same file twice in a row.

Resetting the value allows:

```text
import backup.json
then import backup.json again
```

to still trigger the handler.

## Main Concept: `importNotebooks`

`importNotebooks()` lives in `NotebookApp` because it replaces notebook state.

The handler:

```ts
async function importNotebooks(file: File) {
  const fileText = await file.text();
  const importedNotebooks = parseNotebookExport(fileText);

  if (!importedNotebooks) {
    window.alert("This file is not a valid notebook export.");
    return;
  }

  const shouldImport = window.confirm(
    "Importing will replace your current notebooks. Continue?",
  );

  if (!shouldImport) {
    return;
  }

  setNotebooks(importedNotebooks);
  setActiveNotebookId(importedNotebooks[0].id);
}
```

The flow is:

```text
File
  -> read as text
  -> parse JSON
  -> validate export shape
  -> confirm replacement
  -> replace notebooks state
  -> select first imported notebook
```

## Main Concept: Why Import Is Async

The function is async because this line returns a promise:

```ts
const fileText = await file.text();
```

Reading a file can take time.

The browser does not return the file contents immediately.

Instead:

```ts
file.text()
```

returns:

```ts
Promise<string>
```

Using `await` waits for the file text before parsing it.

## Main Concept: `parseNotebookExport`

The parser validates the uploaded file:

```ts
export function parseNotebookExport(fileText: string): Notebook[] | null {
  try {
    const parsedValue: unknown = JSON.parse(fileText);

    if (!isNotebookExport(parsedValue)) {
      return null;
    }

    return parsedValue.notebooks;
  } catch {
    return null;
  }
}
```

This returns:

```ts
Notebook[]
```

for a valid export file, or:

```ts
null
```

for an invalid file.

This keeps bad imports from reaching React state.

## Main Concept: Validation Helpers

Step 15 added deeper validation helpers:

```ts
isRecord()
isTextCell()
isDrawingCell()
isNotebookCell()
isNotebook()
isNotebookExport()
```

These helpers build on each other.

The validation chain is:

```text
isTextCell checks text cells
isDrawingCell checks drawing cells
isNotebookCell accepts either valid cell type
isNotebook checks notebook fields and all cells
isNotebookExport checks version, exportedAt, and all notebooks
```

This is stronger than only checking:

```text
notebooks is an array
```

## Main Concept: `isRecord`

`isRecord` checks whether a value is a non-null object:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
```

This is useful before reading properties like:

```ts
value.id
value.title
value.cells
```

Because imported JSON could be:

```text
string
number
null
array
object
```

The validation starts by confirming that the value is object-like.

## Main Concept: Cell Validation

Text cells must have:

```text
type: "text"
id: string
content: string
heightPx: number
createdAt: number
updatedAt: number
```

Drawing cells must have:

```text
type: "drawing"
id: string
drawing: string or null
heightPx: number
createdAt: number
updatedAt: number
```

The drawing field is allowed to be:

```ts
string
```

for saved canvas image data, or:

```ts
null
```

for an empty drawing cell.

## Main Concept: Notebook Validation

A notebook must have:

```text
id: string
title: string
cells: array of valid cells
createdAt: number
updatedAt: number
```

The key part is:

```ts
value.cells.every(isNotebookCell)
```

This means:

```text
Every cell in the notebook must be valid.
```

If any cell is invalid, the whole notebook is rejected.

## Main Concept: Export Validation

The export validator checks:

```text
value is an object
version is 1
notebooks is an array
notebooks is not empty
every notebook is valid
exportedAt is a number
```

This protects the app from importing random JSON as notebook data.

It also guarantees that:

```ts
importedNotebooks[0].id
```

is safe to use after validation.

## Main Concept: Import Is Destructive

Import replaces the current notebooks:

```ts
setNotebooks(importedNotebooks);
```

That is why the app asks:

```ts
window.confirm("Importing will replace your current notebooks. Continue?");
```

This protects the user from accidentally overwriting current local notes.

The import flow is intentionally:

```text
validate first
then ask for confirmation
then replace state
```

## Main Concept: Import Automatically Persists

Import does not manually call:

```ts
saveStoredNotebooks(importedNotebooks)
```

That is because Step 11 already has a save effect:

```ts
useEffect(() => {
  if (!hasLoadedStoredNotebooks) {
    return;
  }

  saveStoredNotebooks(notebooks);
}, [notebooks, hasLoadedStoredNotebooks]);
```

After import calls:

```ts
setNotebooks(importedNotebooks);
```

the `notebooks` state changes.

Then the save effect writes the imported notebooks to `localStorage`.

## Main Concept: `NotebookToolbar`

Step 15 created:

```text
components/notebook/NotebookToolbar.tsx
```

This component owns notebook-level action buttons:

```text
Add text cell
Add drawing cell
Export JSON
Import JSON
```

It does not own notebook state.

It receives callback props:

```ts
onAddTextCell
onAddDrawingCell
onExportNotebooks
onImportNotebooks
```

This keeps the toolbar reusable and focused on UI.

## Main Concept: Prop Flow

The import/export prop flow is:

```text
NotebookApp
  owns notebooks and handlers

NotebookEditor
  receives handlers as props

NotebookToolbar
  renders buttons and calls handlers
```

This keeps state changes in the component that owns the state.

The toolbar does not need to know how export or import works internally.

It only needs to report user actions upward.

## Main Concept: Better localStorage Validation

Step 15 also improved localStorage validation.

`loadStoredNotebooks()` now uses deeper notebook validation through:

```ts
value.notebooks.every(isNotebook)
```

This means localStorage no longer only checks:

```text
notebooks is an array
```

It now checks that every stored notebook has the expected shape.

This makes both import and localStorage loading more defensive.

## Remaining Defensive Polish

One small improvement remains:

```ts
await file.text()
```

could be wrapped in `try/catch`.

This is rare, but it would make import more defensive if the file cannot be read.

The idea would be:

```text
file can be read but invalid:
  show invalid export message.

file cannot be read:
  show file-read failure message.
```

This is not a blocker for Step 15.

## What Was Verified

Step 15 was checked with:

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

## What Step 15 Did Not Do

Step 15 did not add:

- Drag-and-drop file import.
- Import merge mode.
- Import preview before replacement.
- Export only the active notebook.
- Custom modal dialogs.
- Save status messages.
- Cloud sync.
- Real database storage.
- File read error UI beyond basic alerts.
- Automated tests for import/export helpers.

Those can be considered later.

## Mental Model To Keep

Step 15 introduced this export flow:

```text
User clicks Export JSON
  -> toolbar calls onExportNotebooks
  -> NotebookApp creates NotebookExport
  -> JSON.stringify creates file text
  -> Blob creates file-like data
  -> object URL points to the Blob
  -> temporary link triggers download
  -> object URL is revoked
```

Step 15 introduced this import flow:

```text
User clicks Import JSON
  -> toolbar clicks hidden file input
  -> user chooses a file
  -> toolbar passes File to NotebookApp
  -> NotebookApp reads file text
  -> parseNotebookExport parses and validates JSON
  -> app confirms replacement
  -> notebooks state is replaced
  -> active notebook becomes first imported notebook
  -> Step 11 save effect persists imported notebooks
```

The most important idea is:

```text
Export turns trusted app state into a file. Import turns untrusted file data into app state only after validation.
```

## Key Takeaways

- Import/export gives users a manual backup path.
- Exported files should use a versioned shape.
- `exportedAt` records when a backup was created.
- `JSON.stringify(data, null, 2)` creates readable JSON.
- A `Blob` represents generated file data in the browser.
- `URL.createObjectURL()` creates a temporary URL for a Blob.
- `URL.revokeObjectURL()` cleans up that temporary URL.
- A temporary anchor with `download` can trigger a file download.
- Import requires an `<input type="file">`.
- A hidden file input plus visible button is a common import UI pattern.
- `useRef` lets the visible button click the hidden file input.
- `accept="application/json,.json"` helps the file picker show JSON files.
- `event.target.files?.[0]` gets the selected file.
- Resetting `event.target.value` lets the same file be selected again.
- `file.text()` is asynchronous, so import uses `async` and `await`.
- Imported file contents should be treated as untrusted.
- `parseNotebookExport()` should parse and validate before state changes.
- Deep validation protects the app from malformed imports.
- Import is destructive, so confirmation is appropriate.
- Imported notebooks persist automatically through the Step 11 save effect.
- `NotebookToolbar` keeps header action controls separate from editor layout.
- Step 15 completed JSON backup and restore for local notebooks.
