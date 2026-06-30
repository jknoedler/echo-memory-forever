import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  applyPalettes,
  loadPaletteSelection,
  savePaletteSelection,
  isDarkPalette,
  DEFAULT_BG,
  DEFAULT_ACCENT,
  DEFAULT_LIGHT_BG,
  DEFAULT_DARK_BG,
} from "./palette";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "mement0_theme";

type Ctx = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  resolved: "light" | "dark";
  bgPalette: string;
  accentPalette: string;
  setBgPalette: (id: string) => void;
  setAccentPalette: (id: string) => void;
};
const ThemeCtx = createContext<Ctx | null>(null);

function systemPrefersDark() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveMode(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");
  const [bgPalette, setBgPaletteState] = useState<string>(DEFAULT_BG);
  const [accentPalette, setAccentPaletteState] = useState<string>(DEFAULT_ACCENT);

  useEffect(() => {
    const savedMode = (localStorage.getItem(KEY) as ThemeMode | null) ?? "dark";
    const { bg, accent } = loadPaletteSelection();
    const r = resolveMode(savedMode);
    // Reconcile: if saved bg doesn't match resolved tone, pick the matching default.
    const reconciledBg =
      isDarkPalette(bg) === (r === "dark") ? bg : r === "dark" ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;
    setModeState(savedMode);
    setResolved(r);
    setBgPaletteState(reconciledBg);
    setAccentPaletteState(accent);
    applyPalettes(reconciledBg, accent);
    if (reconciledBg !== bg) savePaletteSelection(reconciledBg, accent);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(KEY) as ThemeMode | null) === "system") {
        const nr = resolveMode("system");
        setResolved(nr);
        const cur = localStorage.getItem("mement0_bg_palette") ?? DEFAULT_BG;
        const next =
          isDarkPalette(cur) === (nr === "dark") ? cur : nr === "dark" ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;
        setBgPaletteState(next);
        savePaletteSelection(next, accentPalette);
        applyPalettes(next, accentPalette);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setMode(m: ThemeMode) {
    localStorage.setItem(KEY, m);
    setModeState(m);
    const r = resolveMode(m);
    setResolved(r);
    // If current bg doesn't match the chosen tone, swap to a sensible default of that tone.
    const nextBg =
      isDarkPalette(bgPalette) === (r === "dark")
        ? bgPalette
        : r === "dark"
          ? DEFAULT_DARK_BG
          : DEFAULT_LIGHT_BG;
    if (nextBg !== bgPalette) {
      setBgPaletteState(nextBg);
      savePaletteSelection(nextBg, accentPalette);
    }
    applyPalettes(nextBg, accentPalette);
  }

  function setBgPalette(id: string) {
    setBgPaletteState(id);
    savePaletteSelection(id, accentPalette);
    applyPalettes(id, accentPalette);
    // Keep mode in sync with chosen tone (so the Light/Dark buttons reflect reality).
    const tone: "light" | "dark" = isDarkPalette(id) ? "dark" : "light";
    if (resolved !== tone) {
      setResolved(tone);
      // Only override stored mode when it's an explicit conflict — leave 'system' alone.
      const stored = (localStorage.getItem(KEY) as ThemeMode | null) ?? "dark";
      if (stored !== "system") {
        localStorage.setItem(KEY, tone);
        setModeState(tone);
      }
    }
  }

  function setAccentPalette(id: string) {
    setAccentPaletteState(id);
    savePaletteSelection(bgPalette, id);
    applyPalettes(bgPalette, id);
  }

  return (
    <ThemeCtx.Provider
      value={{
        mode,
        setMode,
        resolved,
        bgPalette,
        accentPalette,
        setBgPalette,
        setAccentPalette,
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme must be used inside ThemeProvider");
  return c;
}
