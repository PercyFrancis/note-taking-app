# Step 02 Learnings - Static App Shell

Step 02 replaced the default Next.js starter page with a static notebook-style workspace. The goal was not to build features yet. The goal was to practice shaping a page with JSX, semantic HTML, and Tailwind CSS.

## What Changed

The starter homepage in `app/page.tsx` was replaced with a static layout containing:

- A full-page workspace.
- A left sidebar for fake notebook navigation.
- A main editor area.
- A notebook header with a static title.
- Several fake cells, including text cells and a drawing placeholder.

No React state was added. No click behavior was added. No browser storage was added.

## Main Concept: `app/page.tsx`

In the Next.js App Router, `app/page.tsx` defines the page shown at the `/` route.

That means this file controls what appears when you visit:

```text
http://localhost:3000
```

The file exports a React component:

```tsx
export default function Home() {
  return (
    <main>
      Page content goes here
    </main>
  );
}
```

The component name `Home` is not what makes it the homepage. The file location does. Because it is named `page.tsx` and lives directly inside `app/`, Next.js treats it as the root page.

## Main Concept: Server Component By Default

The page does not include:

```tsx
"use client";
```

That is correct for Step 02.

In Next.js, files inside `app/` are Server Components by default. A Server Component can render static UI, receive data from the server, and output HTML.

You only need `"use client"` when a component uses client-side browser features, such as:

- `useState`
- `useEffect`
- `onClick` behavior that changes React state
- `localStorage`
- canvas drawing events
- direct access to `window` or `document`

Step 02 uses static JSX only, so it should stay as a Server Component.

## Main Concept: JSX

JSX is the syntax React uses to describe UI. It looks similar to HTML, but it is written inside JavaScript or TypeScript.

Example:

```tsx
<main className="flex min-h-screen">
  <aside>Sidebar</aside>
  <section>Editor</section>
</main>
```

Important JSX rules:

- Use `className`, not `class`.
- Return one parent element from a component.
- Close every tag.
- Use `{}` when inserting JavaScript values.

In Step 02, the whole app shell was described as JSX.

## Main Concept: Semantic HTML

Semantic HTML means using elements that describe the purpose of the content.

Step 02 used:

- `<main>` for the main page content.
- `<aside>` for the sidebar.
- `<nav>` for notebook navigation.
- `<section>` for the editor area.
- `<header>` for the notebook title area.
- `<article>` for each fake cell.

These elements help keep the page understandable and accessible.

For example, a notebook cell is a self-contained block of content, so `<article>` is a reasonable choice.

## Main Concept: Tailwind CSS

Tailwind CSS lets you style elements directly with utility classes.

Example:

```tsx
<main className="flex min-h-screen bg-slate-100 text-slate-950">
```

That line means:

- `flex`: arrange direct children using flexbox.
- `min-h-screen`: make the element at least as tall as the viewport.
- `bg-slate-100`: use a light slate background.
- `text-slate-950`: use a dark slate text color.

Instead of writing custom CSS for every part of the page, Step 02 used Tailwind classes directly in `page.tsx`.

## Main Concept: Flex Layout

The outer page uses flexbox:

```tsx
<main className="flex min-h-screen">
```

Because the default flex direction is horizontal, the direct children appear side by side:

- The sidebar appears on the left.
- The editor appears on the right.

The sidebar has a fixed width:

```tsx
<aside className="w-72">
```

The editor fills the remaining width:

```tsx
<section className="flex flex-1 flex-col">
```

The important class is `flex-1`. It tells the editor section to take up the remaining available space.

## Main Concept: Static Placeholders First

Step 02 intentionally used fake content.

The notebook buttons are static:

```tsx
<button>Daily Notes</button>
```

The cells are static:

```tsx
<article>
  <p>This is a placeholder text cell.</p>
</article>
```

This is useful because it lets you design the page shape before adding complexity.

The app does not yet know about real notebooks, real cells, selected notebooks, or editing. Those concepts come later.

## Main Concept: Removing Unused Starter Code

The original starter page imported `Image` from `next/image` because it displayed Next.js and Vercel logos.

After removing those images, the import was no longer needed.

Unused imports should be removed because:

- They make files harder to read.
- ESLint may report them.
- They suggest the file depends on something it no longer uses.

Step 02 cleaned out the starter content instead of building the app on top of it.

## What Was Verified

After Step 02, the app was checked in two ways:

- `http://localhost:3000` returned HTTP `200`.
- `pnpm lint` passed.

This confirmed that the page still loads and the code passes the project's lint rules.

## What Step 02 Did Not Do

Step 02 did not add:

- React state.
- Components in a `components/` folder.
- Real notebook data.
- Editable text.
- Canvas drawing.
- Persistence.
- Search behavior.
- Working buttons.

Those are later steps.

## Mental Model To Keep

Step 02 was a static sketch of the app.

The purpose was to answer:

```text
What should the app roughly look like before it becomes interactive?
```

The next steps will gradually replace static placeholders with real data, reusable components, state, and behavior.

## Key Takeaways

- `app/page.tsx` controls the homepage route.
- A page can stay a Server Component if it only renders static UI.
- JSX describes the structure of the UI.
- Semantic HTML makes the layout easier to understand.
- Tailwind classes provide styling without writing much custom CSS.
- Flexbox is useful for app layouts with a sidebar and main content.
- Static placeholders are a good first step before adding state.
- Unused starter code should be removed once it no longer serves the app.
