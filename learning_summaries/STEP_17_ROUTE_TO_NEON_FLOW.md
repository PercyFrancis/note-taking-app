# Step 17 Learnings - Route Handler To Neon Write Flow

This summary explains how a request to `POST /api/notebooks` creates real rows in the Neon Postgres database.

The most important idea is:

```text
route.ts does not directly own the database logic.
route.ts receives and validates the HTTP request.
notebook-repository.ts writes to Neon.
```

The full flow is:

```text
Browser or client helper
  -> POST /api/notebooks
    -> app/api/notebooks/route.ts
      -> validate request body
      -> get current user ID
      -> call createNotebook(userId, body)
        -> lib/server/notebook-repository.ts
          -> create a Notebook object
          -> run SQL transaction
            -> insert notebook row
            -> insert cell rows
              -> Neon Postgres
      -> return JSON response
```

## Main Concept: The Browser Calls An API Route

The browser does not connect directly to Neon.

Instead, browser-side code calls:

```text
POST /api/notebooks
```

Conceptually, the client request looks like:

```ts
await fetch("/api/notebooks", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: "New notebook",
  }),
});
```

This sends JSON to the Next.js route handler.

The browser only knows the app URL:

```text
/api/notebooks
```

It does not know:

```text
DATABASE_URL
Neon hostname
database password
```

That is intentional. The database connection string is a server-side secret.

## Main Concept: `route.ts` Is The HTTP Boundary

The file:

```text
app/api/notebooks/route.ts
```

handles requests to:

```text
/api/notebooks
```

The `POST` function handles create requests:

```ts
export async function POST(request: Request) {
  // handle POST /api/notebooks
}
```

This function receives a `Request` object from Next.js.

The `Request` contains things like:

```text
HTTP method
headers
request body
```

For notebook creation, the important part is the JSON body.

## Main Concept: The Request Body Starts As Unknown

The route reads the request body:

```ts
const body: unknown = await request.json();
```

The type is `unknown` because data from the browser cannot be trusted yet.

The body could be:

```text
{ title: "My notebook" }
{ title: 123 }
null
"hello"
{}
```

So the route must validate it before using it.

## Main Concept: Runtime Validation Protects The API

The route uses:

```ts
isCreateNotebookInput(body)
```

to check whether the body has the right shape.

The expected shape is:

```ts
interface CreateNotebookInput {
  title: string;
}
```

If validation fails, the route returns:

```ts
return Response.json(
  { error: "Invalid notebook input" },
  { status: 400 },
);
```

`400` means:

```text
The client sent a bad request.
```

After validation succeeds, TypeScript knows:

```text
body is a CreateNotebookInput
```

So it is safe to pass to:

```ts
createNotebook(...)
```

## Main Concept: The Route Gets The Current User

The route calls:

```ts
await getCurrentUserId()
```

Right now, this returns the temporary development user ID:

```text
00000000-0000-0000-0000-000000000001
```

That ID matches the development user inserted by the first migration.

The temporary helper exists so the route already has the correct future shape:

```text
resolve current user
call repository with user ID
return only that user's data
```

Later, Clerk will replace the inside of `getCurrentUserId()`.

The rest of the route can keep the same general shape.

## Main Concept: The Route Calls The Repository

The key line in the route is:

```ts
const notebook = await createNotebook(await getCurrentUserId(), body);
```

This line passes two things into the repository:

```text
userId:
  which user owns the new notebook

body:
  validated notebook creation input
```

The route does not write SQL itself.

Instead, it delegates to:

```text
lib/server/notebook-repository.ts
```

This keeps responsibilities separate:

```text
route.ts:
  HTTP request/response logic

notebook-repository.ts:
  database read/write logic
```

## Main Concept: The Repository Creates The App Object

Inside `createNotebook()`, the repository first creates a normal app-level notebook object.

It uses:

```ts
createDefaultNotebook()
```

That helper creates:

```text
notebook ID
notebook title
default text cell
default drawing cell
createdAt timestamp
updatedAt timestamp
```

Then the title is replaced with the request title:

```ts
const notebook = {
  ...createDefaultNotebook(),
  title: input.title,
};
```

This means the object returned to the frontend is the same object that gets saved to the database.

## Main Concept: One Notebook Becomes Multiple Database Rows

In TypeScript, the notebook is nested:

```text
Notebook
  cells[]
```

In the database, it is relational:

```text
notebooks table
cells table
```

So one created notebook becomes:

```text
one row in notebooks
one row in cells for the text cell
one row in cells for the drawing cell
```

The parent row is:

```text
notebooks.id
```

The child rows point back to it with:

```text
cells.notebook_id
```

## Main Concept: `sql.transaction(...)`

The repository uses:

```ts
await sql.transaction((txn) => [
  notebook insert query,
  cell insert query,
  cell insert query,
]);
```

A transaction means:

```text
all queries succeed together
or all queries fail together
```

That matters because creating a notebook is not one database insert.

It is several inserts:

```text
insert notebook
insert text cell
insert drawing cell
```

Without a transaction, this bad state could happen:

```text
notebook row inserted
text cell row inserted
drawing cell insert failed
```

Then the database would contain a partially created notebook.

With a transaction, if any insert fails, the whole create operation fails.

## Main Concept: `txn` Builds Transaction Queries

Inside:

```ts
sql.transaction((txn) => [
  ...
])
```

`txn` is a transaction-scoped query function.

It is used like:

```ts
txn`
  insert into notebooks (...)
  values (...)
`
```

Each `txn` template creates one query that belongs to the transaction.

The callback returns an array of transaction queries.

For the default notebook, the array contains:

```text
1. insert notebook row
2. insert text cell row
3. insert drawing cell row
```

