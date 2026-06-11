# Step 18 Learnings - Markdown Preview And Math Rendering

Step 18 added a richer text-cell experience without changing the notebook data model.

Before this step, text cells were plain controlled textareas. After this step, text cells can switch between writing raw Markdown and previewing rendered Markdown. The preview also supports GitHub-flavored Markdown and LaTeX-style math.

The main goal was to improve text cells while keeping storage simple.

## What Changed

Step 18 updated:

- `package.json`
- `pnpm-lock.yaml`
- `app/globals.css`
- `app/layout.tsx`
- `components/notebook/TextCellEditor.tsx`

The main features added were:

- Keep text cell storage as a plain string.
- Add a `Write | Preview` mode toggle inside each text cell.
- Render Markdown with `react-markdown`.
- Add GitHub-flavored Markdown support with `remark-gfm`.
- Add document-style Markdown CSS with Tailwind Typography.
- Add LaTeX-style math support with `remark-math`, `rehype-katex`, and KaTeX CSS.
- Improve the editor mode toggle accessibility with `fieldset` and `legend`.

## Main Concept: Storage And Rendering Are Separate

The text cell still stores content as:

```ts
content: string;
```

That means the saved data is still plain text.

For example, a cell might store:

```md
# Meeting Notes

This is **important**.

Inline math: $E = mc^2$
```

The app does not store formatted HTML or rich-text JSON. It stores the raw Markdown string.

Rendering happens later when the user switches to preview mode.

The mental model is:

```text
TextCell.content string
  -> textarea edits the string
  -> Markdown preview renders the string
```

This keeps the app easier to understand and makes future persistence simpler.

## Main Concept: Markdown Preview

Markdown preview means:

```text
Write Markdown syntax as text.
Render that Markdown as formatted content.
```

For example, this raw text:

```md
## Tasks

- [x] Add preview mode
- [ ] Add persistence
```

can render as:

```text
Tasks heading
checked task item
unchecked task item
```

The editor is still a textarea. The preview is a rendered view of the same string.

This is different from a full rich-text editor, where the user edits styled content directly.

## Main Concept: Markdown Preview Versus Markdown-First Editor

A Markdown preview answers:

```text
How do I show Markdown as formatted content?
```

A Markdown-first editor answers:

```text
How do I make writing Markdown more convenient?
```

Step 18 implemented preview first.

It did not add:

- Bold toolbar buttons.
- Heading buttons.
- Link insertion buttons.
- Table editing controls.
- Slash commands.
- A full WYSIWYG editor.

Those can be added later while still keeping Markdown as the source format.

## Main Concept: Why Not Tiptap Yet

Tiptap would provide a real rich-text editor.

That is powerful, but it would likely require a different storage shape, such as editor JSON:

```ts
content: TiptapJsonDocument;
```

For this app stage, Markdown preview is simpler because it preserves:

```ts
content: string;
```

That means persistence can still save notebooks as normal JSON without a rich-text migration step.

## Main Concept: Local Editor Mode State

The text editor now tracks whether a cell is in write mode or preview mode:

```ts
const [mode, setMode] = useState<"write" | "preview">("write");
```

This state belongs inside `TextCellEditor` because it is local UI state.

It does not need to be stored in the notebook.

The notebook should remember:

```text
What did the user write?
```

It does not need to remember:

```text
Was the cell last showing Write mode or Preview mode?
```

The mode can reset without losing note content.

## Main Concept: Conditional Rendering

The editor uses conditional rendering:

```tsx
{mode === "write" ? (
  <textarea />
) : (
  <MarkdownPreview />
)}
```

This means:

```text
If mode is "write", show the textarea.
Otherwise, show the Markdown preview.
```

Both views use the same `cell.content`.

Write mode edits the string.

Preview mode reads the string and renders it.

## Main Concept: The `Write | Preview` Toggle

The mode toggle uses two buttons:

```text
Write | Preview
```

This is clearer than one button because both available modes are visible at the same time.

The buttons use:

