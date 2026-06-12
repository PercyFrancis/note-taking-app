# Step 12 Learnings - Improved Search

Step 12 made sidebar search more useful.

Before this step, search only matched notebook titles. After this step, search can match notebook titles and text cell content. The sidebar can also show a small preview from the first matching text cell.

The main goal was to learn how to compute search results from current state instead of storing separate search-result state.

## What Changed

Step 12 updated:

- `lib/utils.ts`
- `components/notebook/NotebookApp.tsx`
- `components/notebook/NotebookSidebar.tsx`

The main features added were:

- Normalize search text before comparing it.
- Search notebook titles.
- Search text cell content.
- Ignore drawing cells for now because they do not contain searchable text.
- Create a short preview from the first matching text cell.
- Show the preview under the notebook title in the sidebar.
- Show an empty message when no notebooks match.

## Main Concept: Derived State

Search results are derived state.

Derived state means:

```text
Values calculated from existing state.
```

The existing state is:

```ts
notebooks
searchQuery
```

The filtered notebooks can be calculated from those values:

```ts
const filteredNotebooks = notebooks.filter((notebook) =>
  notebookMatchesSearch(notebook, searchQuery),
);
```

This means the app does not need a separate state variable like:

```ts
const [searchResults, setSearchResults] = useState(...)
```

That would be risky because `searchResults` could get out of sync with `notebooks` or `searchQuery`.

The important rule is:

```text
If a value can be calculated from current state, calculate it instead of storing it.
```

## Main Concept: Case-Insensitive Search

Users expect search to ignore capitalization.

These should all match:

```text
physics
Physics
PHYSICS
```

The helper for this is:

```ts
export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}
```

This does two things:

```text
trim():
  removes extra spaces from the beginning and end.

toLowerCase():
  makes comparisons case-insensitive.
```

For example:

```ts
normalizeSearchText("  Physics  ")
```

returns:

```ts
"physics"
```

This helper keeps the rest of the search code from repeating:

```ts
trim().toLowerCase()
```

## Main Concept: Matching A Notebook

The app needs to decide whether each notebook should appear in the sidebar.

A notebook matches when:

```text
the notebook title matches
OR
at least one text cell matches
```

The helper is:

```ts
export function notebookMatchesSearch(
  notebook: Notebook,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery === "") {
    return true;
  }

  const titleMatches = normalizeSearchText(notebook.title).includes(
    normalizedQuery,
  );

  const textCellMatches = notebook.cells.some((cell) => {
    if (cell.type !== "text") {
      return false;
    }

    return normalizeSearchText(cell.content).includes(normalizedQuery);
  });

  return titleMatches || textCellMatches;
}
```

This function returns:

```text
true:
  show this notebook.

false:
  hide this notebook from the filtered sidebar list.
```

## Main Concept: Empty Search Query

This condition handles an empty search:

```ts
if (normalizedQuery === "") {
  return true;
}
```

That means:

```text
If the user has not searched for anything, every notebook should be visible.
```

Without this check, empty search behavior would depend on string matching details instead of being explicit.

## Main Concept: `.includes()`

The title search uses:

```ts
normalizeSearchText(notebook.title).includes(normalizedQuery)
```

`.includes()` checks whether one string contains another string.

For example:

```ts
"physics notes".includes("physics")
```

returns:

```ts
true
```

and:

```ts
"physics notes".includes("chemistry")
```

returns:

```ts
false
```

## Main Concept: `.some()`

Text cell matching uses:

```ts
notebook.cells.some((cell) => {
  ...
});
```

`.some()` answers a yes-or-no question:

```text
Does at least one item in this array pass the test?
```

For search, the question is:

```text
Does this notebook have at least one text cell containing the query?
```

This is a good fit because `notebookMatchesSearch()` only needs to return `true` or `false`.

It does not need to return the matching cell.

## Main Concept: Type Narrowing

The cells array contains more than one type of cell:

```ts
NotebookCell = TextCell | DrawingCell
```

Only text cells have:

```ts
content
```

Drawing cells do not.

That is why the code checks:

```ts
if (cell.type !== "text") {
  return false;
}
```

After this check, TypeScript understands that the cell is a `TextCell` inside that block.

Then this is safe:

```ts
cell.content
```

This is called type narrowing.

## Main Concept: Finding The First Matching Text Cell

Showing a sidebar preview requires the actual matching text cell.

The function is:

