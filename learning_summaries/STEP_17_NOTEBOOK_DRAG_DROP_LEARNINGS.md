# Step 17 Learnings - Notebook Drag And Drop

This summary covers the notebook sidebar drag-and-drop work. The goal was to let notebooks be reordered in the sidebar and persist that order in the database.

The main flow is:

```text
Sidebar drag handle
  -> NotebookApp reorder function
    -> client API helper
      -> Next.js API route
        -> repository function
          -> Neon Postgres position updates
```

## Notebook Position

Manual ordering needs a stable database field. Sorting notebooks by `updated_at` is not enough because editing a notebook could unexpectedly move it.

The database table now stores:

```sql
position integer not null
```

The ordering rule is:

```text
lower position means higher in the sidebar
```

For example:

```text
0: Notebook A
1: Notebook B
2: Notebook C
```

The app-level `Notebook` type does not need a `position` property. The array order represents notebook order in React. The database row type, `NotebookRow`, does include `position` because it mirrors the database result.

## Loading Order

The repository owns the main sorting logic:

```sql
order by position asc
```

The sidebar should not sort notebooks itself. It should render the `notebooks` array in the order it receives.

## Create And Delete Position Maintenance

New notebooks were designed to appear at the top.

Creating a notebook shifts existing notebooks down:

```text
0 -> 1
1 -> 2
2 -> 3
```

Then the new notebook is inserted at:

```text
position = 0
```

Deleting a notebook needs the opposite adjustment. If a notebook is deleted from the middle, later notebooks shift up:

```text
before:
0: A
1: B
2: C

delete B

after:
0: A
1: C
```

This was implemented with a CTE so the deleted notebook's old `position` could be reused by the follow-up update.

## CTE Chaining

CTEs let one SQL statement have named intermediate results.

The delete flow used this idea:

```sql
with deleted_notebook as (
  delete ...
  returning id, user_id, position
),
shifted_notebooks as (
  update ...
  where position > (select position from deleted_notebook)
)
select id from deleted_notebook
```

`returning` is what makes the deleted row's data available to the next CTE.

This matters because after the notebook is deleted, the app still needs its old position to know which later notebooks should shift.

## Reorder Request Shape

Notebook reorder follows the existing cell reorder pattern.

The request body shape is:

```ts
export interface ReorderNotebooksInput {
  notebookIds: string[];
}
```

The array is the final desired order:

```ts
{
  notebookIds: ["notebook-c", "notebook-a", "notebook-b"]
}
```

That means:

```text
notebook-c -> position 0
notebook-a -> position 1
notebook-b -> position 2
```

## Runtime Validation

`isReorderNotebooksInput` validates external request data before the repository uses it.

The validator checks:

```text
the value is an object
notebookIds is an array
the array is not empty
every ID is UUID-shaped
there are no duplicate IDs
```

The empty-array check exists because reorder means "here is the complete new order." An empty list is usually a bad request, not a useful reorder.

## Reorder SQL

The repository function uses:

```sql
unnest($2::uuid[]) with ordinality
```

`unnest` turns an array into rows.

`with ordinality` adds a position number based on the array order.

Postgres ordinality starts at `1`, so the app stores:

```sql
requested_order.position - 1
```

That converts the order to zero-based positions.

The repository also checks that the submitted IDs exactly match the user's notebooks:

```text
no missing notebooks
no extra notebooks
no duplicate notebooks
```

Only then does it update:

```sql
notebooks.position
notebooks.updated_at
```

## API Route

Notebook reorder uses:

```text
PATCH /api/notebooks/reorder
```

This route has no dynamic `[notebookId]` segment, so the route handler only needs:

```ts
export async function PATCH(request: Request)
```

It does not need:

```ts
{ params }
```

The current user comes from:

```ts
getCurrentUserId()
```

The ordered IDs come from:

```ts
await request.json()
```

## Client Helper

The client helper hides the raw `fetch` call from React components:

```ts
reorderRemoteNotebooks(input)
```

It sends:

```text
PATCH /api/notebooks/reorder
```

with a JSON body:

