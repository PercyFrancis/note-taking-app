# Styling And Tailwind CSS Learnings

This summary collects the general styling and Tailwind CSS ideas used while polishing the notebook app.

The main idea is that Tailwind lets you style directly in JSX with small utility classes. Instead of writing a custom CSS class for every element, you compose layout, spacing, color, typography, borders, and state styles from utilities.

## What Tailwind Is Doing

Tailwind classes are small CSS rules.

For example:

```tsx
className="rounded-md border border-slate-200 bg-white p-3 text-sm"
```

roughly means:

```text
rounded-md:
  medium border radius.

border:
  add a 1px border.

border-slate-200:
  make the border light slate.

bg-white:
  white background.

p-3:
  padding on all sides.

text-sm:
  small text size.
```

The class string is a compact list of visual decisions.

## Utility-First Styling

Tailwind is called utility-first because most classes do one small thing.

Examples:

```text
flex:
  display: flex

items-center:
  align items vertically in the center

gap-2:
  add spacing between flex or grid children

rounded-md:
  add medium rounded corners

text-slate-700:
  set text color
```

Instead of creating a custom CSS class like:

```css
.notebook-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
```

you write:

```tsx
className="flex items-center gap-2"
```

## Reading Tailwind Classes

A good way to read Tailwind is from layout to details.

For example:

```tsx
className="flex min-h-screen flex-col bg-slate-100 text-slate-950 md:flex-row"
```

Read it as:

```text
flex:
  use flex layout.

min-h-screen:
  make the app at least as tall as the viewport.

flex-col:
  stack children vertically by default.

bg-slate-100:
  light slate background.

text-slate-950:
  default dark text.

md:flex-row:
  switch to horizontal layout on medium screens and larger.
```

The class list describes the element's layout and appearance.

## Responsive Prefixes

Tailwind responsive prefixes apply styles only at certain screen sizes.

Example:

```tsx
className="flex flex-col md:flex-row"
```

This means:

```text
default:
  flex column.

md and larger:
  flex row.
```

Common responsive prefixes include:

```text
sm:
  small screens and larger.

md:
  medium screens and larger.

lg:
  large screens and larger.

xl:
  extra-large screens and larger.
```

Tailwind is mobile-first.

That means unprefixed classes apply to all sizes, and prefixed classes override them at larger breakpoints.

## Mobile-First Thinking

This class:

```tsx
className="w-full md:w-72"
```

means:

```text
small screens:
  full width.

medium screens and larger:
  fixed width.
```

The mobile-first mental model is:

```text
Write the small-screen layout first.
Add md:, lg:, etc. for larger screens.
```

This is why the app can stack the sidebar above the editor on small screens and place it beside the editor on desktop.

## Flexbox

Flexbox is used heavily in the app.

Common flex classes:

```text
flex:
  turn the element into a flex container.

flex-col:
  stack children vertically.

flex-row:
  place children horizontally.

items-center:
  align children vertically in the center.

justify-between:
  push children apart.

flex-1:
  let an element take available space.

flex-wrap:
  allow children to wrap onto new lines.

shrink-0:
  prevent an element from shrinking.
```

Example:

```tsx
className="flex items-center justify-between gap-3"
```

This means:

```text
place children in a row
center them vertically
push them apart
keep a gap between them
```

## `flex-wrap`

`flex-wrap` is important for toolbars.

Without wrapping:

```tsx
className="flex gap-2"
```

controls may overflow on narrow screens.

With wrapping:

```tsx
className="flex flex-wrap gap-2"
```

controls can move onto another line.

This is useful for:

- Cell toolbar buttons.
- Drawing editor tools.
- Header action buttons.

The idea is:

```text
Dense controls should wrap instead of overflowing or shrinking too far.
```

## `min-w-0`

`min-w-0` is one of the most important flexbox utilities for this app.

In flex layouts, child elements sometimes refuse to shrink below the width of their content.

That can break truncation.

The pattern is:

```tsx
className="min-w-0 flex-1"
```

with:

