import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { Brain } from "lucide-react";
import { createThread, listThreads } from "@/lib/threads.functions";
import { Mement0Mark } from "@/components/mement0-logo";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
});

function AppHome() {
  const navigate = useNavigate();
  const threadsQ = useQuery({ queryKey: ["threads"], queryFn: () => listThreads() });

  const createM = useMutation({
    mutationFn: () => createThread({ data: {} }),
    onSuccess: (t) => navigate({ to: "/c/$threadId", params: { threadId: t!.id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // If there are existing threads, jump to the most recent one
  useEffect(() => {
    if (threadsQ.data && threadsQ.data.length > 0) {
      navigate({ to: "/c/$threadId", params: { threadId: threadsQ.data[0].id }, replace: true });
    }
  }, [threadsQ.data, navigate]);

  return (
    <div className="flex flex-1 items-center justify-center px-5">
      <div className="max-w-md text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card ember-glow">
          <Brain className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-6 text-3xl font-display tracking-tight">
          Begin <Mement0Mark />
        </h1>
        <p className="mt-3 text-muted-foreground">
          The archive is empty. Start the first thread and every word becomes memory.
        </p>
        <button
          type="button"
          onClick={() => createM.mutate()}
          disabled={createM.isPending}
          className="mt-7 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90 ember-glow disabled:opacity-50"
        >
          {createM.isPending ? "…" : "Open the first thread"}
        </button>
      </div>
    </div>
  );
}
