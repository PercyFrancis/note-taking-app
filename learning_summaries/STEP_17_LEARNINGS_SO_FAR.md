# Step 17 Learnings So Far - API Routes And Real Storage

Step 17 moves the app beyond browser-only storage.

The current app already supports local persistence with `localStorage` and manual backup with JSON import/export. Step 17 starts the transition toward deployed storage using API routes and a real database.

The current direction is:

```text
Client Components
  -> client API helpers
    -> Next.js API route handlers
      -> server repository functions
        -> Neon Postgres
```

The most important shift is that storage is no longer only a browser concern. Once the app is deployed, data should live in a server-side database so it can work across devices and later support user accounts.

## Decisions Made

The main choices made so far are:

- Use API routes / Route Handlers instead of Server Actions.
- Use Neon Postgres for deployed storage.
- Use a structured database schema instead of storing each notebook as one JSON blob.
- Include a `users` table from the start.
- Add Clerk auth later.
- Use raw SQL because SQL learning is part of the goal.
- Use the Neon serverless driver for database access.
- Use SQL migration files instead of an ORM migration system for now.

## Main Concept: API Routes

In the Next.js App Router, API routes are created with `route.ts` files.

For example:

```text
app/api/notebooks/route.ts
```

maps to:

```text
/api/notebooks
```

The route file exports functions named after HTTP methods:

```ts
export async function GET() {
  // read data
}

export async function POST(request: Request) {
  // create data
}
```

Unlike `page.tsx`, a route file does not render JSX. It returns an HTTP response:

```ts
return Response.json({ notebooks });
```

## Main Concept: Route Files Should Stay Thin

The route file should handle HTTP concerns:

```text
read the request
validate input
call a server helper
return JSON
return the right status code
```

The route file should not contain all database logic directly.

Instead, database logic should live in a repository file:

```text
lib/server/notebook-repository.ts
```

The current shape is:

```text
app/api/notebooks/route.ts
  imports getNotebooks and createNotebook

lib/server/notebook-repository.ts
  owns server-side data helper functions
```

This separation matters because API route files can otherwise become too large and difficult to test.

## Main Concept: Client API Helpers

The app should not fill React components with raw `fetch()` calls.

Instead, client-facing HTTP helpers live in:

```text
lib/client/notebook-api.ts
```

The current helpers are:

```text
loadRemoteNotebooks()
createRemoteNotebook()
```

These helpers hide the details of:

```text
which URL to call
which HTTP method to use
which headers to send
how to validate the JSON response
what error to throw
```

That keeps `NotebookApp.tsx` focused on React state and user interactions.

## Main Concept: Runtime Validation

TypeScript types only exist at compile time.

API request bodies and API responses are runtime data. They should be treated as `unknown` until validated.

For example:

```ts
const body: unknown = await request.json();
```

At that point, the body could be anything:

```text
null
string
number
object with missing fields
object with wrong field types
```

Type guards prove the shape:

```ts
if (!isCreateNotebookInput(body)) {
  return Response.json(
    { error: "Invalid notebook input" },
    { status: 400 },
  );
}
```

After that check, TypeScript knows `body` is a valid `CreateNotebookInput`.

## Main Concept: Shared Validation File

Validation was moved into:

```text
lib/notebook-validation.ts
```

This file now validates shared runtime data, including:

```text
Notebook
NotebookExport
StoredNotebooks
CreateNotebookInput
NotebooksResponse
NotebookResponse
```

This keeps validation reusable across:

```text
localStorage loading
JSON import/export
API route request bodies
client-side API responses
```

The important dependency direction is:

```text
types.ts
  shared TypeScript types

notebook-validation.ts
  imports types and validates unknown values

notebook-storage.ts
  imports validation helpers

route.ts
  imports validation helpers
```

`notebook-validation.ts` should not import from `notebook-storage.ts`.

## Main Concept: GET Versus POST

The first API route supports:

```text
GET /api/notebooks
```

This means:

```text
load notebooks
```

The route currently returns:

```json
{
  "notebooks": []
}
```

The first write endpoint is:

```text
POST /api/notebooks
```

This means:

```text
create one notebook
```

For structured database storage, `POST /api/notebooks` is a better first write operation than `PUT /api/notebooks`.