```tsx
className="truncate"
```

This means:

```text
allow the flex child to shrink
and truncate long text instead of overflowing
```

Use `min-w-0` for:

- Notebook row title buttons.
- Editor title areas.
- Preview containers inside flex layouts.
- Any flex child containing long text.

## Spacing

Tailwind spacing classes control margin, padding, and gaps.

Examples:

```text
p-4:
  padding on all sides.

px-4:
  horizontal padding.

py-2:
  vertical padding.

mt-3:
  margin-top.

mb-3:
  margin-bottom.

gap-2:
  gap between flex or grid children.
```

Use padding for space inside an element:

```tsx
className="p-4"
```

Use margin for space outside an element:

```tsx
className="mt-3"
```

Use gap for space between children:

```tsx
className="flex gap-2"
```

For component layouts, `gap` is often cleaner than adding margins to every child.

## Borders And Radius

Common border classes:

```text
border:
  add a default border.

border-slate-200:
  light slate border.

border-red-200:
  light red border for danger actions.

border-b:
  bottom border only.

border-r:
  right border only.
```

Common radius classes:

```text
rounded:
  small radius.

rounded-md:
  medium radius.

rounded-lg:
  larger radius.

rounded-full:
  full circle or pill shape.
```

In the notebook app:

```text
rounded-md:
  good for buttons and inputs.

rounded-lg:
  acceptable for cell frames.

rounded-full:
  useful for color swatches.
```

## Colors

The app mostly uses Tailwind's slate palette:

```text
slate-50
slate-100
slate-200
slate-400
slate-500
slate-700
slate-900
slate-950
```

The general pattern is:

```text
slate-50 / slate-100:
  light backgrounds.

slate-200:
  borders.

slate-400 / slate-500:
  muted text.

slate-700:
  normal text.

slate-900 / slate-950:
  high-emphasis text and dark buttons.
```

Danger actions use red:

```text
text-red-600
border-red-200
hover:bg-red-50
```

This keeps destructive actions visually distinct.

## Typography

Common text classes:

```text
text-xs:
  extra-small text.

text-sm:
  small text.

text-lg:
  larger heading text.

text-2xl:
  document title size.

font-medium:
  medium font weight.

font-semibold:
  stronger heading weight.

uppercase:
  uppercase text.
```

Use typography to create hierarchy:

```text
notebook title:
  large and semibold.

cell label:
  small, uppercase, muted.

metadata:
  extra-small and muted.
```

The goal is for users to quickly see what matters most.

## Truncation

Tailwind's `truncate` utility prevents long text from overflowing.

Example:

```tsx
<span className="block truncate">{notebook.title}</span>
```

This means:

```text
keep the text on one line
hide overflow
show ellipsis when needed
```

It works best when the parent has a constrained width and the flex child has `min-w-0`.

Use truncation for:

- Notebook titles.
- Search previews.
- Compact sidebar text.

Do not use it for main editor content where users need to read everything.

## Overflow

Overflow controls what happens when content is too large for its container.

Common classes:

```text
overflow-auto:
  show scrollbars only when needed.

overflow-hidden:
  hide overflowing content.

overflow-y-auto:
  allow vertical scrolling when needed.
```

The app uses overflow for:

```text
cell list:
  scroll the editor area.

text preview:
  scroll long Markdown content.

Markdown tables and equations:
  prevent wide content from breaking layout.
```

For editor surfaces, `overflow-auto` is usually safer than letting content stretch the page.

## Long Word Wrapping

Very long unbroken strings can break layouts.

Example:

```text
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

The fix is:

```tsx
break-words [overflow-wrap:anywhere]
```

This tells the browser:

```text
If needed, break long words so the container does not stretch.
```

This is especially useful for Markdown previews, URLs, and pasted generated text.

## Box Sizing

`box-border` changes how width and height are calculated.

With:

```tsx
box-border
```

the element's declared height includes:

```text
content
padding
border
```

This is useful when two elements should have exactly matching visible heights.

In the text editor, both Write and Preview surfaces use fixed height. `box-border` helps them line up more consistently.

## State Variants

Tailwind supports state variants such as:

```text
hover:
  mouse hover state.

