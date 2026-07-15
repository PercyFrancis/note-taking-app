# Notebook Import Implementation Plan

This plan covers how to fix JSON notebook import now that the app is database-backed.

The current import flow only updates React state:

```text
file
  -> parseNotebookExport(...)
    -> setNotebooks(importedNotebooks)
```

That means imported notebooks disappear after refresh because they were never saved to Neon.

The new import flow should be:

```text
file
  -> parse and validate export JSON
    -> user chooses append or replace
      -> POST /api/notebooks/import
        -> validate import input
          -> create database notebooks/cells
            -> reload notebooks from server
```

## Target Behavior

The user should be able to choose:

```text
Append
  Keep existing notebooks.
  Add imported notebooks as new database notebooks.

Replace
  Delete/replace current user's notebooks.
  Add imported notebooks as the new notebook set.

Cancel
  Do nothing.
```

Append should be implemented first because it is safer.

Replace is destructive and should have a stronger confirmation.

## Important Design Rule

Do not trust imported IDs.

The exported JSON contains:

```text
notebook.id
cell.id
createdAt
updatedAt
```

Those values came from another app state or another database moment. They may conflict with existing database rows.

Treat the import file as content:

```text
notebook title
cell order
cell type
text content
drawing data
cell height
```

Generate new notebook and cell IDs during import.

## Existing Files To Reuse

Useful existing files:

```text
components/notebook/NotebookApp.tsx
components/notebook/NotebookToolbar.tsx
lib/notebook-storage.ts
lib/notebook-validation.ts
lib/client/notebook-api.ts
lib/server/notebook-repository.ts
app/api/notebooks/route.ts
app/api/notebooks/[notebookId]/cells/route.ts
```

Useful existing concepts:

```text
createRemoteNotebook(...)
createRemoteCell(...)
loadRemoteNotebooks()
createNotebook(...)
createCell(...)
getCurrentUserId()
sql.transaction(...)
```

## Checkpoint 1 - Decide The Import Shape

Create import-specific types.

The app's full `Notebook` type includes ids and timestamps. The import API should not need those.

Conceptual shape:

```text
ImportNotebooksInput
  mode: "append" | "replace"
  notebooks: ImportedNotebook[]

ImportedNotebook
  title: string
  cells: ImportedCell[]

ImportedTextCell
  type: "text"
  content: string
  heightPx: number

ImportedDrawingCell
  type: "drawing"
  drawing: string | null
  heightPx: number
```

Keep the imported API shape smaller than the exported file shape.

The conversion should happen after parsing the export file:

```text
NotebookExport
  -> ImportNotebooksInput
```

## Checkpoint 2 - Add Import Validation

Add validation for the new import API input.

Validation should check:

```text
mode is "append" or "replace"
notebooks is an array
notebooks is not empty
title is a string
cells is an array
cell type is "text" or "drawing"
text cells have content string
drawing cells have drawing string/null
heightPx is a finite number in the allowed range
```

Reuse the same height rules already used for cell updates:

```text
heightPx >= 120
heightPx <= 720
```

Do not require imported ids to be UUIDs because the import API should not accept ids.

## Checkpoint 3 - Add A Client API Helper

Add a helper in:

```text
lib/client/notebook-api.ts
```

Conceptual helper:

```text
importRemoteNotebooks(input)
```

It should call:

```text
POST /api/notebooks/import
```

It can return either:

```text
created notebooks
```

or:

```text
void, followed by loadRemoteNotebooks()
```

Recommended first version:

```text
return created notebooks or reload afterward
```

Reloading after import is often simpler because it makes React state match the database exactly.

## Checkpoint 4 - Add The API Route

Create:

```text
app/api/notebooks/import/route.ts
```

The route should:

```text
get current user id
parse request body
validate import input
call repository import function
return imported notebooks or success response
```

It should not trust the client for:

```text
user id
notebook ids
cell ids
positions
ownership
```

The server owns those decisions.

## Checkpoint 5 - Add The Repository Function

Add a repository function in:

```text
lib/server/notebook-repository.ts
```

Conceptual function:

```text
importNotebooks(userId, input)
```

It should:

