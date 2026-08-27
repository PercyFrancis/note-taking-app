"use client";

import { useAuth } from "@clerk/nextjs";
import GuestNotebookApp from "./GuestNotebookApp";
import NotebookApp from "./NotebookApp";

export default function HomeWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading your workspace…
      </main>
    );
  }

  return isSignedIn ? <NotebookApp /> : <GuestNotebookApp />;
}
