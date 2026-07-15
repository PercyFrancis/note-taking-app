# Notebook Import Backend Learnings

This summary covers the backend work needed to make JSON notebook import persist to the database instead of only updating React state.

## Goal

The old import flow only did this:

```text
JSON file
  -> parse export
    -> setNotebooks(...)
```

That updated the browser state, but it did not write anything to Neon. A refresh would lose the imported notebooks.

The new backend-backed flow is:

```text
JSON file
  -> parse exported Notebook[]
    -> convert to ImportNotebooksInput
      -> POST /api/notebooks/import
        -> validate request body
          -> get current user id
            -> insert notebooks and cells in Neon
              -> return fresh Notebook[] from the database
```

## Main Files

Important files:

```text
lib/types.ts
lib/notebook-validation.ts
lib/client/notebook-api.ts
app/api/notebooks/import/route.ts
lib/server/notebook-repository.ts
```

The backend-specific files are:

```text
app/api/notebooks/import/route.ts
lib/server/notebook-repository.ts
```

The shared type and validation files support the backend route.

## Import Types

The import API uses a smaller shape than the exported file.

Exported notebooks contain full app data:

```text
notebook id
cell id
createdAt
updatedAt
title
cell content/drawing
heightPx
```

The import API should only trust content-like fields:

```ts
export interface ImportNotebooksInput {
  mode: "append" | "replace";
  notebooks: ImportedNotebook[];
}

export interface ImportedNotebook {
  title: string;
  cells: ImportedCell[];
}

export interface ImportedTextCell {
  type: "text";
  content: string;
  heightPx: number;
}

export interface ImportedDrawingCell {
  type: "drawing";
  drawing: string | null;
  heightPx: number;
}
```

The imported shape intentionally does not include:

```text
id
createdAt
updatedAt
userId
position
```

Those values should be created by the server/database.

## Runtime Validation

TypeScript types are not enough for API routes because incoming JSON is unknown at runtime.

The import route reads:

```ts
const body: unknown = await request.json();
```

Then it validates with:

```ts
isImportNotebooksInput(body)
```

The validator checks:

```text
body is an object
mode is "append" or "replace"
notebooks is an array
notebooks is not empty
each notebook has a title and cells array
each text cell has type/content/heightPx
each drawing cell has type/drawing/heightPx
heightPx is finite and between 120 and 720
```

This mirrors the validation style already used by:

```text
isCreateNotebookInput
isCreateCellInput
isUpdateCellInput
isReorderNotebooksInput
```

## API Route

The import route lives at:

```text
app/api/notebooks/import/route.ts
```

The route is intentionally thin:

```text
parse request body
validate request body
get current user id
call repository function
return { notebooks }
```

The route should await the repository function:

```ts
const notebooks = await importNotebooks(userId, body);
```

Without `await`, the response would contain a Promise instead of actual notebooks.

The response shape is:

```ts
Response.json({ notebooks })
```

That matches the existing `NotebooksResponse` shape used by the client helper.

## User Isolation

The route gets the current app user through:

```ts
const userId = await getCurrentUserId();
```

The import file never decides which user owns the imported notebooks.

This matters because an import file is untrusted input. Ownership must always come from Clerk/auth plus the app's internal user mapping.

## Repository Function

The repository function lives in:

```text
lib/server/notebook-repository.ts
```

Its shape is:

```ts
export async function importNotebooks(
  userId: string,
  input: ImportNotebooksInput,
): Promise<Notebook[]> {
  // prepare imported rows
  // run transaction
  // return getNotebooks(userId)
}
```

The repository is where database work belongs. The route should not contain SQL directly.

## Preparing Imported Rows

Before inserting, the server prepares notebook and cell data.

The important rule:

```text
Generate new notebook IDs.
Generate new cell IDs.
Do not reuse imported IDs.
```

This avoids ID collisions and prevents an import file from controlling database primary keys.

The server also lets the database create fresh timestamps with:

```sql
now()
```

That means import behaves like creating new notebooks, not restoring the exact historical database state.

## Position Query

Append mode needs to know where the imported notebooks should be placed.

The max-position query is:

```sql
select coalesce(max(position), -1) as position
from notebooks
where user_id = $1
```

Meaning:

```text
Find the current highest notebook position for this user.
If the user has no notebooks, use -1.
```

