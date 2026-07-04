import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getOrCreateTodayThread } from "@/lib/threads.functions";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
});

function AppHome() {
  const navigate = useNavigate();
  const kickedRef = useRef(false);

  const openTodayM = useMutation({
    mutationFn: () => {
      let tz = "UTC";
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
      } catch {}
      return getOrCreateTodayThread({ data: { tz } });
    },
    onSuccess: (t) => {
      if (!t) return;
      navigate({ to: "/c/$threadId", params: { threadId: t.id }, replace: true });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't open today's chat"),
  });

  useEffect(() => {
    if (kickedRef.current) return;
    kickedRef.current = true;
    openTodayM.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center px-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Opening today's chat…
      </div>
    </div>
  );
}
