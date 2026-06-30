import { Link } from "@tanstack/react-router";
import { BRAND, brandFontStyle } from "@/lib/brand";

/**
 * The "slashed 0" square mark — SVG so it scales and themes cleanly.
 * All geometry comes from BRAND.mark so the look can be retuned globally.
 */
export function Mement0Mark({
  className = "",
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  const m = BRAND.mark;
  return (
    <svg
      viewBox={m.viewBox}
      width={size}
      height={size}
      className={className}
      aria-label={BRAND.name}
      role="img"
    >
      <rect
        x="4"
        y="4"
        width="56"
        height="56"
        rx="10"
        fill="none"
        stroke={m.stroke}
        strokeWidth={m.rectStroke}
      />
      <ellipse
        cx="32"
        cy="32"
        rx="10"
        ry="15"
        fill="none"
        stroke={m.stroke}
        strokeWidth={m.ovalStroke}
      />
      <line
        x1="18"
        y1="48"
        x2="46"
        y2="16"
        stroke={m.stroke}
        strokeWidth={m.slashStroke}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Inline wordmark: "Mement" + slashed-Ø, both in the current text color.
 * Use this anywhere you'd otherwise write "Mement0" as text.
 */
export function Mement0Wordmark({
  className = "",
  as: Tag = "span",
}: {
  className?: string;
  as?: "span" | "h1" | "h2" | "p" | "div";
}) {
  return (
    <Tag className={className} style={brandFontStyle}>
      {BRAND.textPrefix}
      <span style={{ fontWeight: BRAND.oWeight }}>{BRAND.oGlyph}</span>
    </Tag>
  );
}

/**
 * Compact header lockup: slashed-0 mark + text wordmark.
 */
export function Mement0Logo({ to = "/" as string }: { to?: string }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2">
      <Mement0Mark size={24} className="text-foreground" />
      <Mement0Wordmark className="text-lg font-semibold tracking-tight text-foreground" />
    </Link>
  );
}

/**
 * The full brand lockup — outlined "Mement" + solid Ø + tagline.
 * Used on landing + auth hero.
 */
export function Mement0Hero({ className = "" }: { className?: string }) {
  const h = BRAND.hero;
  return (
    <div
      className={`flex flex-col items-center justify-center ${className}`}
      aria-label={`${BRAND.name} — ${BRAND.tagline}`}
    >
      <div
        className="leading-none"
        style={{
          ...brandFontStyle,
          fontWeight: BRAND.prefixWeight,
          fontSize: h.sizeClamp,
          letterSpacing: "-0.02em",
        }}
      >
        <span
          style={{
            color: h.prefixFill,
            WebkitTextStroke: `${h.prefixStrokeWidth} ${h.prefixStrokeColor}`,
            textShadow: `0 0 1px ${h.prefixStrokeColor}`,
          }}
        >
          {BRAND.textPrefix}
        </span>
        <span style={{ fontWeight: BRAND.oWeight, color: h.oFill }}>
          {BRAND.oGlyph}
        </span>
      </div>
      <div
        className="mt-3 text-foreground"
        style={{
          ...brandFontStyle,
          fontWeight: 400,
          fontStyle: "italic",
          fontSize: h.taglineSizeClamp,
          letterSpacing: h.taglineTracking,
          textTransform: "uppercase",
        }}
      >
        {BRAND.tagline}
      </div>
    </div>
  );
}