```text
run in a transaction
optionally delete current user's notebooks if mode is replace
determine insert positions
generate new notebook ids
generate new cell ids
insert notebooks
insert cells
return created notebooks
```

Preserve:

```text
notebook order from the file
cell order from the file
titles
text content
drawing data
heightPx
```

Generate:

```text
new notebook ids
new cell ids
new createdAt/updatedAt timestamps
database positions
```

## Checkpoint 6 - Decide Append Position Behavior

For append mode, decide where imported notebooks go.

Option A:

```text
append to bottom
```

Pros:

```text
least surprising
does not disturb current top notebooks
```

Option B:

```text
insert at top
```

Pros:

```text
newly imported notebooks are immediately visible
matches current new-notebook behavior
```

Recommended:

```text
append to bottom
```

This means existing notebooks keep their positions, and imported notebooks receive positions after the current maximum.

## Checkpoint 7 - Implement Replace Mode Carefully

Replace mode should be transaction-safe.

Conceptual transaction:

```text
begin
delete current user's notebooks
insert imported notebooks
insert imported cells
commit
```

If any insert fails:

```text
rollback
old data should remain
```

This is why replace must happen in a transaction.

Because cells reference notebooks and should be deleted through cascade or explicit deletion, verify how the database foreign keys are currently defined before relying on notebook deletion.

## Checkpoint 8 - Wire `NotebookApp.importNotebooks`

Current behavior:

```text
setNotebooks(importedNotebooks)
setActiveNotebookId(importedNotebooks[0].id)
```

New behavior:

```text
read file
parse export
convert export notebooks to import input notebooks
ask user append/replace/cancel
call importRemoteNotebooks(...)
reload notebooks from server
set active notebook to an imported notebook or first notebook
```

For the first version, a simple browser prompt/confirm is acceptable.

Later, replace it with a proper modal.

## Checkpoint 9 - UX Confirmation

Append confirmation can be mild:

```text
Import these notebooks into your account?
```

Replace confirmation should be stronger:

```text
This will replace all current notebooks in your account. Continue?
```

A safer future version could require typing:

```text
REPLACE
```

For now, a clear confirm dialog is enough while learning.

## Checkpoint 10 - Export Considerations

Export currently exports React state.

That is mostly fine.

A future improvement is to flush pending saves before export:

```text
flush pending cell saves
flush pending title saves
then create export JSON
```

Without that, the export may include the current UI state even if the database is still behind. That is acceptable for now because export uses local state.

## Checkpoint 11 - Testing Append

Test append mode with:

```text
create notebook A
export JSON
import JSON with append
confirm imported copy appears
refresh page
confirm imported copy still exists
confirm original notebook still exists
confirm text cells preserved
confirm drawing cells preserved
confirm cell heights preserved
confirm order preserved
```

Also test importing the same file twice.

Expected:

```text
new copies are created
no duplicate id errors
```

## Checkpoint 12 - Testing Replace

Use a throwaway account or test data.

Test:

```text
create notebook A
create notebook B
export a different file
import with replace
confirm A/B are gone
confirm imported notebooks exist
refresh page
confirm replacement persists
```

Also test failure scenarios if possible:

```text
invalid file
empty notebooks array
invalid cell height
database/API error
```

## Checkpoint 13 - Run Checks

After implementation:

```bash
pnpm check
pnpm exec tsc --noEmit
pnpm build
```

## Definition Of Done

Import is fixed when:

```text
valid export files can be imported
append mode adds notebooks without deleting existing ones
replace mode replaces only the current user's notebooks
imported notebooks persist after refresh
imported cells preserve content/drawing/height/order
imported ids are not reused as database ids
other users' notebooks are not affected
invalid files are rejected
checks pass
```

## Suggested Implementation Order

Recommended order:

```text
1. Add import types.
2. Add import validation.
3. Add client API helper.
4. Add API route.
5. Add repository function with append mode only.
6. Wire NotebookApp import to append mode.
7. Test append thoroughly.
8. Add replace mode.
9. Add replace confirmation.
10. Test replace thoroughly.
```

This keeps the dangerous destructive behavior until after the safe import pipeline is proven.