```ts
JSON.stringify(input)
```

This mirrors the existing `reorderRemoteCells` helper, but does not need a `notebookId` URL parameter.

## Optimistic UI

`NotebookApp` owns notebook state, so it owns the reorder function.

The reorder function:

```text
creates a reordered notebook array
checks whether the order actually changed
updates React state immediately
saves the new order to the server
```

The important local update is:

```ts
setNotebooks(nextNotebooks)
```

Without that, the database could save correctly but the sidebar would not visually move until reload.

## Drag And Drop Component Structure

The final UI structure mirrors the existing cell drag-and-drop setup:

```text
NotebookSidebar
  owns DragDropProvider
  maps notebooks
  passes each notebook to NotebookSidebarRow

NotebookSidebarRow
  owns useSortable
  renders one row
  renders a drag handle
```

This separation matters because:

```text
the provider belongs around the list
useSortable belongs inside each row
key belongs on the component returned by map
```

The correct list pattern is:

```tsx
notebooks.map((notebook, index) => (
  <NotebookSidebarRow
    key={notebook.id}
    notebook={notebook}
    index={index}
  />
))
```

The `key` should not be placed inside `NotebookSidebarRow`; React needs it on the mapped element.

## useSortable

Each row uses:

```ts
const { ref, handleRef, isDragging } = useSortable({
  id: notebook.id,
  index,
});
```

`id` uniquely identifies the draggable notebook.

`index` tells the library where the notebook currently appears.

`ref` connects the sortable behavior to the row element.

`handleRef` connects the drag-start behavior to the drag button.

`isDragging` is used for temporary visual styling while dragging.

## Drag Handle

The whole row is not used as the drag handle because the row already has other interactions:

```text
select notebook
delete notebook
later possibly rename or open a menu
```

A dedicated drag handle avoids accidental reordering.

The row structure is:

```text
[Drag] [notebook title/search preview] [delete]
```

## Search And Reorder

Drag reorder is disabled while searching.

This is needed because search shows a filtered list. Drag indexes from the filtered list do not safely match indexes in the full notebook list.

The sidebar computes:

```ts
const isReorderDisabled = searchQuery.trim() !== "";
```

This value is recalculated every React render.

Typing in the search box updates `searchQuery` in `NotebookApp`, which causes `NotebookApp` and then `NotebookSidebar` to re-render.

When search is active:

```text
onDragEnd returns early
useSortable receives disabled: true
the drag handle is disabled
the cursor changes to not-allowed
```

The important missing piece was:

```ts
disabled: isReorderDisabled
```

inside `useSortable`.

Disabling only the button and returning early from `onDragEnd` prevents saving, but does not necessarily prevent the drag gesture from starting. Disabling `useSortable` disables the sortable behavior itself.

## React Re-Renders

Local constants inside a React component are recalculated whenever the component renders.

For example:

```ts
const isReorderDisabled = searchQuery.trim() !== "";
```

is not calculated once forever. It runs every time `NotebookSidebar` renders with a new `searchQuery` prop.

## Verification

The final code passed:

```bash
pnpm check
pnpm exec tsc --noEmit
pnpm build
```

The build included the notebook reorder API route:

```text
/api/notebooks/reorder
```

Manual browser checks should include:

```text
drag notebooks and confirm the order changes
refresh and confirm the order persists
search and confirm dragging is disabled
clear search and confirm dragging works again
```

## Key Takeaways

- Manual ordering needs a database `position` column.
- The repository should load notebooks with `order by position asc`.
- App state can use array order instead of exposing `position` on the main `Notebook` type.
- CTEs are useful when one database operation needs data from a previous operation.
- Reorder APIs should accept the full ordered ID list.
- Runtime validators protect routes from invalid request bodies.
- `fetch` sends the ordered IDs from the client helper to the API route.
- `DragDropProvider` belongs around the sortable list.
- `useSortable` belongs inside the individual row component.
- React `key` belongs on the element returned directly by `.map()`.
- A dedicated drag handle is clearer than making the whole row draggable.
- Reorder should be disabled while the sidebar is filtered by search.
