import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import NotebookApp from "@/components/notebook/NotebookApp";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/buttonStyles";

export default function Home() {
  return (
    <div>
      <Show when="signed-in">
        <NotebookApp />
      </Show>

      <Show when="signed-out">
        <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
          <section className="w-full max-w-sm text-center">
            <h1 className="text-lg font-semibold">Notebook</h1>
            <p>Sign in to continue.</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <SignInButton>
                <button type="button" className={primaryButtonClass}>
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton>
                <button type="button" className={secondaryButtonClass}>
                  Sign Up
                </button>
              </SignUpButton>
            </div>
          </section>
        </main>
      </Show>
    </div>
  );
}
