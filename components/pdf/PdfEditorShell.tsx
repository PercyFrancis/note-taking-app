"use client";

import dynamic from "next/dynamic";

const PdfEditorApp = dynamic(() => import("./PdfEditorApp"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
      Loading PDF editor…
    </main>
  ),
});

export default function PdfEditorShell() {
  return <PdfEditorApp />;
}