Then the first appended notebook starts at:

```ts
maxPosition + 1
```

The result is typed as:

```ts
export type PositionRow = {
  position: number;
};
```

SQL query results are arrays, even when the query returns one row, so the code reads:

```ts
const startPosition = (positionRows[0]?.position ?? -1) + 1;
```

For replace mode, the start position should be:

```ts
0
```

because the user's existing notebooks are deleted first.

## Append Mode

Append mode keeps existing notebooks.

Example:

```text
existing notebook positions:
0, 1, 2

imported notebook positions:
3, 4, 5
```

Append is the safer import mode because it does not delete existing data.

## Replace Mode

Replace mode deletes the current user's notebooks, then inserts the imported notebooks.

The delete is scoped by user:

```sql
delete from notebooks
where user_id = ${userId}
```

Cells are deleted automatically because the schema uses:

```sql
notebook_id uuid not null references notebooks(id) on delete cascade
```

So deleting notebooks deletes their cells.

Replace mode should only affect the current user's notebooks.

## Transactions

The import uses:

```ts
await sql.transaction((txn) => [
  // optional delete for replace
  // notebook inserts
  // cell inserts
]);
```

The transaction matters because import is multi-step:

```text
maybe delete old notebooks
insert imported notebooks
insert imported cells
```

Without a transaction, a failure halfway through could leave partial imported data in the database.

With a transaction, the database applies all changes or none of them.

## Notebook Inserts

Each imported notebook inserts:

```text
id
user_id
title
position
created_at
updated_at
```

The important backend rules are:

```text
id comes from createId()
user_id comes from getCurrentUserId()
position is calculated by append/replace mode
timestamps use now()
```

## Cell Inserts

Each imported cell inserts:

```text
id
notebook_id
type
position
content
drawing
height_px
created_at
updated_at
```

Text cells store:

```text
content = text content
drawing = null
```

Drawing cells store:

```text
content = null
drawing = drawing data or null
```

This matches the existing create-cell/create-notebook patterns.

## Returning Fresh Data

After the transaction, the repository returns:

```ts
return getNotebooks(userId);
```

This gives the client a fresh database-backed notebook list with:

```text
real database IDs
database timestamps
database ordering
inserted cells
```

The client should use this returned list to replace local state.

## Client Helper

The client helper is not backend code, but it connects the browser to the backend route.

It sends:

```text
POST /api/notebooks/import
Content-Type: application/json
body: ImportNotebooksInput
```

Then it validates the response with:

```ts
isNotebooksResponse(data)
```

This keeps the frontend from trusting an unexpected API response shape.

## Important Backend Caveats

### ID Override Risk

When preparing imported cells, be careful with object spread order.

This is risky if runtime input contains extra properties:

```ts
{
  id: createId(),
  ...cell,
}
```

If `cell` has an unexpected `id`, it can overwrite the generated ID.

Safer patterns are:

```ts
{
  ...cell,
  id: createId(),
}
```

or, even better, explicitly build the object instead of spreading unknown input.

The validator currently checks required fields, but it does not reject extra fields, so this is worth hardening.

### Position Race Condition

The max-position query currently happens before the transaction.

For normal single-user usage, this is fine. A stronger version would calculate the append position inside the transaction or use a single SQL statement so two imports at the same time cannot choose the same starting position.

### Validation Does Not Mean Sanitization

The import validators confirm shape, but they do not remove extra fields.

That is why the repository should still avoid trusting or spreading imported objects blindly.

## Mental Model

The clean separation is:

```text
Component
  chooses file and import mode

Client helper
  sends JSON to API

API route
  validates request and gets user id

Repository
  performs database transaction

Database
  stores notebooks/cells with new IDs and timestamps
```

Each layer has a small job. The backend should never trust IDs, timestamps, or user ownership from the imported file.

## Testing Checklist

Backend import is working when:

```text
append creates new notebooks after existing notebooks
replace deletes only the current user's notebooks
cells import with correct order
text content imports correctly
drawing data imports correctly
heightPx is preserved
new database IDs are generated
imported notebooks persist after refresh
invalid import payloads return 400
server errors return 500
the response shape is { notebooks }
```

Useful checks:

```bash
pnpm check
pnpm exec tsc --noEmit
pnpm build
```

