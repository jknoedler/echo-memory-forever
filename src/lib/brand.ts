/**
 * Mement0 brand tokens — single source of truth for the wordmark, the
 * slashed-Ø mark, typography and the stroke treatment used across the app.
 *
 * Anything visual about the brand belongs here. Components only read these
 * tokens, never hardcode them, so the whole identity can be retuned in one
 * place without hunting through JSX.
 *
 * CSS-side mirrors live in `src/styles.css` under `:root` as `--brand-*`
 * variables so non-React surfaces (raw HTML, server-rendered email, etc.)
 * can stay in lockstep with the React components.
 */

export const BRAND = {
  /** Primary product name as the user reads it on screen. */
  name: "Mement0",
  /** How the wordmark is *written*: the "0" is stylized as a slashed Ø. */
  textPrefix: "Mement",
  oGlyph: "\u00d8", // Ø
  tagline: "MORE",
  promise: "0 loss",

  /** Display font stack — Bodoni Moda with safe serif fallbacks. */
  fontDisplay:
    '"Bodoni Moda", "Bodoni 72", "Didot", "GFS Didot", serif',

  /** Weight used for "Mement" — bold, high-contrast roman. */
  prefixWeight: 700,
  /** Weight used for the Ø — lighter so it reads as the breath/loop. */
  oWeight: 400,

  /** Logo mark (slashed-0 in a rounded square). */
  mark: {
    viewBox: "0 0 64 64",
    rectStroke: 3,
    ovalStroke: 4,
    slashStroke: 4,
    /** Defaults to currentColor so the mark inherits text color. */
    stroke: "currentColor",
  },

  /** Hero wordmark treatment — bold "Mement" outlined for high contrast. */
  hero: {
    prefixFill: "black",
    prefixStrokeColor: "white",
    prefixStrokeWidth: "1px",
    oFill: "white",
    sizeClamp: "clamp(4rem, 18vw, 9rem)",
    taglineSizeClamp: "clamp(1rem, 4vw, 1.5rem)",
    taglineTracking: "0.35em",
  },
} as const;

/** Inline style helper for the Bodoni display family. */
export const brandFontStyle = { fontFamily: BRAND.fontDisplay } as const;
