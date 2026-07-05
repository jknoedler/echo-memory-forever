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
      className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background text-foreground"
      role="status"
      aria-live="polite"
      aria-label="Loading MementØ"
    >
      <Mement0Mark
        size={400}
        className="h-[33vmin] w-[33vmin] max-h-[420px] max-w-[420px] text-foreground animate-pulse"
      />
      <p
        style={brandFontStyle}
        className="text-2xl md:text-4xl tracking-[0.35em] font-semibold text-foreground uppercase select-none"
      >
        D<span className="font-normal">Ø</span> M<span className="font-normal">Ø</span>RE
      </p>
    </div>
  );
}

export default AppLoading;
