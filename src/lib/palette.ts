// Customizable color palettes for Mement0.
// Backgrounds = neutral, faded, low-chroma surfaces.
// Accents = muted jewel tones in the amber family.

export type BgPalette = {
  id: string;
  label: string;
  // base lightness for the canvas; cards/sidebar derive from this
  bgL: number;
  hue: number;
  chroma: number; // very low — these stay neutral
  // swatch shown in UI
  swatch: string;
};

export type AccentPalette = {
  id: string;
  label: string;
  // primary / ring / ember share these values
  L: number;
  C: number;
  H: number;
  swatch: string;
};

// NOTE: `swatch` is a *preview* color shown in the settings picker only.
// It's intentionally lighter & more saturated than the applied background so
// users can actually tell the dark tones apart. The real surface is built
// from bgL/hue/chroma in applyPalettes().
export const BG_PALETTES: BgPalette[] = [
  { id: "void", label: "Void", bgL: 0.135, hue: 80, chroma: 0.006, swatch: "oklch(0.32 0.015 80)" },
  { id: "obsidian", label: "Obsidian", bgL: 0.13, hue: 0, chroma: 0.002, swatch: "oklch(0.30 0.004 0)" },
  { id: "espresso", label: "Espresso", bgL: 0.145, hue: 40, chroma: 0.012, swatch: "oklch(0.38 0.05 40)" },
  { id: "slate", label: "Slate", bgL: 0.16, hue: 235, chroma: 0.012, swatch: "oklch(0.38 0.045 235)" },
  { id: "moss", label: "Moss", bgL: 0.15, hue: 145, chroma: 0.012, swatch: "oklch(0.38 0.05 145)" },
  { id: "plum", label: "Plum", bgL: 0.145, hue: 320, chroma: 0.014, swatch: "oklch(0.38 0.055 320)" },
  { id: "bone", label: "Bone", bgL: 0.965, hue: 80, chroma: 0.008, swatch: "oklch(0.94 0.02 80)" },
  { id: "mist", label: "Mist", bgL: 0.96, hue: 235, chroma: 0.008, swatch: "oklch(0.92 0.025 235)" },
];

export const ACCENT_PALETTES: AccentPalette[] = [
  { id: "amber", label: "Amber", L: 0.74, C: 0.12, H: 75, swatch: "oklch(0.74 0.12 75)" },
  { id: "ember", label: "Ember", L: 0.68, C: 0.13, H: 45, swatch: "oklch(0.68 0.13 45)" },
  { id: "rose", label: "Rose", L: 0.72, C: 0.10, H: 20, swatch: "oklch(0.72 0.10 20)" },
  { id: "clay", label: "Clay", L: 0.66, C: 0.09, H: 35, swatch: "oklch(0.66 0.09 35)" },
  { id: "sand", label: "Sand", L: 0.80, C: 0.07, H: 85, swatch: "oklch(0.80 0.07 85)" },
  { id: "sage", label: "Sage", L: 0.72, C: 0.07, H: 140, swatch: "oklch(0.72 0.07 140)" },
  { id: "sky", label: "Sky", L: 0.74, C: 0.08, H: 230, swatch: "oklch(0.74 0.08 230)" },
  { id: "lilac", label: "Lilac", L: 0.72, C: 0.08, H: 300, swatch: "oklch(0.72 0.08 300)" },
];

export const DEFAULT_BG = "void";
export const DEFAULT_ACCENT = "amber";
export const DEFAULT_LIGHT_BG = "bone";
export const DEFAULT_DARK_BG = "void";

const BG_KEY = "mement0_bg_palette";
const ACC_KEY = "mement0_accent_palette";

export function isDarkPalette(id: string) {
  const p = BG_PALETTES.find((b) => b.id === id) ?? BG_PALETTES[0];
  return p.bgL < 0.5;
}

function isDarkBg(p: BgPalette) {
  return p.bgL < 0.5;
}

