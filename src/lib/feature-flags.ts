/**
 * Feature flags — small, side-effect-free toggles read by the UI.
 *
 * Keep these flags strictly visual / behavioural; never gate security on
 * them. Flip via env (`VITE_FLAG_*`) or override per-build by editing the
 * defaults below.
 *
 * `showClock` controls whether the BrandClock is visually rendered in the
 * app shell. The clock's timezone + Pacific-anchor context is still pushed
 * to the model on every chat turn regardless of this flag — turning the
 * flag off only hides the pixels, never the data.
 */
function envBool(key: string, fallback: boolean): boolean {
  try {
    const raw = (import.meta as any)?.env?.[key];
    if (raw === undefined || raw === null || raw === "") return fallback;
    const v = String(raw).toLowerCase().trim();
    if (["1", "true", "yes", "on", "show"].includes(v)) return true;
    if (["0", "false", "no", "off", "hide"].includes(v)) return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export const FEATURE_FLAGS = {
  /** Show the wall-clock chip in the header. AI always receives time context. */
  showClock: envBool("VITE_FLAG_SHOW_CLOCK", false),
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
