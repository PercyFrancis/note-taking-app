"use client";

import { useState } from "react";
import type { Notebook } from "@/lib/notebook-types";
import { createDefaultNotebook } from "@/lib/notebook-utils";
import NotebookSidebar from "@/components/notebook/NotebookSidebar";


export default function NotebookApp() {

    function createNotebook() {
        const notebook = createDefaultNotebook();

        setNotebooks((currentNotebooks) => [notebook, ...currentNotebooks]);
        setActiveNotebookId(notebook.id);
    }

    function deleteNotebook(id: string) {
        const shouldDelete = window.confirm("Delete this notebook?");

        if (!shouldDelete) {
        return;
        }

        setNotebooks((currentNotebooks) => {
        const remaining = currentNotebooks.filter((notebook) => notebook.id !== id);

        if (remaining.length === 0) {
            const replacement = createDefaultNotebook();
            setActiveNotebookId(replacement.id);
            return [replacement];
        }

        if (activeNotebookId === id) {
            setActiveNotebookId(remaining[0].id);
        }

        return remaining;
        });
    }

    const [notebooks, setNotebooks] = useState<Notebook[]>(() => {
        const notebook = createDefaultNotebook();
        return [notebook];
    });

    const [activeNotebookId, setActiveNotebookId] = useState<string>(() => {
        return notebooks[0].id;
    });   

    const activeNotebook =
        notebooks.find((notebook) => notebook.id === activeNotebookId) ?? notebooks[0];

    const [searchQuery, setSearchQuery] = useState("");
    const filteredNotebooks = notebooks.filter((notebook) =>
        notebook.title.toLowerCase().includes(searchQuery.toLowerCase())
    );


    return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <NotebookSidebar 
        notebooks={filteredNotebooks}
        activeNotebookId={activeNotebookId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectNotebook={setActiveNotebookId}
        onCreateNotebook={createNotebook}
        onDeleteNotebook={deleteNotebook}
      />
      <section className="flex flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-5">
          <p className="text-sm text-slate-500">Notebook</p>
          <h2 className="text-2xl font-semibold">{activeNotebook.title}</h2>
        </header>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {activeNotebook.cells.map((cell) => (
            <article
            key={cell.id}
            className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-medium uppercase text-slate-400">
                {cell.type === "text" ? "Text cell" : "Drawing cell"}
            </div>
            {cell.type === "text" ? (
                <p className="leading-7 text-slate-700">
                {cell.content || "Empty text cell"}
                </p>
            ) : (
                <div className="h-48 rounded-md border border-dashed border-slate-300 bg-slate-50" />
            )}
            </article>
        ))}
        </div>
      </section>
    </main>
  );
}