function ok(l: number, c: number, h: number) {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`;
}

export function applyPalettes(bgId: string, accentId: string) {
  if (typeof document === "undefined") return;
  const bg = BG_PALETTES.find((b) => b.id === bgId) ?? BG_PALETTES[0];
  const a = ACCENT_PALETTES.find((x) => x.id === accentId) ?? ACCENT_PALETTES[0];
  const root = document.documentElement;
  const dark = isDarkBg(bg);
  const h = bg.hue;
  const c = bg.chroma;
  const L = bg.bgL;

  // Surface ramp — derived from background lightness
  const surfaces = dark
    ? {
        background: L,
        card: L + 0.04,
        popover: L + 0.03,
        secondary: L + 0.085,
        muted: L + 0.065,
        accent: L + 0.105,
        border: L + 0.125,
        input: L + 0.105,
        sidebar: L - 0.02,
        sidebarAccent: L + 0.065,
        sidebarBorder: L + 0.085,
        fg: 0.965,
        mutedFg: 0.62,
        sidebarFg: 0.92,
      }
    : {
        background: L,
        card: L - 0.015,
        popover: L + 0.005,
        secondary: L - 0.055,
        muted: L - 0.045,
        accent: L - 0.065,
        border: L - 0.105,
        input: L - 0.065,
        sidebar: L - 0.025,
        sidebarAccent: L - 0.065,
        sidebarBorder: L - 0.105,
        fg: 0.18,
        mutedFg: 0.48,
        sidebarFg: 0.20,
      };

  const primary = ok(a.L, a.C, a.H);
  const primaryFg = dark ? ok(0.16, 0.02, a.H) : ok(0.99, 0.005, a.H);

  const set = (name: string, value: string) => root.style.setProperty(name, value);

  set("--background", ok(surfaces.background, c, h));
  set("--foreground", ok(surfaces.fg, c, h));
  set("--card", ok(surfaces.card, c, h));
  set("--card-foreground", ok(surfaces.fg, c, h));
  set("--popover", ok(surfaces.popover, c, h));
  set("--popover-foreground", ok(surfaces.fg, c, h));
  set("--secondary", ok(surfaces.secondary, c, h));
  set("--secondary-foreground", ok(dark ? 0.94 : 0.22, c, h));
  set("--muted", ok(surfaces.muted, c, h));
  set("--muted-foreground", ok(surfaces.mutedFg, c, h));
  set("--accent", ok(surfaces.accent, c, h));
  set("--accent-foreground", ok(dark ? 0.96 : 0.20, c, h));
  set("--border", ok(surfaces.border, c, h));
  set("--input", ok(surfaces.input, c, h));

  set("--primary", primary);
  set("--primary-foreground", primaryFg);
  set("--ring", primary);
  set("--ember", primary);
  set("--ember-foreground", primaryFg);

  set("--sidebar", ok(surfaces.sidebar, c, h));
  set("--sidebar-foreground", ok(surfaces.sidebarFg, c, h));
  set("--sidebar-primary", primary);
  set("--sidebar-primary-foreground", primaryFg);
  set("--sidebar-accent", ok(surfaces.sidebarAccent, c, h));
  set("--sidebar-accent-foreground", ok(dark ? 0.96 : 0.20, c, h));
  set("--sidebar-border", ok(surfaces.sidebarBorder, c, h));
  set("--sidebar-ring", primary);

  // Force theme class to match the chosen background tone so other
  // class-based dark/light styling still lines up.
  root.classList.remove("light", "dark");
  root.classList.add(dark ? "dark" : "light");
}

export function loadPaletteSelection(): { bg: string; accent: string } {
  if (typeof localStorage === "undefined") {
    return { bg: DEFAULT_BG, accent: DEFAULT_ACCENT };
  }
  return {
    bg: localStorage.getItem(BG_KEY) ?? DEFAULT_BG,
    accent: localStorage.getItem(ACC_KEY) ?? DEFAULT_ACCENT,
  };
}

export function savePaletteSelection(bg: string, accent: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(BG_KEY, bg);
  localStorage.setItem(ACC_KEY, accent);
}