```ts
export function findFirstMatchingTextCell(
  notebook: Notebook,
  query: string,
): TextCell | null {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery === "") {
    return null;
  }

  for (const cell of notebook.cells) {
    if (cell.type !== "text") {
      continue;
    }

    if (normalizeSearchText(cell.content).includes(normalizedQuery)) {
      return cell;
    }
  }

  return null;
}
```

This helper returns either:

```ts
TextCell
```

or:

```ts
null
```

`null` means:

```text
No matching text cell was found.
```

## Main Concept: `for...of`

The helper uses a `for...of` loop:

```ts
for (const cell of notebook.cells) {
  ...
}
```

This means:

```text
Look at each cell in notebook.cells, one at a time.
```

The loop is useful here because it is easy to read:

```text
Skip drawing cells.
Check text cells.
Return the first text cell that matches.
Return null if none match.
```

## Main Concept: `continue`

Inside the loop:

```ts
if (cell.type !== "text") {
  continue;
}
```

`continue` means:

```text
Skip the rest of this loop iteration and move to the next cell.
```

So drawing cells are ignored.

That keeps the rest of the loop focused on text cells only.

## Main Concept: `.find()` Versus `for...of`

An earlier version used `.find()`.

The idea was:

```ts
notebook.cells.find((cell) => {
  ...
});
```

`.find()` returns the first item that passes a test.

However, TypeScript may still infer the result as:

```ts
NotebookCell | undefined
```

instead of:

```ts
TextCell | undefined
```

That can cause this error:

```text
Type 'NotebookCell | null' is not assignable to type 'TextCell | null'.
```

The `for...of` version avoids that extra TypeScript complexity because the function directly returns only after TypeScript has narrowed the cell to `TextCell`.

## Main Concept: Type Predicates

The `.find()` version can also be fixed with a type predicate:

```ts
(cell): cell is TextCell => {
  ...
}
```

This means:

```text
If this callback returns true, TypeScript may treat cell as a TextCell.
```

That is useful, but it is more advanced TypeScript.

For this step, the `for...of` version is easier to understand.

## Main Concept: Creating A Search Preview

The sidebar should not show an entire cell's content.

It should show a short preview:

```ts
export function createSearchPreview(text: string, maxLength = 80): string {
  const singleLineText = text.trim().replace(/\s+/g, " ");

  if (singleLineText.length <= maxLength) {
    return singleLineText;
  }

  return `${singleLineText.slice(0, maxLength)}...`;
}
```

This function turns cell content into a compact one-line string.

## Main Concept: Cleaning Whitespace

This line cleans the preview:

```ts
const singleLineText = text.trim().replace(/\s+/g, " ");
```

`trim()` removes extra whitespace from the beginning and end.

The regular expression:

```ts
/\s+/g
```

means:

```text
Find every run of one or more whitespace characters.
```

That includes:

- Spaces.
- Newlines.
- Tabs.

Replacing those with one space makes multiline text fit better in the sidebar.

For example:

```text
First line

Second      line
```

becomes:

```text
First line Second line
```

## Main Concept: Shortening Long Text

This condition checks whether the preview is already short enough:

```ts
if (singleLineText.length <= maxLength) {
  return singleLineText;
}
```

If it is too long, this returns a shortened version:

```ts
return `${singleLineText.slice(0, maxLength)}...`;
```

`slice(0, maxLength)` takes the first part of the string.

The `...` tells the user:

```text
This preview was shortened.
```

## Main Concept: Combining Find And Preview

The convenience helper is:

```ts
export function getNotebookSearchPreview(
  notebook: Notebook,
  query: string,
): string | null {
  const matchingCell = findFirstMatchingTextCell(notebook, query);

  if (!matchingCell) {
    return null;
  }

  return createSearchPreview(matchingCell.content);
}
```

This combines two smaller helpers:

```text
findFirstMatchingTextCell:
  find the matching text cell.

createSearchPreview:
  shorten its content for display.
```

The sidebar does not need to know how matching works.

It can simply ask:

```ts
const searchPreview = getNotebookSearchPreview(notebook, searchQuery);
```

## Main Concept: Filtering In `NotebookApp`

`NotebookApp` owns the notebook state.

So it computes the filtered notebooks:

```ts
const filteredNotebooks = notebooks.filter((notebook) =>
  notebookMatchesSearch(notebook, searchQuery),
);
```

This keeps the state flow clear:

```text
NotebookApp owns notebooks.
NotebookApp owns searchQuery.
NotebookApp computes filteredNotebooks.
NotebookApp passes filteredNotebooks to NotebookSidebar.
```

