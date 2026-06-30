import { Link } from "@tanstack/react-router";

/**
 * The "slashed 0" square mark — SVG so it scales and themes cleanly.
 */
export function Mement0Mark({
  className = "",
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-label="Mement0"
      role="img"
    >
      <rect
        x="4"
        y="4"
        width="56"
        height="56"
        rx="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="10"
        ry="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <line
        x1="18"
        y1="48"
        x2="46"
        y2="16"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const bodoni = {
  fontFamily: '"Bodoni Moda", "Bodoni 72", "Didot", "GFS Didot", serif',
} as const;

/**
 * Inline wordmark: "Mement" in foreground + slashed-Ø in foreground.
 * Use this anywhere you'd otherwise write "Mement0" as text — keeps the
 * branding uniform (no amber/yellow, always the slashed-0 glyph).
 */
export function Mement0Wordmark({
  className = "",
  as: Tag = "span",
}: {
  className?: string;
  as?: "span" | "h1" | "h2" | "p" | "div";
}) {
  return (
    <Tag className={className} style={bodoni}>
      Mement<span style={{ fontWeight: 400 }}>&Oslash;</span>
    </Tag>
  );
}

/**
 * Compact header lockup: slashed-0 mark + text wordmark.
 */
export function Mement0Logo({
  to = "/" as string,
}: {
  to?: string;
}) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2">
      <Mement0Mark size={24} className="text-foreground" />
      <Mement0Wordmark className="text-lg font-semibold tracking-tight text-foreground" />
    </Link>
  );
}


/**
 * The full brand lockup — black / white, Bodoni, with slashed-Ø.
 * Used on landing + auth hero.
 */
export function Mement0Hero({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center ${className}`}
      aria-label="Mement\u00d8 — MORE"
    >
      <div className="leading-none" style={{ ...bodoni, fontWeight: 700, fontSize: "clamp(4rem, 18vw, 9rem)", letterSpacing: "-0.02em" }}>
        <span
          style={{
            color: "black",
            WebkitTextStroke: "1px white",
            textShadow: "0 0 1px white",
          }}
        >
          Mement
        </span>
        <span style={{ fontWeight: 400, color: "white" }}>&Oslash;</span>
      </div>
      <div
        className="mt-3 text-foreground"
        style={{
          ...bodoni,
          fontWeight: 400,
          fontStyle: "italic",
          fontSize: "clamp(1rem, 4vw, 1.5rem)",
          letterSpacing: "0.35em",
          textTransform: "uppercase",
        }}
      >
        More
      </div>
    </div>
  );
}

