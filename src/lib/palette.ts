// Customizable color palettes for Mement0.
// Dark-only. Three black backgrounds, eight muted "rainbow" accents.

export type BgPalette = {
  id: string;
  label: string;
  bgL: number;
  hue: number;
  chroma: number;
  swatch: string;
};

export type AccentPalette = {
  id: string;
  label: string;
  L: number;
  C: number;
  H: number;
  swatch: string;
};

// Three blacks. All dark, all neutral, distinguishable by tone & lift.
export const BG_PALETTES: BgPalette[] = [
  { id: "vanta", label: "Vanta", bgL: 0.06, hue: 0, chroma: 0.001, swatch: "oklch(0.10 0.001 0)" },
  { id: "charcoal", label: "Charcoal", bgL: 0.14, hue: 0, chroma: 0.003, swatch: "oklch(0.22 0.003 0)" },
  { id: "greyscale", label: "Greyscale", bgL: 0.19, hue: 250, chroma: 0.004, swatch: "oklch(0.30 0.005 250)" },
];

// Muted "rainbow" — desaturated, darker, never neon.
export const ACCENT_PALETTES: AccentPalette[] = [
  { id: "garnet", label: "Garnet", L: 0.54, C: 0.13, H: 25, swatch: "oklch(0.54 0.13 25)" },
  { id: "rust", label: "Rust", L: 0.58, C: 0.11, H: 55, swatch: "oklch(0.58 0.11 55)" },
  { id: "ochre", label: "Ochre", L: 0.62, C: 0.09, H: 90, swatch: "oklch(0.62 0.09 90)" },
  { id: "moss", label: "Moss", L: 0.55, C: 0.09, H: 145, swatch: "oklch(0.55 0.09 145)" },
  { id: "teal", label: "Teal", L: 0.55, C: 0.09, H: 195, swatch: "oklch(0.55 0.09 195)" },
  { id: "steel", label: "Steel", L: 0.55, C: 0.11, H: 245, swatch: "oklch(0.55 0.11 245)" },
  { id: "plum", label: "Plum", L: 0.52, C: 0.13, H: 305, swatch: "oklch(0.52 0.13 305)" },
  { id: "mauve", label: "Mauve", L: 0.60, C: 0.10, H: 345, swatch: "oklch(0.60 0.10 345)" },
];

export const DEFAULT_BG = "vanta";
export const DEFAULT_ACCENT = "plum";

const BG_KEY = "mement0_bg_palette";
const ACC_KEY = "mement0_accent_palette";

function ok(l: number, c: number, h: number) {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`;
}

export function applyPalettes(bgId: string, accentId: string) {
  if (typeof document === "undefined") return;
  const bg = BG_PALETTES.find((b) => b.id === bgId) ?? BG_PALETTES[0];
  const a = ACCENT_PALETTES.find((x) => x.id === accentId) ?? ACCENT_PALETTES[0];
  const root = document.documentElement;
  const h = bg.hue;
  const c = bg.chroma;
  const L = bg.bgL;

  const surfaces = {
    background: L,
    card: L + 0.04,
    popover: L + 0.03,
    secondary: L + 0.085,
    muted: L + 0.065,
    accent: L + 0.105,
    border: L + 0.125,
    input: L + 0.105,
    sidebar: Math.max(0.02, L - 0.02),
    sidebarAccent: L + 0.065,
    sidebarBorder: L + 0.085,
    fg: 0.965,
    mutedFg: 0.62,
    sidebarFg: 0.92,
  };

  const primary = ok(a.L, a.C, a.H);
  const primaryFg = ok(0.16, 0.02, a.H);

  const set = (name: string, value: string) => root.style.setProperty(name, value);

  set("--background", ok(surfaces.background, c, h));
  set("--foreground", ok(surfaces.fg, c, h));
  set("--card", ok(surfaces.card, c, h));
  set("--card-foreground", ok(surfaces.fg, c, h));
  set("--popover", ok(surfaces.popover, c, h));
  set("--popover-foreground", ok(surfaces.fg, c, h));
  set("--secondary", ok(surfaces.secondary, c, h));
  set("--secondary-foreground", ok(0.94, c, h));
  set("--muted", ok(surfaces.muted, c, h));
  set("--muted-foreground", ok(surfaces.mutedFg, c, h));
  set("--accent", ok(surfaces.accent, c, h));
  set("--accent-foreground", ok(0.96, c, h));
  set("--border", ok(surfaces.border, c, h));
  set("--input", ok(surfaces.input, c, h));

  set("--primary", primary);
  set("--primary-foreground", primaryFg);

  set("--sidebar", ok(surfaces.sidebar, c, h));
  set("--sidebar-foreground", ok(surfaces.sidebarFg, c, h));
  set("--sidebar-accent", ok(surfaces.sidebarAccent, c, h));
  set("--sidebar-accent-foreground", ok(0.96, c, h));
  set("--sidebar-border", ok(surfaces.sidebarBorder, c, h));

  root.classList.remove("light");
  root.classList.add("dark");
}

export function loadPaletteSelection(): { bg: string; accent: string } {
  if (typeof localStorage === "undefined") {
    return { bg: DEFAULT_BG, accent: DEFAULT_ACCENT };
  }
  const storedBg = localStorage.getItem(BG_KEY) ?? DEFAULT_BG;
  const storedAcc = localStorage.getItem(ACC_KEY) ?? DEFAULT_ACCENT;
  // Migrate retired ids.
  const bg = BG_PALETTES.find((b) => b.id === storedBg) ? storedBg : DEFAULT_BG;
  const accent = ACCENT_PALETTES.find((a) => a.id === storedAcc) ? storedAcc : DEFAULT_ACCENT;
  return { bg, accent };
}

export function savePaletteSelection(bg: string, accent: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(BG_KEY, bg);
  localStorage.setItem(ACC_KEY, accent);
}

// Retained for backwards compatibility with callers; always dark now.
export function isDarkPalette(_id: string) {
  return true;
}
export const DEFAULT_LIGHT_BG = DEFAULT_BG;
export const DEFAULT_DARK_BG = DEFAULT_BG;
