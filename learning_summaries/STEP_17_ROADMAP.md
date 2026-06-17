# Step 17 Roadmap - Neon Postgres With API Routes

This is the current roadmap for Step 17 based on the latest decisions.

The target architecture is:

```text
Client Components
  -> lib/client/notebook-api.ts
    -> app/api/.../route.ts
      -> lib/server/notebook-repository.ts
        -> lib/server/db.ts
          -> Neon Postgres
```

The chosen database approach is:

```text
Neon Postgres
Raw SQL
Neon serverless driver
SQL migration files
Structured tables
Users table from the start
Clerk auth later
```

## 1. Choose The Storage Architecture

Use API routes as the boundary between the browser and the database.

The browser should never connect directly to Neon.

The shape should be:

```text
NotebookApp.tsx
  uses client API helpers

lib/client/notebook-api.ts
  calls fetch("/api/...")

app/api/.../route.ts
  validates requests and returns responses

lib/server/notebook-repository.ts
  runs database queries

lib/server/db.ts
  owns the Neon connection
```

Status:

```text
Chosen.
```

## 2. Extract Shared Runtime Validation

Use:

```text
lib/notebook-validation.ts
```

for runtime validation helpers.

This file should validate unknown values from:

- `localStorage`
- imported JSON files
- API request bodies
- API responses

Current validators include:

```text
isNotebook
isNotebookExport
isStoredNotebooks
isCreateNotebookInput
isNotebooksResponse
isNotebookResponse
```

Status:

```text
Done.
```

## 3. Create The First API Route

Create:

```text
app/api/notebooks/route.ts
```

This maps to:

```text
/api/notebooks
```

Status:

```text
Done.
```

## 4. Add `GET /api/notebooks`

The first read route should return notebooks.

Current placeholder response:

```json
{
  "notebooks": []
}
```

Current flow:

```text
GET /api/notebooks
  -> getNotebooks()
  -> Response.json({ notebooks })
```

Later, this route should return only notebooks owned by the current user.

Status:

```text
Done as placeholder.
```

## 5. Add `POST /api/notebooks`

The first write route should create one notebook.

Use:

```text
POST /api/notebooks
```

not:

```text
PUT /api/notebooks
```

because the structured database model should create/update individual resources instead of replacing the whole notebook collection.

The route should:

```text
read request JSON
validate CreateNotebookInput
call createNotebook()
return { notebook } with status 201
```

Status:

```text
Done as placeholder.
```

## 6. Create Client API Helpers

Use:

```text
lib/client/notebook-api.ts
```

Current helpers:

```text
loadRemoteNotebooks()
createRemoteNotebook()
```

These helpers should:

```text
call API routes with fetch
check response.ok
parse response JSON as unknown
validate response shape
return typed data
```

Status:

```text
Done for load and create.
```

## 7. Decide Database Tooling

Chosen tooling:

```text
Raw SQL
@neondatabase/serverless
SQL migration files
```

Do not use Prisma or Drizzle for now.

Reasoning:

- You know basic SQL.
- You want to keep using and learning SQL.
- The schema is small enough to manage directly.
- Raw SQL keeps the database layer explicit.

Tradeoffs:

- You must write migrations yourself.
- You must map database rows into TypeScript objects manually.
- You must keep SQL organized.
- You must convert database `snake_case` columns to app `camelCase` fields.

Status:

```text
Chosen.
```

## 8. Add Neon And Environment Variables

Install the Neon serverless driver when ready:

```bash
pnpm add @neondatabase/serverless
```

Add an environment variable for the database connection string:

```text
DATABASE_URL=...
```

The database URL must be server-only.

Do not expose it with:

```text
NEXT_PUBLIC_
```

Status:

```text
Not started.
```

## 9. Create `lib/server/db.ts`

Create:

```text
lib/server/db.ts
```

This file should:

```text
read DATABASE_URL
create the Neon SQL client
export the database query helper
```

Only server-side files should import this module.

Status:

```text
Not started.
```

## 10. Create SQL Migration Files

Create a migrations folder such as:

```text
db/
  migrations/
    001_create_users.sql
    002_create_notebooks.sql
    003_create_cells.sql
```

The exact migration runner can be decided when implementing this step.

For a learning project, running SQL manually through the Neon SQL editor is acceptable at first, as long as the SQL files are committed to the repo.

Status:

```text
Not started.
```

## 11. Create The `users` Table

Create a `users` table from the start, even before Clerk is added.

Suggested columns:

```text
id
clerk_user_id
email
name
created_at
updated_at
```

Design intent:

```text
id:
  internal app user ID

clerk_user_id:
  external Clerk user ID, added/used when Clerk auth is implemented
```

Before Clerk exists, use one development user row.

Status:

```text
Not started.
```

## 12. Create The `notebooks` Table

Suggested columns:

```text
id
user_id
title
created_at
updated_at
```

The important relationship is:

```text
notebooks.user_id -> users.id
```

This makes every notebook belong to a user from the start.

