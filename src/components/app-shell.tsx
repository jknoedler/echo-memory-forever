import { useEffect, useState, type ReactNode } from "react";
import { Link, useMatchRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, ChevronLeft, ChevronRight, ClipboardList, Library, LogOut, Plus, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Mement0Logo } from "@/components/mement0-logo";
import { supabase } from "@/integrations/supabase/client";
import { createThread, deleteThread, listThreads } from "@/lib/threads.functions";

const SIDEBAR_KEY = "mement0_sidebar_collapsed";
const VISIBLE_THREADS = 10;


export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const matchRoute = useMatchRoute();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const threadsQ = useQuery({
    queryKey: ["threads"],
    queryFn: () => listThreads(),
  });

  const createM = useMutation({
    mutationFn: () => createThread({ data: {} }),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/c/$threadId", params: { threadId: t!.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteThread({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/app" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    router.invalidate();
    navigate({ to: "/" });
  }

  const activeThreadId = (matchRoute({ to: "/c/$threadId", fuzzy: true }) as
    | { threadId?: string }
    | false) && (matchRoute({ to: "/c/$threadId" }) as { threadId?: string } | false);
  const activeId =
    typeof activeThreadId === "object" && activeThreadId
      ? activeThreadId.threadId
      : undefined;

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden md:flex md:w-72 flex-col border-r border-border bg-sidebar">
        <div className="p-4 border-b border-border">
          <Mement0Logo to="/app" />
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={() => createM.mutate()}
            disabled={createM.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity ember-glow"
          >
            <Plus className="h-4 w-4" /> New thread
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p className="px-2 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Threads
          </p>
          {threadsQ.isLoading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
          ) : (threadsQ.data ?? []).length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No threads yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {threadsQ.data!.map((t) => {
                const active = t.id === activeId;
                const idleHrs = (Date.now() - new Date(t.last_message_at).getTime()) / 3_600_000;
                const stale = t.continuity_status === "open" && idleHrs > 12;
                return (
                  <li key={t.id} className="group flex items-center">
                    <Link
                      to="/c/$threadId"
                      params={{ threadId: t.id }}
                      className={`flex-1 min-w-0 rounded-md px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {stale && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse"
                            title="Unresolved — check-in pending"
                          />
                        )}
                        <span className="block truncate">{t.title}</span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Delete this thread?")) deleteM.mutate(t.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive transition-all"
                      aria-label="Delete thread"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-2 space-y-0.5">
          <NavItem to="/tasks" icon={<ClipboardList className="h-4 w-4" />} label="Staged tasks" />
          <NavItem to="/personality" icon={<Brain className="h-4 w-4" />} label="Personality" />
          <NavItem to="/library" icon={<Library className="h-4 w-4" />} label="Model library" />
          <NavItem to="/settings" icon={<SettingsIcon className="h-4 w-4" />} label="Settings" />
        </div>

        <div className="border-t border-border p-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{email || "—"}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="p-2 text-muted-foreground hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {/* mobile bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border">
          <Mement0Logo to="/app" />
          <button
            type="button"
            onClick={() => createM.mutate()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            New
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
}: {
  to: "/tasks" | "/settings" | "/library" | "/personality";
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
    >
      {icon} {label}
    </Link>
  );
}
