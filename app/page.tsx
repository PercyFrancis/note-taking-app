import { Show } from "@clerk/nextjs";
import NotebookApp from "@/components/notebook/NotebookApp";

export default function Home() {
  return (
    <Show when="signed-in">
      <NotebookApp />
    </Show>
  );
}
