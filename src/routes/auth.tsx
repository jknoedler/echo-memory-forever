import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Mement0Mark } from "@/components/mement0-logo";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Mement0" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: name ? { display_name: name } : {},
          },
        });
        if (error) throw error;
        toast.success("Welcome to your archive.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message || `${provider} sign-in failed`);
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${provider} sign-in failed`);
      setBusy(false);
    }
  }


  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Mement0Mark className="text-3xl" />
          <p className="mt-3 text-sm text-muted-foreground tracking-widest">MORE / 0 LOSS</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-7 shadow-2xl">
          <div className="flex gap-1 p-1 rounded-md bg-secondary mb-6">
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded py-2 text-sm font-medium transition-colors ${
                mode === "signup" ? "bg-background text-foreground" : "text-muted-foreground"
              }`}
            >
              Begin
            </button>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded py-2 text-sm font-medium transition-colors ${
                mode === "signin" ? "bg-background text-foreground" : "text-muted-foreground"
              }`}
            >
              Return
            </button>
          </div>

          <form onSubmit={handleEmail} className="space-y-4">
            {mode === "signup" && (
              <Field label="Name (optional)">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="auth-input"
                  placeholder="Josiah"
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                placeholder="you@where.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                placeholder="••••••••"
              />
            </Field>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 ember-glow"
            >
              {busy ? "…" : mode === "signup" ? "Create archive" : "Open archive"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={busy}
              className="w-full rounded-md border border-border bg-background py-3 font-medium hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("apple")}
              disabled={busy}
              className="w-full rounded-md border border-border bg-background py-3 font-medium hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Continue with Apple
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you accept that Mement0 will remember.
        </p>
      </div>

      <style>{`
        .auth-input {
          width: 100%;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          color: var(--color-foreground);
          padding: 0.625rem 0.875rem;
          border-radius: 0.5rem;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .auth-input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px oklch(0.78 0.14 68 / 0.18);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