```tsx
aria-pressed={mode === "write"}
```

and:

```tsx
aria-pressed={mode === "preview"}
```

This communicates that the buttons behave like toggle buttons.

When the user clicks `Preview`, the app calls:

```ts
setMode("preview");
```

React then re-renders the component, and the preview branch is shown.

## Main Concept: `fieldset` And `legend`

An early accessibility idea was:

```tsx
<div role="group" aria-label="Text cell editor mode">
```

Biome complained because a native HTML element could express the same meaning better.

The better version is:

```tsx
<fieldset>
  <legend className="sr-only">Text cell editor mode</legend>
  ...
</fieldset>
```

`fieldset` means:

```text
This is a group of related controls.
```

`legend` names the group.

`sr-only` hides the legend visually but keeps it available to screen readers.

The important lesson is:

```text
Prefer semantic HTML before adding ARIA roles manually.
```

## Main Concept: `react-markdown`

`react-markdown` renders Markdown strings as React elements.

The important usage is:

```tsx
<Markdown>
  {cell.content}
</Markdown>
```

This means:

```text
Take the Markdown string from the cell.
Parse it.
Render the matching React elements.
```

For example:

```md
# Heading
```

becomes a heading element.

```md
**bold**
```

becomes bold text.

## Main Concept: `remark-gfm`

Basic Markdown does not include every GitHub-style feature.

`remark-gfm` adds support for GitHub-flavored Markdown features such as:

- Tables.
- Task lists.
- Strikethrough.
- Autolinks.
- Footnotes.

The renderer uses it like this:

```tsx
<Markdown remarkPlugins={[remarkGfm]}>
  {cell.content}
</Markdown>
```

This tells the Markdown parser:

```text
Understand GitHub-flavored Markdown syntax too.
```

## Main Concept: Tailwind Preflight Removes Default Heading Styles

After Markdown rendering was added, headings and tables initially looked plain.

That happened because Tailwind's base reset removes or normalizes many browser default styles.

So this Markdown:

```md
# Heading
```

still produced a real heading element, but the heading did not automatically look large.

The issue was not `react-markdown`.

The issue was that the rendered HTML needed Markdown-specific styling.

## Main Concept: Tailwind Typography

Tailwind Typography provides the `prose` classes.

It was enabled in `globals.css`:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

Then the Markdown preview uses classes like:

```tsx
className="prose prose-slate prose-sm max-w-none"
```

These classes make rendered Markdown look like document content.

They style things like:

- Headings.
- Paragraphs.
- Lists.
- Code blocks.
- Blockquotes.
- Tables.

`max-w-none` matters because Tailwind Typography normally limits text width. In a notebook cell, the preview should use the available cell width.

## Main Concept: Preview Wrapper Structure

The Markdown preview uses two wrapper layers.

The outer wrapper handles the preview box:

```tsx
<div
  style={{ minHeight: cell.heightPx }}
  className="overflow-auto rounded-md border border-slate-200 bg-white p-3"
>
```

This controls:

```text
height
scrolling
border
background
padding
```

The inner wrapper handles Markdown typography:

```tsx
<div className="prose prose-slate prose-sm max-w-none">
```

This controls:

```text
headings
paragraph spacing
lists
tables
code formatting
```

The final structure is:

```text
Preview box
  -> Markdown typography wrapper
     -> react-markdown output
```

Keeping these responsibilities separate makes the code easier to reason about.

## Main Concept: Table Styling

Tailwind Typography helps tables, but custom table utilities make borders clearer.

The preview can use classes such as:

```tsx
prose-table:w-full
prose-table:border-collapse
prose-th:border
prose-th:border-slate-300
prose-th:bg-slate-50
prose-th:px-3
prose-th:py-2
prose-td:border
prose-td:border-slate-200
prose-td:px-3
prose-td:py-2
```

These classes mean:

```text
Make tables full width.
Collapse table borders.
Give header cells visible borders and a light background.
Give body cells visible borders and padding.
```

This makes Markdown tables easier to read.

