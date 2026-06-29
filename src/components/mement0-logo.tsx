import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/mement0-logo.png.asset.json";

/**
 * The "slashed 0" square mark — SVG so it scales and themes cleanly.
 * Use this as the brand icon (sidebar toggle, favicons, small chrome).
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
        fill="currentColor"
        fillOpacity="0"
        stroke="currentColor"
        strokeWidth="3"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="11"
        ry="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <line
        x1="16"
        y1="50"
        x2="48"
        y2="14"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Full lockup: slashed-0 mark + "Mement0" wordmark image.
 * Used in headers and the auth/landing surfaces.
 */
export function Mement0Logo({
  to = "/" as string,
  compact = false,
}: {
  to?: string;
  compact?: boolean;
}) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2">
      <Mement0Mark size={compact ? 24 : 28} className="text-foreground" />
      <img
        src={logoAsset.url}
        alt="Mement0 — MORE"
        className={compact ? "h-5 w-auto" : "h-6 w-auto"}
        style={{
          // crop to just the "Mement0" wordmark area of the uploaded logo
          objectFit: "contain",
        }}
      />
    </Link>
  );
}

/**
 * The big centered hero lockup (landing / auth empty states).
 */
export function Mement0Hero({ className = "" }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Mement0 — MORE"
      className={className}
    />
  );
}
