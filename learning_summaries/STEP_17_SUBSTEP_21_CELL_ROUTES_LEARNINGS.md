# Step 17 Substep 21 Learnings - Cell API Routes

This summary covers Step 17 substep 21, where cell operations were moved from local-only React state into API-backed database operations.

The main idea was:

```text
Client component
  -> client API helper
    -> Next.js API route
      -> repository function
        -> Neon Postgres
```

This made cell creation, deletion, updates, copy, and reorder persist after refresh.

## The Sub-Substeps

Step 21 was broken into these smaller parts:

```text
1. Add server/API support for creating a cell.
2. Wire add text/drawing cell to the API.
3. Add server/API support for deleting a cell.
4. Wire cell delete to the API.
5. Add server/API support for updating cell content/drawing/height.
6. Wire updates later with debounce.
7. Add server/API support for reorder.
8. Wire move/drag reorder.
```

A related fix was also added:

```text
Copy cell now uses a database-backed duplicate route.
```

## Client Helpers

Client API helpers live in:

```text
lib/client/notebook-api.ts
```

These helpers hide raw `fetch` logic from React components.

The important helpers added in this step were:

```ts
createRemoteCell(...)
deleteRemoteCell(...)
updateRemoteCell(...)
reorderRemoteCells(...)
duplicateRemoteCell(...)
```

The pattern is:

```ts
const response = await fetch("/api/...", {
  method: "...",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(input),
});
```

Then:

```ts
if (!response.ok) {
  throw new Error("...");
}
```

For routes that return a cell, the response is parsed as `unknown` first:

```ts
const data: unknown = await response.json();
```

Then a runtime validator checks the shape:

```ts
if (!isCellResponse(data)) {
  throw new Error("Invalid cell response");
}
```

This keeps unsafe network data from entering React state without validation.

## API Route Shape

Cell routes were split by resource:

```text
POST   /api/notebooks/[notebookId]/cells
DELETE /api/cells/[cellId]
PATCH  /api/cells/[cellId]
PATCH  /api/notebooks/[notebookId]/cells/reorder
POST   /api/cells/[cellId]/duplicate
```

Creating a cell uses `notebookId` because the new cell does not exist yet:

```text
POST /api/notebooks/[notebookId]/cells
```

Deleting, updating, and duplicating use `cellId` because the cell already exists:

```text
PATCH /api/cells/[cellId]
DELETE /api/cells/[cellId]
POST /api/cells/[cellId]/duplicate
```

Reorder uses `notebookId` because order only makes sense inside one notebook:

```text
PATCH /api/notebooks/[notebookId]/cells/reorder
```

## Dynamic Route Params

Next.js dynamic route folders like:

```text
[notebookId]
[cellId]
```

become route params.

For example:

```text
/api/notebooks/abc-123/cells
```

matches:

```text
app/api/notebooks/[notebookId]/cells/route.ts
```

and produces:

```ts
params.notebookId
```

In the route function:

```ts
export async function POST(
  request: Request,
  { params }: NotebookCellsRouteContext,
) {
  const { notebookId } = await params;
}
```

`{ params }` destructures the second route argument.

`const { notebookId } = await params` destructures the resolved params object.

## Request Bodies And Response Objects

Request body data is read with:

```ts
const body: unknown = await request.json();
```

It is typed as `unknown` because request data should not be trusted until validated.

Successful cell responses use:

```ts
return Response.json({ cell }, { status: 201 });
```

The curly braces here create an object.

This:

```ts
{ cell }
```

is shorthand for:

```ts
{ cell: cell }
```

So the response shape is:

```json
{
  "cell": {}
}
```

That matches:

```ts
export interface CellResponse {
  cell: NotebookCell;
}
```

## Runtime Validation

New validators were added in:

```text
lib/notebook-validation.ts
```

Important validators:

```ts
isCreateCellInput(...)
isCellResponse(...)
isUpdateCellInput(...)
isReorderCellsInput(...)
```

Validation checks included:

```text
cell type must be "text" or "drawing"
afterCellId must be undefined, null, or UUID-shaped
update input must include at least one field
update input must not mix content and drawing
heightPx must stay within the expected range
reorder cell IDs must all be UUID-shaped
reorder cell IDs must be unique
```

Route params such as `cellId` and `notebookId` should also be validated with:

```ts
isUuid(...)
```

This avoids database UUID cast errors from malformed manual requests.

## Repository Functions

Database logic lives in:

```text
lib/server/notebook-repository.ts
```

The main functions added or updated were:

```ts
createCell(...)
deleteCell(...)
updateCell(...)
reorderCells(...)
duplicateCell(...)
```

Repository functions verify ownership through the relationship:

```text
cells.notebook_id -> notebooks.id
notebooks.user_id -> users.id
```

That means a user can only modify cells that belong to their own notebooks.

## SQL CTEs

Several repository functions use SQL CTEs:

```sql
with ...
```

CTEs make it possible to do multi-part operations in one SQL statement.

Examples:

```text
find target notebook
find target cell position
shift later cells
insert/delete/update a cell
update notebook.updated_at
return the changed row
```

This was especially useful because Neon HTTP queries do not work like fully interactive multi-step transactions where later queries can depend on earlier query results in JavaScript.

## Creating Cells

Creating a cell uses:

```text
POST /api/notebooks/[notebookId]/cells
```

The input looks like:

```ts
{ type: "text" }
```

or:

```ts
{
  type: "drawing",
  afterCellId: "..."
}
```

If `afterCellId` is omitted, the new cell is appended.