focus:
  focused state.

focus-visible:
  focus state when a visible indicator is appropriate.

active:
  while being pressed.

disabled:
  disabled state.
```

Example:

```tsx
className="bg-slate-900 text-white hover:bg-slate-700 focus-visible:ring-2"
```

This means:

```text
normal:
  dark background and white text.

hover:
  slightly lighter dark background.

keyboard focus:
  show a focus ring.
```

State variants make controls feel interactive.

## Focus Rings

A focus ring shows which control has keyboard focus.

Common pattern:

```tsx
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2
```

This means:

```text
remove the default outline
replace it with a visible Tailwind ring
add spacing around the ring
```

Focus rings should be used on:

- Buttons.
- Inputs.
- Textareas.
- Range sliders.
- Color inputs.
- Toggle controls.
- Drag handles.

The accessibility rule is:

```text
If a user can tab to it, they should be able to see it.
```

## Hover States

Hover states give mouse users feedback.

Examples:

```tsx
hover:bg-slate-100
hover:bg-slate-700
hover:text-red-600
```

Use hover states to communicate:

```text
this row is clickable
this button can be pressed
this delete action is destructive
```

Hover should not be the only way to discover important actions because touch and keyboard users do not rely on hover.

## Active And Selected States

Some controls need an active or selected style.

Examples:

```text
active notebook row
selected drawing tool
selected color swatch
active Write or Preview mode
```

These usually depend on React state:

```tsx
isActive ? "bg-slate-900 text-white" : "hover:bg-slate-100"
```

The pattern is:

```text
state decides which class string to use
Tailwind classes describe the visual result
```

## Conditional Classes

Conditional classes are common in React with Tailwind.

Example:

```tsx
className={`rounded-md px-2 py-1 ${
  isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
}`}
```

This means:

```text
always use the base classes
then add different classes depending on state
```

This pattern is used for:

- Active notebook rows.
- Selected drawing tools.
- Selected color buttons.
- Write and Preview toggle buttons.
- Dragging styles.

## Shared Class Constants

Repeated class strings can be moved to a shared file.

Example:

```text
components/ui/buttonStyles.ts
```

This file can export:

```ts
primaryButtonClass
secondaryButtonClass
smallSecondaryButtonClass
smallDangerButtonClass
```

Then components use:

```tsx
<button className={primaryButtonClass}>
```

This helps keep button styling consistent.

It is simpler than building a reusable Button component, but still centralizes the design decisions.

## When To Use Shared Class Constants

Shared class constants are useful when:

```text
many elements share the same style
you are not ready to create a component abstraction
you want to keep native elements like button
some elements need special refs or behavior
```

They are good for:

- Primary buttons.
- Secondary buttons.
- Danger buttons.
- Small toolbar buttons.

They are less useful when an element needs many state-specific variations.

## When To Use A Reusable Component

A reusable component is useful when style and behavior repeat together.

For example, a future `Button` component might support:

```tsx
<Button variant="primary" size="sm">
  Save
</Button>
```

That can be cleaner long term.

But it adds more React concepts, especially if the component needs refs.

For the current app, shared class constants are a reasonable learning step before a full component abstraction.

## When To Use Global CSS

Most app-specific styling can stay in Tailwind classes.

Global CSS is better for:

```text
Tailwind imports
plugin setup
global body styles
third-party CSS imports
rare app-wide defaults
```

Examples from the app:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

Global CSS should not become a dumping ground for every component style.

## Tailwind Typography

Tailwind Typography provides the `prose` classes.

It is useful for rendered Markdown:

```tsx
className="prose prose-slate prose-sm max-w-none"
```

This styles:

- Headings.
- Paragraphs.
- Lists.
- Tables.
- Code blocks.
- Blockquotes.

`max-w-none` is useful when the Markdown preview should fill the available cell width.

## Styling Markdown Tables

Markdown tables often need extra styling.

Useful classes:

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

These make tables easier to read by adding width, borders, padding, and header background.

## Stable Dimensions

Stable dimensions reduce layout shifts.

Examples:

```text
h-8:
  stable toolbar button height.