The sidebar receives the notebooks it should display.

It does not need to filter the list itself.

## Main Concept: Passing Search Query To The Sidebar

The sidebar receives:

```tsx
searchQuery={searchQuery}
```

This has two purposes:

```text
1. Keep the search input controlled.
2. Let the sidebar create previews for matching text cells.
```

The input uses:

```tsx
value={searchQuery}
```

and:

```tsx
onChange={(event) => onSearchChange(event.target.value)}
```

That means the input value comes from React state, and typing updates that state.

## Main Concept: Rendering A Preview In The Sidebar

Inside the sidebar's notebook map, each notebook gets a preview:

```ts
const searchPreview = getNotebookSearchPreview(notebook, searchQuery);
```

Then the preview renders conditionally:

```tsx
{searchPreview ? (
  <span className="...">
    {searchPreview}
  </span>
) : null}
```

This means:

```text
If there is a preview, show it.
If there is no preview, render nothing.
```

The preview is placed under the notebook title, so the user can see why a notebook matched.

## Main Concept: Conditional Rendering With `? : null`

This pattern:

```tsx
{searchPreview ? (
  <span>{searchPreview}</span>
) : null}
```

means:

```text
Render the span only when searchPreview has a value.
```

If `searchPreview` is `null`, React renders nothing for that spot.

This is useful for optional UI.

## Main Concept: Empty Search State

When no notebooks match, the sidebar shows:

```text
No notebooks found.
```

That is clearer than rendering an empty sidebar.

The structure is:

```tsx
{notebooks.length === 0 ? (
  <p>No notebooks found.</p>
) : (
  notebooks.map(...)
)}
```

Since `NotebookSidebar` receives filtered notebooks, `notebooks.length === 0` means:

```text
No notebooks matched the current search.
```

## Main Concept: Drawing Cell Search Decision

Step 12 asked whether drawing cells should match by title only or by a label.

The current decision is:

```text
Drawing cells do not match directly yet.
```

That is reasonable because drawing cells currently store:

```ts
drawing: string | null
```

That value is an image data URL, not searchable text.

Drawing cells can still be found indirectly if the notebook title matches.

Later, drawing cells could become searchable if they get:

- Captions.
- Labels.
- Alt text.
- OCR text.

## Main Concept: Search Helpers Keep Components Cleaner

The search rules live in `lib/utils.ts`.

That keeps component files focused on UI.

The split is:

```text
lib/utils.ts:
  knows how search matching works.

NotebookApp.tsx:
  computes which notebooks to show.

NotebookSidebar.tsx:
  renders the search input, notebook list, previews, and empty state.
```

This makes the code easier to change later.

For example, if previews should strip Markdown syntax later, that change can happen in the helper instead of being scattered through the sidebar.

## What Was Verified

Step 12 was checked with:

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

## What Step 12 Did Not Do

Step 12 did not add:

- Highlighting the matching text inside previews.
- Markdown stripping for cleaner previews.
- Search result ranking.
- Search across drawing cell captions.
- Search inside rendered math.
- Search persistence.
- Debounced search input.
- Keyboard navigation through search results.

Those can be considered later.

## Mental Model To Keep

Step 12 introduced this search flow:

```text
User types in the search input
  -> NotebookSidebar calls onSearchChange
  -> NotebookApp updates searchQuery
  -> NotebookApp recalculates filteredNotebooks
  -> notebookMatchesSearch checks title and text cells
  -> NotebookSidebar renders the filtered list
  -> getNotebookSearchPreview creates optional text previews
```

The most important idea is:

```text
Search results are calculated from current notebook data and the current query.
```

## Key Takeaways

- Search results should be derived from existing state.
- Do not store `searchResults` separately if they can be computed.
- Normalizing text with `trim().toLowerCase()` makes search more forgiving.
- `.includes()` checks whether one string contains another.
- `.some()` is useful when you only need to know whether at least one item matches.
- A `for...of` loop can make TypeScript narrowing easier to read.
- Drawing cells should not be searched directly until they have text metadata.
- Search previews help explain why a notebook matched.
- Preview text should be shortened before rendering in the sidebar.
- `replace(/\s+/g, " ")` turns multiline text into a single readable line.
- Conditional rendering is useful for optional previews and empty states.
- `NotebookApp` should compute the filtered notebook list.
- `NotebookSidebar` should render the filtered notebooks and previews.
- Search helper functions keep UI components simpler.
- Step 12 completed notebook title search, text-cell search, and sidebar previews.