If `afterCellId` is provided, the new cell is inserted after that cell and later cells are shifted down.

The frontend uses the returned server cell, not a local-only generated cell.

## Deleting Cells

Deleting a cell uses:

```text
DELETE /api/cells/[cellId]
```

The repository deletes only if the cell belongs to the current user.

After deletion, later cells shift down:

```text
0, 1, 2
```

delete position `1`:

```text
0, 1
```

The UI no longer creates a local fallback text cell after deleting the last cell. A notebook can temporarily have zero cells.

## Updating Cells

Updating a cell uses:

```text
PATCH /api/cells/[cellId]
```

Supported update bodies:

```ts
{ content: "..." }
{ drawing: "data:image/png;base64,..." }
{ drawing: null }
{ heightPx: 300 }
```

The repository returns a status result:

```ts
type UpdateCellResult =
  | { status: "updated"; cell: NotebookCell }
  | { status: "not_found" }
  | { status: "invalid_cell_type" };
```

This distinguishes:

```text
cell does not exist
```

from:

```text
the update field does not match the cell type
```

For example, updating `content` on a drawing cell returns a `400` instead of pretending the cell was not found.

## Debounced Saves

Text, drawing, and height changes are saved with debounce.

The UI updates immediately:

```text
user types
  -> React state updates immediately
```

The database save waits briefly:

```text
user pauses
  -> PATCH /api/cells/[cellId]
```

The debounce uses two refs:

```ts
const pendingCellUpdatesRef = useRef(new Map<string, UpdateCellInput>());
const cellSaveTimersRef = useRef(
  new Map<string, ReturnType<typeof setTimeout>>(),
);
```

`pendingCellUpdatesRef` stores the latest unsaved update for each cell.

`cellSaveTimersRef` stores the timer for each cell.

Using one timer per cell prevents edits in one cell from canceling saves for another cell.

## Timers And `useRef`

`setTimeout` schedules a function to run later:

```ts
const nextTimer = setTimeout(() => {
  // save later
}, 600);
```

`clearTimeout` cancels a scheduled timer:

```ts
clearTimeout(existingTimer);
```

`useRef` returns an object with a `.current` property:

```ts
const timerRef = useRef(...)
```

The stored value is accessed with:

```ts
timerRef.current
```

Refs are useful for timer bookkeeping because changing `.current` does not trigger a React re-render.

## Safer Pending Save Cleanup

One important caveat was fixed.

The app should not delete pending save data before the remote save succeeds.

The safer pattern is:

```text
read pending input
clear timer
try remote save
only delete pending input after success
only delete it if it is still the same object
```

The identity check matters:

```ts
if (pendingCellUpdatesRef.current.get(cellId) === inputToSave) {
  pendingCellUpdatesRef.current.delete(cellId);
}
```

It prevents an older save from deleting newer unsaved input.

## Reordering Cells

Reordering uses:

```text
PATCH /api/notebooks/[notebookId]/cells/reorder
```

The request body contains the final order:

```ts
{
  cellIds: ["id-1", "id-2", "id-3"]
}
```

The SQL uses:

```sql
unnest($3::uuid[]) with ordinality
```

This turns the array into rows with positions.

The backend only accepts a reorder if the submitted IDs exactly match the notebook's cells:

```text
no missing cells
no extra cells
no duplicate cells
```

The UI uses optimistic updates:

```text
update React state first
save order to server second
```

This keeps drag and button moves responsive.

## Copying Cells

Copy originally used a local-only helper.

That was fixed by adding:

```text
POST /api/cells/[cellId]/duplicate
```

The duplicate route:

```text
finds the source cell
copies its content/drawing/height
inserts the copy after the source cell
shifts later cells down
returns the new database-backed cell
```

Before copying, pending debounced saves are flushed:

```ts
await flushQueuedCellSave(cellId);
```

This helps make sure the copied database row includes the latest edits.

## Optimistic UI

Several operations update the UI immediately and then save remotely:

```text
text edits
drawing edits
height changes
move up/down
drag reorder
```

This makes the app feel responsive.

The tradeoff is that failures need better UI later.

For now, failures use:

```ts
window.alert(...)
```

Later, this should become a proper saving/error state.

## Remaining Deferred Work

Import is still local-state only.

Current import behavior:

```text
parse JSON file
set React state
```

It does not replace notebooks in Neon.

That is intentionally deferred.

A future fix should add a dedicated route such as:

```text
POST /api/notebooks/import
```

which would validate imported notebooks, replace the user's database notebooks, and return the saved database-backed notebooks.

## Verification

At the end of this step, these checks passed:

```bash
pnpm check
pnpm exec tsc --noEmit
pnpm build
```

The Next.js build included:

```text
/api/cells/[cellId]
/api/cells/[cellId]/duplicate
/api/notebooks/[notebookId]/cells
/api/notebooks/[notebookId]/cells/reorder
```

## Key Takeaways

- Client helpers keep React components cleaner by hiding `fetch` details.
- API routes should validate both request bodies and dynamic route params.
- Data from `request.json()` and `response.json()` should be treated as `unknown` until validated.
- Repository functions should enforce user ownership, not trust the client.
- CTEs are useful for multi-part database operations such as insert-and-shift.
- Debouncing reduces excessive database writes while keeping local UI responsive.
- `useRef` is useful for mutable timer state that should not trigger re-renders.
- Optimistic UI is fast, but it needs better error handling later.
- Local-only helpers should be removed or avoided once a feature needs to persist to the database.