## Main Concept: Parameterized SQL

Values are inserted with template placeholders:

```ts
${notebook.id}
${userId}
${notebook.title}
```

These are not pasted directly into the SQL string.

They become query parameters.

That protects against:

```text
broken SQL caused by quotes
SQL injection
manual escaping mistakes
```

So this is good:

```ts
txn`
  insert into notebooks (id, user_id, title)
  values (${notebook.id}, ${userId}, ${notebook.title})
`
```

This would be bad:

```ts
`insert into notebooks (title) values ('${notebook.title}')`
```

The bad version builds SQL with raw strings.

## Main Concept: Saving The Notebook Row

The notebook insert saves:

```text
id
user_id
title
created_at
updated_at
```

Those values come from:

```text
notebook.id
userId
notebook.title
notebook.createdAt
notebook.updatedAt
```

The important ownership field is:

```text
user_id
```

That connects the notebook to the current user.

Later, when Clerk is added, this same field will connect notebooks to real signed-in users.

## Main Concept: Saving The Cell Rows

The repository loops over:

```ts
notebook.cells
```

and creates one insert query per cell.

The `.map()` callback receives:

```text
cell:
  the current cell object

position:
  the current array index
```

For the default notebook:

```text
text cell position 0
drawing cell position 1
```

That position is stored in:

```text
cells.position
```

Later, `getNotebooks()` loads cells with:

```sql
order by position asc
```

That preserves cell order.

## Main Concept: Text Cells And Drawing Cells Use Different Columns

Text cells store content in:

```text
content
```

Drawing cells store canvas data in:

```text
drawing
```

The insert uses conditional values:

```ts
cell.type === "text" ? cell.content : null
cell.type === "drawing" ? cell.drawing : null
```

For a text cell:

```text
content = ""
drawing = null
```

For a drawing cell:

```text
content = null
drawing = null initially
```

Later, once drawing saves are connected to the API:

```text
drawing = "data:image/png;base64,..."
```

## Main Concept: Timestamp Conversion

The app currently stores timestamps as JavaScript numbers:

```ts
Date.now()
```

That produces milliseconds.

Postgres timestamps use:

```text
timestamptz
```

The SQL converts milliseconds to Postgres timestamps with:

```sql
to_timestamp(milliseconds / 1000.0)
```

The division is needed because:

```text
JavaScript Date.now() -> milliseconds
Postgres to_timestamp() -> seconds
```

When reading data back, `getNotebooks()` converts the timestamps back:

```ts
new Date(row.created_at).getTime()
```

So the database can store real timestamps while the existing frontend can keep using numbers.

## Main Concept: Returning The Notebook

After the transaction succeeds, the repository returns:

```ts
return notebook;
```

That object is sent back by the route:

```ts
return Response.json({ notebook }, { status: 201 });
```

`201` means:

```text
Created
```

The frontend can immediately add the returned notebook to React state.

## Main Concept: `GET` Confirms The Write

After `POST /api/notebooks` writes to Neon, `GET /api/notebooks` can read the same data back.

The read flow is:

```text
GET /api/notebooks
  -> getCurrentUserId()
  -> getNotebooks(userId)
  -> select notebook rows
  -> select cell rows
  -> group cells by notebook
  -> return Notebook[]
```

This proves that the data is no longer temporary in-memory data.

It is stored in Neon.

## Main Concept: File Responsibilities

The main files in this flow are:

```text
app/api/notebooks/route.ts
```

Handles HTTP:

```text
read request
validate body
get current user
call repository
return response
```

```text
lib/server/current-user.ts
```

Temporarily returns the development user ID.

Later, it will resolve the Clerk user.

```text
lib/server/notebook-repository.ts
```

Owns notebook database logic:

```text
getNotebooks()
createNotebook()
row mapping
transactions
```

```text
lib/server/db.ts
```

Owns the Neon connection helper:

```text
DATABASE_URL
neon(databaseUrl)
sql
```

```text
db/migrations/*.sql
```

Define the database tables that the repository writes to.

## What Was Verified

The database write flow was verified by:

```text
POST /api/notebooks
```

which returned:

```text
201 Created
```

Then:

```text
GET /api/notebooks
```

returned the notebook from Neon.

This confirms:

```text
the route works
validation passes
createNotebook writes to Neon
getNotebooks reads from Neon
the saved notebook has cells
```

## Mental Model To Keep

The route does not directly write data.

Instead:

```text
route.ts receives the request
route.ts validates the request
route.ts resolves the current user
route.ts calls the repository
repository writes to Neon
route.ts returns the result
```

The most important architectural boundary is:

```text
HTTP logic belongs in route.ts.
Database logic belongs in repository files.
Database connection setup belongs in db.ts.
```

## Key Takeaways

- The browser calls `/api/notebooks`; it does not connect to Neon.
- `DATABASE_URL` stays server-side.
- `route.ts` is the HTTP boundary.
- `request.json()` returns untrusted runtime data.
- Type guards validate request bodies before use.
- `getCurrentUserId()` gives the route a user-scoped shape.
- `createNotebook(userId, input)` owns the actual write.
- A TypeScript `Notebook` becomes rows in `notebooks` and `cells`.
- `sql.transaction(...)` makes notebook creation atomic.
- `txn` creates queries that belong to the transaction.
- Template SQL placeholders are parameterized and safe.
- Cell `position` preserves notebook order.
- App timestamps are milliseconds; Postgres timestamps are seconds/date values.
- `POST /api/notebooks` writes data.
- `GET /api/notebooks` reads the saved data back.
- Keeping route, repository, and database connection responsibilities separate makes the app easier to extend.
