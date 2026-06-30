import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  applyPalettes,
  loadPaletteSelection,
  savePaletteSelection,
  DEFAULT_BG,
  DEFAULT_ACCENT,
} from "./palette";

// Mement0 is dark-only. Mode is kept in the type for back-compat but is
// always "dark" and cannot be changed from the UI.
export type ThemeMode = "dark";

type Ctx = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  resolved: "dark";
  bgPalette: string;
  accentPalette: string;
  setBgPalette: (id: string) => void;
  setAccentPalette: (id: string) => void;
};
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [bgPalette, setBgPaletteState] = useState<string>(DEFAULT_BG);
  const [accentPalette, setAccentPaletteState] = useState<string>(DEFAULT_ACCENT);

  useEffect(() => {
    const { bg, accent } = loadPaletteSelection();
    setBgPaletteState(bg);
    setAccentPaletteState(accent);
    applyPalettes(bg, accent);
  }, []);

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
        mode: "dark",
        setMode: () => {},
        resolved: "dark",
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