w-8:
  stable icon/delete button width.

w-24:
  stable range slider width.

w-8 text-right:
  stable numeric label width.
```

Stable dimensions are especially useful in:

- Toolbars.
- Sidebar rows.
- Sliders.
- Button groups.
- Canvas areas.

## Canvas Styling

Canvas elements need extra care because canvas has internal pixel dimensions and visual CSS dimensions.

The pattern is:

```tsx
<canvas
  width={900}
  height={cell.heightPx}
  style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
  className="block w-full touch-none rounded-md border border-slate-300 bg-white"
/>
```

Important ideas:

```text
width and height attributes:
  internal drawing size.

w-full:
  visual width fills the container.

aspectRatio:
  keeps the visual size proportional.

touch-none:
  prevents browser touch gestures from interfering with drawing.
```

## Form Controls

Inputs and textareas need clear styling.

Common input pattern:

```tsx
rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400
```

Common textarea pattern:

```tsx
w-full resize-none overflow-auto rounded-md border border-slate-200 p-3 text-sm leading-6 outline-none focus-visible:ring-2
```

The key choices are:

```text
border:
  visible input boundary.

padding:
  comfortable typing area.

outline-none plus focus-visible:ring:
  custom accessible focus state.

resize-none:
  use the app's height control instead of browser textarea resizing.
```

## Visual Hierarchy

Visual hierarchy tells the user what matters most.

In the notebook app:

```text
notebook title:
  large and strong.

cell type labels:
  small, uppercase, muted.

metadata:
  small and low contrast.

primary actions:
  dark button.

secondary actions:
  bordered light button.

danger actions:
  red text and red hover.
```

The app should feel like a work tool, not a marketing page.

That means restrained colors, clear spacing, and predictable controls.

## Common Tailwind Patterns From This App

Responsive app shell:

```tsx
className="flex min-h-screen flex-col md:flex-row"
```

Sidebar:

```tsx
className="w-full border-b bg-white md:w-72 md:border-r md:border-b-0"
```

Toolbar:

```tsx
className="flex flex-wrap items-center gap-2"
```

Primary button:

```tsx
className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700 focus-visible:ring-2"
```

Text truncation:

```tsx
className="min-w-0 truncate"
```

Preview container:

```tsx
className="box-border min-w-0 overflow-auto break-words [overflow-wrap:anywhere] rounded-md border bg-white p-3"
```

## Mental Model To Keep

A Tailwind class list should answer:

```text
How is this laid out?
How much space does it use?
What does it look like?
How does it respond to hover, focus, active, and disabled states?
How does it behave on narrow screens?
What happens when content is too long?
```

The most important idea is:

```text
Tailwind styling is still CSS. The classes are just a compact way to write CSS decisions directly where the UI is built.
```

## Key Takeaways

- Tailwind utilities each do one small styling job.
- Unprefixed classes apply by default; `md:` and other prefixes apply at breakpoints.
- Tailwind is mobile-first.
- Flexbox utilities control most app layout.
- `flex-wrap` helps dense toolbars work on narrow screens.
- `min-w-0` is critical for truncation inside flex layouts.
- `truncate` prevents compact text from overflowing.
- `overflow-auto` keeps long content inside fixed areas.
- `box-border` helps fixed-height surfaces include padding and borders.
- `[overflow-wrap:anywhere]` protects layouts from long unbroken words.
- `focus-visible` creates accessible keyboard focus states.
- Hover styles help mouse users but should not be the only interaction cue.
- Conditional classes connect React state to visual state.
- Shared class constants centralize repeated styles without a full component abstraction.
- Global CSS should be reserved for app-wide setup and special cases.
- Tailwind Typography's `prose` classes are useful for rendered Markdown.
- Stable widths and heights reduce layout shifts.
- Styling should support the app's workflow, not distract from it.