Status:

```text
Not started.
```

## 13. Create The `cells` Table

Suggested columns:

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

The important relationship is:

```text
cells.notebook_id -> notebooks.id
```

The `position` column stores the cell order inside a notebook.

For text cells:

```text
content has the Markdown/plain text
drawing is null
```

For drawing cells:

```text
content is null or empty
drawing has the canvas data URL
```

Status:

```text
Not started.
```

## 14. Add A Temporary Development User Helper

Before Clerk is added, repository functions still need a user ID.

Create a temporary helper that resolves one development user.

Conceptual flow:

```text
getCurrentUserId()
  -> return the development user's internal users.id
```

Later, this helper can be replaced with Clerk logic:

```text
read Clerk user
find or create users row
return users.id
```

Status:

```text
Not started.
```

## 15. Replace `getNotebooks()` With A Real SQL Read

Update:

```text
lib/server/notebook-repository.ts
```

so `getNotebooks(userId)` reads from Postgres.

It should:

```text
select notebooks for the user
select cells for those notebooks
group cells by notebook_id
sort cells by position
map rows into Notebook objects
return Notebook[]
```

The API response should still match the frontend model:

```ts
Notebook[]
```

Status:

```text
Not started.
```

## 16. Replace `createNotebook()` With A Real SQL Write

Update `createNotebook(userId, input)` so it inserts into Postgres.

It should:

```text
insert a notebook row
optionally insert default cells
return the created Notebook object
```

The API route should continue returning:

```json
{
  "notebook": {}
}
```

with:

```text
201 Created
```

Status:

```text
Not started.
```

## 17. Make Routes User-Scoped

Even before Clerk, repository functions should be shaped like:

```text
getNotebooks(userId)
createNotebook(userId, input)
```

Avoid repository functions that return every notebook from the database.

The route flow should become:

```text
resolve current user ID
call repository with user ID
return only that user's data
```

Status:

```text
Not started.
```

## 18. Wire `NotebookApp.tsx` To Remote Loading

Once the database-backed `GET /api/notebooks` works, update the app to load from:

```text
loadRemoteNotebooks()
```

instead of using `localStorage` as the main source of truth.

Import/export should remain as a backup path.

Status:

```text
Not started.
```

## 19. Wire Notebook Creation To The API

After `POST /api/notebooks` persists to Neon, update the New Notebook action to use:

```text
createRemoteNotebook()
```

Then update React state with the returned notebook.

Status:

```text
Not started.
```

## 20. Add Notebook Update And Delete Routes

Add routes for notebook-level actions:

```text
PATCH  /api/notebooks/[notebookId]
DELETE /api/notebooks/[notebookId]
```

These should support:

```text
renaming a notebook
deleting a notebook
```

Every query should verify the notebook belongs to the current user.

Status:

```text
Not started.
```

## 21. Add Cell Routes

Because storage is structured, cells should have their own endpoints.

Possible routes:

```text
POST   /api/notebooks/[notebookId]/cells
PATCH  /api/cells/[cellId]
DELETE /api/cells/[cellId]
PATCH  /api/notebooks/[notebookId]/cells/reorder
```

These should support:

```text
add text cell
add drawing cell
update text content
update drawing data
update height
delete cell
duplicate cell
reorder cells
```

Status:

```text
Not started.
```

## 22. Add Debounced Remote Saves

Remote saves are network requests.

Do not send a database write for every single keystroke forever.

Use debouncing for:

```text
text cell edits
drawing saves
height slider changes
```

Immediate saves are fine for:

```text
create notebook
delete notebook
create cell
delete cell
move cell
```

Status:

```text
Not started.
```

## 23. Add Loading, Saving, And Error States

Remote storage needs UI states that localStorage did not need as much.

Add states for:

```text
loading notebooks
creating notebook
saving changes
save failed
load failed
retry needed
```

Status:

```text
Not started.
```

## 24. Add Clerk Auth Later

When Clerk is added, the user flow should become:

```text
API route receives request
Clerk identifies signed-in user
app finds or creates users row by clerk_user_id
repository uses users.id
queries return only that user's data
```

The existing `users` table should make this transition easier.

Status:

```text
Planned for later.
```

## 25. Revisit Drawing Storage Later

For the first database version, drawing cells can store the canvas data URL in:

```text
cells.drawing
```

Later, if drawings become large, move image data to object storage and store only a URL or storage key in Postgres.

Status:

```text
Deferred.
```

## Current Completion Snapshot

Done:

- Validation extraction.
- First API route file.
- Placeholder `GET /api/notebooks`.
- Placeholder `POST /api/notebooks`.
- Client API helpers for loading and creating notebooks.
- Decision to use structured tables.
- Decision to include `users` from the start.
- Decision to use raw SQL and Neon serverless driver.

Next recommended implementation step:

```text
Install @neondatabase/serverless and create the first database connection helper.
```

Then:

```text
Create SQL migration files for users, notebooks, and cells.
```