## Main Concept: LaTeX-Style Math

Jupyter notebooks support math inside Markdown cells.

Step 18 added similar preview behavior using:

- `remark-math`
- `rehype-katex`
- `katex`

The Markdown pipeline became:

```tsx
<Markdown
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[rehypeKatex]}
>
  {cell.content}
</Markdown>
```

`remarkMath` understands math syntax in Markdown.

`rehypeKatex` turns that math syntax into rendered KaTeX output.

KaTeX CSS makes the output look correct.

## Main Concept: KaTeX CSS

KaTeX needs its stylesheet.

The app imports it globally in `app/layout.tsx`:

```tsx
import "katex/dist/katex.min.css";
```

Without this CSS, math may technically render but look wrong.

This is similar to how a component library often needs its own stylesheet.

## Main Concept: Inline Math And Block Math

Inline math uses one dollar sign on each side:

```md
Einstein's equation is $E = mc^2$.
```

Block math uses two dollar signs on each side:

```md
$$
\int_0^1 x^2 dx = \frac{1}{3}
$$
```

Inline math appears inside a sentence.

Block math appears as its own displayed equation.

This is the same general style many Markdown notebook systems use.

## Main Concept: Dollar Signs Can Become Ambiguous

Once math parsing is enabled, dollar signs can mean math.

For example:

```md
This costs $5 and that costs $10.
```

may be interpreted unexpectedly because the parser sees dollar signs.

If the user means literal currency, they may need to escape dollar signs or write around the ambiguity.

This is a tradeoff of enabling `$...$` math syntax.

## Main Concept: The Data Model Stayed Stable

The most important architectural result is that Step 18 did not require:

```ts
type CellType = "text" | "markdown" | "drawing";
```

It also did not require:

```ts
content: RichTextJson;
```

Instead, the existing text cell became Markdown-capable.

This keeps the model simple:

```ts
export interface TextCell extends BaseCell {
  type: "text";
  content: string;
}
```

That means persistence can still be implemented with normal JSON later.

## What Was Verified

Step 18 was checked with:

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

## What Step 18 Did Not Do

Step 18 did not add:

- A separate Markdown cell type.
- A full rich-text editor.
- Tiptap or ProseMirror.
- Markdown toolbar buttons.
- Split view editing.
- Image insertion.
- File upload support.
- Syntax-highlighted code blocks.
- Math editing buttons.
- Persistence after refresh.

Those can be considered later.

## Mental Model To Keep

Step 18 introduced this flow:

```text
User types Markdown in Write mode
  -> textarea calls onChange
  -> NotebookApp updates TextCell.content
  -> user switches to Preview mode
  -> react-markdown parses TextCell.content
  -> remark-gfm adds GitHub Markdown features
  -> remark-math recognizes math syntax
  -> rehype-katex renders math
  -> Tailwind Typography styles the rendered document
```

The most important idea is:

```text
Markdown is the source format. Preview is only a rendered view.
```

## Key Takeaways

- Step 18 improved text cells without changing the storage model.
- `TextCell.content` remains a plain string.
- Markdown preview is simpler than a full rich-text editor.
- `react-markdown` renders Markdown strings as React output.
- `remark-gfm` adds tables, task lists, strikethrough, autolinks, and footnotes.
- Tailwind Preflight resets default heading and table styles.
- Tailwind Typography's `prose` classes restore document-style Markdown formatting.
- The preview should have separate layout and typography wrappers.
- Table borders need explicit styling if you want grid-like tables.
- `remark-math` and `rehype-katex` add LaTeX-style math rendering.
- KaTeX needs its global CSS import.
- `$...$` renders inline math.
- `$$...$$` renders block math.
- Dollar signs can become ambiguous after math support is enabled.
- `fieldset` and `legend` are better than manually adding `role="group"` to a `div`.
- `aria-pressed` is useful for toggle buttons.
- Semantic HTML usually satisfies accessibility tooling better than extra ARIA.
- Step 18 completed the first version of Markdown preview for text cells.
