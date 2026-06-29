import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Brain, Database, Infinity as InfinityIcon, Lock, Radio, ShieldCheck } from "lucide-react";
import { Mement0Mark } from "@/components/mement0-logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mement0 — MORE / 0 loss" },
      {
        name: "description",
        content:
          "A lifelong AI memory and agentic OS. Lossless archive of your life. Model-agnostic. Your legacy, never forgotten.",
      },
      { property: "og:title", content: "Mement0 — MORE / 0 loss" },
      {
        property: "og:description",
        content: "Lifelong AI archive. 0 loss memory. Agentic. Eternal.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-30 bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <Mement0Mark className="text-xl" />
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#promise" className="hover:text-foreground transition-colors">The promise</a>
            <a href="#architecture" className="hover:text-foreground transition-colors">Architecture</a>
            <a href="#legacy" className="hover:text-foreground transition-colors">Legacy</a>
          </nav>
          <Link
            to="/auth"
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:ember-glow transition-all"
          >
            Begin
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-50">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full"
               style={{ background: "radial-gradient(closest-side, oklch(0.78 0.14 68 / 0.18), transparent)" }} />
        </div>
        <div className="mx-auto max-w-5xl px-5 pt-24 pb-24 text-center relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            v0 — lifelong AI memory, now boot-strapping
          </div>
          <h1 className="mt-7 font-display text-6xl md:text-8xl font-semibold tracking-tight leading-[0.95]">
            <Mement0Mark />
          </h1>
          <p className="mt-6 text-3xl md:text-4xl font-display tracking-wide ember-text">MORE</p>
          <p className="mt-2 text-xl md:text-2xl text-muted-foreground tracking-widest">0&nbsp;LOSS</p>

          <p className="mx-auto mt-10 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            A lifelong, model-agnostic AI that remembers every thread of your life. Begin as a
            child, end as an archive — and even then, your voice carries on.
          </p>

          <div className="mt-10 flex items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90 transition-opacity ember-glow"
            >
              Start your archive <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#promise"
              className="inline-flex items-center rounded-md border border-border bg-card px-6 py-3 font-medium hover:bg-secondary transition-colors"
            >
              What is this?
            </a>
          </div>
        </div>
      </section>

      {/* PROMISE STRIP */}
      <section id="promise" className="border-y border-border bg-card/30">
        <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-3 px-5">
          <Promise
            icon={<InfinityIcon className="h-5 w-5" />}
            kicker="Memory"
            title="Lossless, forever"
            body="Every conversation, note, and signal becomes a vector in your private archive. Recall a moment from yesterday or a decade ago — same speed."
          />
          <Promise
            icon={<Brain className="h-5 w-5" />}
            kicker="Persona"
            title="It mirrors you"
            body="No two Mement0s are alike. The bot calibrates to your cadence, your humor, your risks. A confidant — never a moralizer."
          />
          <Promise
            icon={<ShieldCheck className="h-5 w-5" />}
            kicker="Agency"
            title="Acts on your terms"
            body="It can draft, schedule, and stage anything from emails to deadlines. Final execution stays human-in-the-loop until you say otherwise."
          />
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section id="architecture" className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid gap-12 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">Architecture</p>
            <h2 className="mt-3 text-4xl font-display font-semibold tracking-tight">
              Model-agnostic by design.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Mement0 is not loyal to any model. Default through the Lovable AI gateway. Bring your
              own OpenAI, Anthropic, OpenRouter key. Or point it at a self-hosted llama running on
              your own machine. The brain swaps. The memory stays.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Tile icon={<Database className="h-4 w-4" />} title="Vector Vault"
                  body="pgvector + text-embedding-3-small. Every message embedded and retrieved by semantic similarity." />
            <Tile icon={<Radio className="h-4 w-4" />} title="Biometric Ingest"
                  body="Signed POST endpoint accepts wearable telemetry — HR, sleep, HRV, typing rhythm." />
            <Tile icon={<Brain className="h-4 w-4" />} title="System of Josiah"
                  body="The hardened persona contract every model adopts. Direct. Strategic. No fluff." />
            <Tile icon={<Lock className="h-4 w-4" />} title="HOTL Commitment Engine"
                  body="Drafts and stages high-stakes actions. You approve before anything ships." />
          </div>
        </div>
      </section>

      {/* LEGACY */}
      <section id="legacy" className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-4xl px-5 py-24 text-center">
          <p className="text-xs uppercase tracking-widest text-primary">Legacy</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-display font-semibold tracking-tight">
            Paper burns. Mement0 doesn't.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            When the time comes, your archive becomes inheritance. Your children's children
            can ask: <span className="text-foreground italic">"what would you have said?"</span> —
            and a voice answers, made of decades of you.
          </p>
          <Link
            to="/auth"
            className="mt-10 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90 ember-glow"
          >
            Begin the archive <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <Mement0Mark />
          <span>© Mement0 — the eternal archive.</span>
        </div>
      </footer>
    </div>
  );
}

function Promise({
  icon, kicker, title, body,
}: { icon: React.ReactNode; kicker: string; title: string; body: string }) {
  return (
    <div className="px-6 py-10 border-r border-border last:border-r-0">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-xs uppercase tracking-widest">{kicker}</span>
      </div>
      <h3 className="mt-3 text-xl font-display font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function Tile({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-2 text-primary">{icon}<span className="text-sm font-medium text-foreground">{title}</span></div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
