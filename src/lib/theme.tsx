import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  applyPalettes,
  loadPaletteSelection,
  savePaletteSelection,
  DEFAULT_BG,
  DEFAULT_ACCENT,
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

function applyTheme(mode: ThemeMode): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = mode === "system" ? (sysDark ? "dark" : "light") : mode;
  const html = document.documentElement;
  html.classList.remove("light", "dark");
  html.classList.add(resolved);
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");
  const [bgPalette, setBgPaletteState] = useState<string>(DEFAULT_BG);
  const [accentPalette, setAccentPaletteState] = useState<string>(DEFAULT_ACCENT);

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as ThemeMode | null) ?? "dark";
    setModeState(saved);
    setResolved(applyTheme(saved));
    const { bg, accent } = loadPaletteSelection();
    setBgPaletteState(bg);
    setAccentPaletteState(accent);
    applyPalettes(bg, accent);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(KEY) as ThemeMode | null) === "system") {
        setResolved(applyTheme("system"));
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function setMode(m: ThemeMode) {
    localStorage.setItem(KEY, m);
    setModeState(m);
    setResolved(applyTheme(m));
    // Re-apply palette so its custom vars win over the .light/.dark class.
    applyPalettes(bgPalette, accentPalette);
  }

  function setBgPalette(id: string) {
    setBgPaletteState(id);
    savePaletteSelection(id, accentPalette);
    applyPalettes(id, accentPalette);
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
