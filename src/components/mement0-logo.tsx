import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/mement0-logo.png.asset.json";

/**
 * The "slashed 0" square mark — SVG so it scales and themes cleanly.
 * Use this as the brand icon (sidebar toggle, small chrome).
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
      <span className="font-display text-lg font-semibold tracking-tight">
        Mement<span className="ember-text">0</span>
      </span>
    </Link>
  );
}

/**
 * The full uploaded brand lockup (square mark + "Mement0" + "MORE").
 * Use on the landing/auth hero — not in tight chrome.
 */
export function Mement0Hero({ className = "" }: { className?: string }) {
  return <img src={logoAsset.url} alt="Mement0 — MORE" className={className} />;
}
