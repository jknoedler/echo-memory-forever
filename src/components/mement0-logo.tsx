import { Link } from "@tanstack/react-router";

export function Mement0Mark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-display tracking-tight ${className}`}>
      <span>Mement</span>
      <span className="ember-text font-bold">0</span>
    </span>
  );
}

export function Mement0Logo({ to = "/" as string }: { to?: string }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2">
      <span className="relative flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card transition-all group-hover:ember-glow">
        <span className="ember-text text-base font-bold">0</span>
      </span>
      <Mement0Mark className="text-lg" />
    </Link>
  );
}
