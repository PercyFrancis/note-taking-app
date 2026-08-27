import { Show } from "@clerk/nextjs";
import GuestNotebookApp from "@/components/notebook/GuestNotebookApp";
import NotebookApp from "@/components/notebook/NotebookApp";

export default function Home() {
  return (
    <div>
      <Show when="signed-in">
        <NotebookApp />
      </Show>

      <Show when="signed-out">
        <GuestNotebookApp />
      </Show>
    </div>
  );
}
