import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SendHorizonal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createThread } from "@/lib/threads.functions";
import { Mement0Logo, Mement0Hero } from "@/components/mement0-logo";
import { BRAND, pageMeta } from "@/lib/brand-meta";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      ...pageMeta({
        title: BRAND.defaultTitle,
        description: BRAND.defaultDescription,
        ogDescription: BRAND.shareDescription,
        ogUrl: BRAND.domain,
      }),
    ],
    links: [{ rel: "canonical", href: BRAND.domain }],
  }),
  component: Landing,
});

const PENDING_KEY = "mement0_pending_prompt";

function Landing() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/app", replace: true });
        return;
      }
      setAuthed(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) {
        navigate({ to: "/app", replace: true });
      } else {
        setAuthed(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      if (authed) {
        const t = await createThread({ data: {} });
        if (!t) throw new Error("Could not start thread");
        sessionStorage.setItem(PENDING_KEY, text);
        navigate({ to: "/c/$threadId", params: { threadId: t.id } });
      } else {
        sessionStorage.setItem(PENDING_KEY, text);
        navigate({ to: "/auth" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between px-5 py-4">
        <Mement0Logo to="/" />
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link to="/about" className="hover:text-foreground transition-colors">
            About
          </Link>
          {authed ? (
            <Link to="/app" className="hover:text-foreground transition-colors">
              Archive
            </Link>
          ) : (
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5">
        <Mement0Hero className="mb-10 h-56 w-auto md:h-72" />
        <form onSubmit={submit} className="w-full max-w-2xl">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card/60 p-2 focus-within:border-primary/60 transition-colors ember-glow">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="prepare to assimilate"
              rows={1}
              className="flex-1 resize-none bg-transparent px-3 py-3 text-base md:text-[15px] outline-none placeholder:text-muted-foreground"
              style={{ maxHeight: 240 }}
            />
            <button
              type="submit"
              disabled={submitting || !input.trim()}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
              aria-label="Send"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="h-4 w-4" />
              )}
            </button>
          </div>
          {authed === false && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Sign in once. Your archive remembers everything after that.
            </p>
          )}
        </form>
      </main>

      <footer className="px-5 py-5 flex items-center justify-center text-xs text-muted-foreground">
        <Link to="/about" className="hover:text-foreground transition-colors">
          What is MementØ?
        </Link>
      </footer>
    </div>
  );
}
