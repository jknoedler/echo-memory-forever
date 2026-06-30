import { Mement0Mark } from "@/components/mement0-logo";
import { brandFontStyle } from "@/lib/brand";

/**
 * Full-screen loading splash — pure black with the brand mark centered at
 * roughly one third of the viewport's short edge, "DØ MØRE" underneath.
 *
 * Used as the router's `defaultPendingComponent` and as a Suspense
 * fallback so the user never sees a third-party / framework loading
 * state. All MementØ — no foreign branding.
 */
export function AppLoading() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-black text-white"
      role="status"
      aria-live="polite"
      aria-label="Loading MementØ"
    >
      <Mement0Mark
        // ~1/3 of the viewport's short edge — clamp keeps it sane on
        // ultrawide and tiny phones alike.
        size={0}
        className="h-[33vmin] w-[33vmin] max-h-[420px] max-w-[420px] text-white animate-pulse"
      />
      <p
        style={brandFontStyle}
        className="text-2xl md:text-4xl tracking-[0.35em] font-semibold text-white/90 uppercase select-none"
      >
        D<span className="font-normal">Ø</span> M<span className="font-normal">Ø</span>RE
      </p>
    </div>
  );
}

export default AppLoading;
