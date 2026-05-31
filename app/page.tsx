export default function Home() {
  return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <aside className="w-72 border-r border-slate-200 bg-white">
        <div className="p-4">
          <h1 className="text-lg font-semibold">Notebook</h1>
        </div>
        <nav className="space-y-2 p-3">
          <button className="w-full rounded-md bg-slate-900 px-3 py-2 text-left text-sm text-white">
            Daily Notes
          </button>
          <button className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-600">
            Project Ideas
          </button>
          <button className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-600">
            Other Stuff
          </button>
        </nav>
      </aside>
      <section className="flex flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-5">
          <p className="text-sm text-slate-500">Notebook</p>
          <h2 className="text-2xl font-semibold">Daily Notes</h2>
        </header>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <article className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-medium uppercase text-slate-400">
              Text cell
            </div>
            <p className="leading-7 text-slate-700">
              This is a placeholder text cell. Later this will become an editable textarea.
            </p>
          </article>
          <article className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-medium uppercase text-slate-400">
              Other cell
            </div>
            <p className="leading-7 text-slate-700">
              Fake cell.
            </p>
          </article>
          <article className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-medium uppercase text-slate-400">
              Drawing cell
            </div>
            <div className="h-48 rounded-md border border-dashed border-slate-300 bg-slate-50" />
          </article>
          <article className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-medium uppercase text-slate-400">
              Text cell
            </div>
            <p className="leading-7 text-slate-700">
              Text cell content.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
