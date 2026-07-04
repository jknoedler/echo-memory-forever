import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useMatchRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, CalendarDays, ChevronDown, ChevronRight, ClipboardList, Library, LogOut, Plus, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Mement0Logo, Mement0Mark, Mement0Wordmark } from "@/components/mement0-logo";
import { BrandClock } from "@/components/brand-clock";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { supabase } from "@/integrations/supabase/client";
import {
  createSubThread,
  deleteThread,
  getOrCreateTodayThread,
  listThreadsGrouped,
} from "@/lib/threads.functions";

const SIDEBAR_KEY = "mement0_sidebar_collapsed";
const OLDER_OPEN_KEY = "mement0_older_open";


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
  const [olderOpen, setOlderOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(OLDER_OPEN_KEY) === "1";
  });

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


  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OLDER_OPEN_KEY, olderOpen ? "1" : "0");
    }
  }, [olderOpen]);

  const groupsQ = useQuery({
    queryKey: ["threads-grouped"],
    queryFn: () => listThreadsGrouped(),
  });

  const activeThreadId = (matchRoute({ to: "/c/$threadId", fuzzy: true }) as
    | { threadId?: string }
    | false) && (matchRoute({ to: "/c/$threadId" }) as { threadId?: string } | false);
  const activeId =
    typeof activeThreadId === "object" && activeThreadId
      ? activeThreadId.threadId
      : undefined;

  // The user's local calendar day, refreshed each render, used to label
  // "Today" / "Yesterday" in the sidebar without depending on server state.
  const localDay = useMemo(() => {
    let tz = "UTC";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
    } catch {}
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }, []);

  const groups = (groupsQ.data ?? []) as Array<{
    dayKey: string;
    root: {
      id: string;
      title: string;
      last_message_at: string;
      continuity_status: string;
    } | null;
    subs: Array<{
      id: string;
      title: string;
      last_message_at: string;
      continuity_status: string;
    }>;
  }>;
  const todayGroup = groups.find((g) => g.dayKey === localDay);
  const todayRootId = todayGroup?.root?.id ?? null;

  // Active day's root (root of the currently-open chat), used to decide
  // whether the "+" creates a sub-chat or jumps to today.
  const activeGroup = groups.find(
    (g) => g.root?.id === activeId || g.subs.some((s) => s.id === activeId),
  );
  const activeDayRootId = activeGroup?.root?.id ?? null;
  const inActiveDay = !!activeGroup;

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
      queryClient.invalidateQueries({ queryKey: ["threads-grouped"] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setMobileOpen(false);
      navigate({ to: "/c/$threadId", params: { threadId: t.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const createSubM = useMutation({
    mutationFn: (parentId: string) => createSubThread({ data: { parentId } }),
    onSuccess: (t) => {
      if (!t) return;
      queryClient.invalidateQueries({ queryKey: ["threads-grouped"] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setMobileOpen(false);
      navigate({ to: "/c/$threadId", params: { threadId: t.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteThread({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads-grouped"] });
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

  // "+" button: create a sub-chat when the user is inside a day; otherwise
  // open today's daily root.
  function handlePlus() {
    if (inActiveDay && activeDayRootId) {
      createSubM.mutate(activeDayRootId);
    } else if (todayRootId) {
      createSubM.mutate(todayRootId);
    } else {
      openTodayM.mutate();
    }
  }

  const plusLabel = inActiveDay ? "New sub-chat" : "Open today";

  function formatDayLabel(dayKey: string): string {
    if (dayKey === localDay) return "Today";
    // Yesterday check: subtract one day from localDay
    const [y, m, d] = localDay.split("-").map(Number);
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1));
    const yStr = yesterday.toISOString().slice(0, 10);
    if (dayKey === yStr) return "Yesterday";
    try {
      const [yy, mm, dd] = dayKey.split("-").map(Number);
      const dt = new Date(Date.UTC(yy, mm - 1, dd));
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(dt);
    } catch {
      return dayKey;
    }
  }

  const TODAY_YESTERDAY = new Set<string>();
  TODAY_YESTERDAY.add(localDay);
  {
    const [y, m, d] = localDay.split("-").map(Number);
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1));
    TODAY_YESTERDAY.add(yesterday.toISOString().slice(0, 10));
  }
  const primaryGroups = groups.filter((g) => TODAY_YESTERDAY.has(g.dayKey));
  const olderGroups = groups.filter((g) => !TODAY_YESTERDAY.has(g.dayKey));


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
            onClick={handlePlus}
            disabled={createSubM.isPending || openTodayM.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity ember-glow"
          >
            <Plus className="h-4 w-4" /> {plusLabel}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p className="px-2 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Archive
          </p>
          {groupsQ.isLoading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No days yet. Start typing.
            </p>
          ) : (
            <div className="space-y-3">
              {primaryGroups.map((g) => (
                <DayBlock
                  key={g.dayKey}
                  label={formatDayLabel(g.dayKey)}
                  group={g}
                  activeId={activeId}
                  onNavigate={onNavigate}
                  onDelete={(id) => {
                    if (confirm("Delete this chat?")) deleteM.mutate(id);
                  }}
                />
              ))}
              {olderGroups.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setOlderOpen((v) => !v)}
                    className="w-full flex items-center gap-1 px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    {olderOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Earlier ({olderGroups.length})
                  </button>
                  {olderOpen && (
                    <div className="mt-1 space-y-3">
                      {olderGroups.map((g) => (
                        <DayBlock
                          key={g.dayKey}
                          label={formatDayLabel(g.dayKey)}
                          group={g}
                          activeId={activeId}
                          onNavigate={onNavigate}
                          onDelete={(id) => {
                            if (confirm("Delete this chat?")) deleteM.mutate(id);
                          }}
                          muted
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
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
              onClick={handlePlus}
              disabled={createSubM.isPending || openTodayM.isPending}
              className="p-2 rounded-md bg-primary text-primary-foreground"
              aria-label={plusLabel}
              title={plusLabel}
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
              onClick={handlePlus}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              {inActiveDay ? "+ Sub" : "Today"}
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
