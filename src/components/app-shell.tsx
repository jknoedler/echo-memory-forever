import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useMatchRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Library, LogOut, Plus, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Mement0Logo, Mement0Mark, Mement0Wordmark } from "@/components/mement0-logo";
import { BrandClock } from "@/components/brand-clock";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
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
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  });
  const [showAll, setShowAll] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    }
  }, [collapsed]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  // Mobile swipe: right-edge swipe-in opens, swipe-out closes.
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    }
    function onEnd(e: TouchEvent) {
      const s = touchRef.current;
      touchRef.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dy) > 60) return;
      const dt = Date.now() - s.t;
      if (dt > 600) return;
      // Open: swipe right from the left edge
      if (!mobileOpen && s.x < 28 && dx > 50) setMobileOpen(true);
      // Close: swipe left anywhere while open
      else if (mobileOpen && dx < -50) setMobileOpen(false);
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [mobileOpen]);


  const threadsQ = useQuery({
    queryKey: ["threads"],
    queryFn: () => listThreads(),
  });

  const createM = useMutation({
    mutationFn: () => createThread({ data: {} }),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setMobileOpen(false);
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

  const allThreads = threadsQ.data ?? [];
  const visibleThreads = showAll ? allThreads : allThreads.slice(0, VISIBLE_THREADS);
  const hasMore = allThreads.length > VISIBLE_THREADS;

  function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div
            className="rounded-md"
            style={{
              filter:
                "drop-shadow(0 0 6px color-mix(in oklab, var(--primary) 70%, transparent)) drop-shadow(0 0 14px color-mix(in oklab, var(--primary) 35%, transparent))",
            }}
          >
            <Mement0Logo to="/app" />
          </div>
          <button
            type="button"
            onClick={() => {
              if (onNavigate) onNavigate();
              else setCollapsed(true);
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md"
            aria-label="Collapse archive"
            title="Collapse archive"
          >
            <Mement0Mark size={18} />
          </button>
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
            Archive {allThreads.length > 0 && <span className="text-muted-foreground/60">· {showAll ? allThreads.length : Math.min(VISIBLE_THREADS, allThreads.length)}{hasMore && !showAll ? ` / ${allThreads.length}` : ""}</span>}
          </p>
          {threadsQ.isLoading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
          ) : allThreads.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No threads yet.</p>
          ) : (
            <>
              <ul className="space-y-0.5">
                {visibleThreads.map((t) => {
                  const active = t.id === activeId;
                  const idleHrs = (Date.now() - new Date(t.last_message_at).getTime()) / 3_600_000;
                  const stale = t.continuity_status === "open" && idleHrs > 12;
                  return (
                    <li key={t.id} className="group flex items-center">
                      <Link
                        to="/c/$threadId"
                        params={{ threadId: t.id }}
                        onClick={onNavigate}
                        className={`flex-1 min-w-0 rounded-md px-3 py-2 text-sm transition-colors ${
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                        }`}
                        title={t.title}
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
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-sidebar-accent/40 transition-colors"
                >
                  {showAll ? "Show recent 10" : `Show all (${allThreads.length})`}
                </button>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border p-2 space-y-0.5">
          <NavItem to="/tasks" icon={<ClipboardList className="h-4 w-4" />} label="Staged tasks" onClick={onNavigate} />
          <NavItem to="/events" icon={<CalendarDays className="h-4 w-4" />} label="Calendar" onClick={onNavigate} />
          <NavItem to="/personality" icon={<Brain className="h-4 w-4" />} label="Personality" onClick={onNavigate} />
          <NavItem to="/library" icon={<Library className="h-4 w-4" />} label="Model library" onClick={onNavigate} />
          <NavItem to="/settings" icon={<SettingsIcon className="h-4 w-4" />} label="Settings" onClick={onNavigate} />
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
      </>
    );
  }

  return (
    <div className="h-dvh flex bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      <div className="relative hidden md:flex">
        {collapsed ? (
          <aside className="flex md:w-12 flex-col items-center border-r border-border bg-sidebar py-3 gap-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-md"
              aria-label="Expand archive"
              title="Expand archive"
            >
              <Mement0Mark size={22} />
            </button>
            <button
              type="button"
              onClick={() => createM.mutate()}
              disabled={createM.isPending}
              className="p-2 rounded-md bg-primary text-primary-foreground"
              aria-label="New thread"
              title="New thread"
            >
              <Plus className="h-4 w-4" />
            </button>
          </aside>
        ) : (
          <aside className="flex md:w-72 flex-col border-r border-border bg-sidebar">
            <SidebarBody />
          </aside>
        )}
        {/* Always-visible edge handle so users can find the archive panel.
            Points → when collapsed (open it) and ← when open (close it). */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Open archive" : "Close archive"}
          title={collapsed ? "Open archive" : "Close archive"}
          aria-expanded={!collapsed}
          className="absolute top-1/2 -translate-y-1/2 -right-3 z-30 h-9 w-6 flex items-center justify-center rounded-r-md border border-l-0 border-border bg-sidebar text-foreground hover:bg-sidebar-accent shadow-sm transition-colors"
        >
          <Mement0Mark size={14} />
        </button>
      </div>

      {/* Mobile edge handle — small Ø poking out of the screen edge */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open archive"
        title="Open archive"
        className={`md:hidden fixed left-0 top-1/2 -translate-y-1/2 z-30 h-9 w-5 flex items-center justify-center rounded-r-md border border-l-0 border-border bg-sidebar text-foreground shadow-sm transition-opacity ${
          mobileOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <Mement0Mark size={12} />
      </button>

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={`absolute top-0 left-0 h-full w-[82%] max-w-xs flex flex-col border-r border-border bg-sidebar shadow-2xl transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarBody onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>


      <main className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* mobile bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="p-1.5 -ml-1.5 text-foreground rounded-md"
            aria-label="Open archive"
          >
            <Mement0Mark size={26} />
          </button>
          <Link to="/app" className="text-base font-semibold tracking-tight">
            <Mement0Wordmark />
          </Link>

          <div className="flex items-center gap-2">
            <BrandClock className={FEATURE_FLAGS.showClock ? "" : "sr-only"} />
            <button
              type="button"
              onClick={() => createM.mutate()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              New
            </button>
          </div>
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
  onClick,
}: {
  to: "/tasks" | "/settings" | "/library" | "/personality" | "/events";
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
    >
      {icon} {label}
    </Link>
  );
}