`PUT /api/notebooks` sounds like replacing the entire notebook collection, which matched the old `localStorage` model but does not fit the structured database model as well.

## Main Concept: Structured Storage

The app currently stores notebooks as nested objects:

```text
Notebook
  cells[]
```

The structured database design separates this into tables:

```text
users
notebooks
cells
```

The relationship is:

```text
one user has many notebooks
one notebook has many cells
```

This is more work than storing a single JSON blob, but it is better for:

- updating one cell at a time
- deleting one cell at a time
- reordering cells
- searching text cells later
- attaching notebooks to users
- supporting auth and multi-device sync

## Main Concept: Include Users From The Start

Even before Clerk auth is implemented, the schema should include a `users` table.

The planned shape is:

```text
users.id
users.clerk_user_id
users.email
users.name
users.created_at
users.updated_at
```

The app should use its own internal user ID:

```text
users.id
```

and also store Clerk's external user ID:

```text
users.clerk_user_id
```

This keeps the app's database model independent from the auth provider while still allowing Clerk users to be mapped to app users later.

Before Clerk is added, the app can use one development user row.

## Main Concept: Raw SQL

Because SQL learning is part of the goal, the chosen tooling is:

```text
Raw SQL + Neon serverless driver + SQL migration files
```

This means queries will look like SQL instead of ORM method chains.

For example:

```sql
select *
from notebooks
where user_id = $1
order by updated_at desc;
```

This keeps the database layer explicit.

The tradeoff is that the app must manually handle:

- SQL migration files
- query organization
- mapping database rows to TypeScript objects
- converting `snake_case` database columns to `camelCase` app fields
- making sure database access stays server-only

## Main Concept: Server-Only Database Code

The database connection should live in a server-only helper such as:

```text
lib/server/db.ts
```

The repository should import from that helper.

Client Components should never import:

```text
lib/server/db.ts
```

The browser should not see:

```text
DATABASE_URL
```

The browser calls API routes. API routes call the database.

## Current Implementation Status

The project currently has:

```text
app/api/notebooks/route.ts
lib/server/notebook-repository.ts
lib/client/notebook-api.ts
lib/notebook-validation.ts
```

`GET /api/notebooks` works and returns:

```json
{
  "notebooks": []
}
```

`POST /api/notebooks` works with a valid title and returns:

```text
201 Created
```

Invalid input, such as a numeric title, returns:

```text
400 Bad Request
```

The repository still uses temporary placeholder logic. It creates a valid notebook object, but it does not persist data to Neon yet.

## What Was Verified

The current API route and helpers were checked with:

```bash
pnpm check
pnpm exec tsc --noEmit
```

Both passed.

The API route was also tested manually:

```text
GET /api/notebooks
POST /api/notebooks
```

## What Has Not Been Done Yet

Step 17 has not yet added:

- Neon project setup.
- `.env` database connection variables.
- `lib/server/db.ts`.
- SQL migration files.
- Real `users`, `notebooks`, and `cells` tables.
- Real database reads.
- Real database writes.
- Clerk authentication.
- User-scoped API routes.
- Notebook update/delete endpoints.
- Cell create/update/delete endpoints.
- Remote save debouncing.
- Loading, saving, and error UI states.

## Mental Model To Keep

The app is moving from:

```text
React state
  -> localStorage
```

to:

```text
React state
  -> client API helper
  -> API route
  -> server repository
  -> Neon Postgres
```

The key idea is:

```text
The browser owns the UI. The API route owns the HTTP boundary. The repository owns database access. The database owns deployed persistence.
```

## Key Takeaways

- API routes live in `app/api/.../route.ts`.
- Route handlers export HTTP method functions like `GET` and `POST`.
- Route handlers return `Response` objects, not JSX.
- Client Components should call API routes with `fetch()`.
- React components should use client API helpers instead of raw `fetch()` everywhere.
- API request bodies should be treated as `unknown`.
- Type guards validate runtime data.
- `400` means the client sent invalid input.
- `500` means the server failed.
- `201` means a resource was created.
- Structured tables fit the notebook/cell model better than one large JSON blob.
- A `users` table should exist before Clerk is added.
- Keep an internal `users.id` and a separate `users.clerk_user_id`.
- Raw SQL is a good fit when learning SQL is part of the goal.
- Database code must stay server-side.
- The current API shape works, but persistence is still temporary.
