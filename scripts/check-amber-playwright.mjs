#!/usr/bin/env node
/**
 * Playwright amber/ember audit — boots a preview server, loads the
 * homepage, and walks every rendered element checking for any amber-tinted
 * color, shadow, gradient, or background. The build was migrated off
 * amber to obsidian-purple; this check fails CI if amber ever leaks back
 * in (raw tailwind classes, stale CSS tokens, hex literals in inline
 * styles, etc.).
 *
 * Amber detection covers:
 *   - hex strings whose hue lives in the amber/ember band
 *   - rgb() strings whose hue lives in the amber/ember band
 *   - literal token names (`ember`, `amber`, `--ember`, `ember-text`)
 *
 * Runs after build:  bun run check:amber:playwright
 */
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const PORT = Number(process.env.PREVIEW_PORT ?? 4173);
const ORIGIN = `http://127.0.0.1:${PORT}`;

let playwright;
try { playwright = await import("playwright"); }
catch {
  console.error("✗ playwright not installed. Run: bun add -d playwright && bunx playwright install --with-deps chromium");
  process.exit(1);
}

async function startPreview() {
  const proc = spawn("bunx", ["vite", "preview", "--port", String(PORT), "--host", "127.0.0.1"], {
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env },
  });
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", () => {});
  for (let i = 0; i < 50; i++) {
    try { const res = await fetch(ORIGIN); if (res.ok) return proc; } catch {}
    await wait(200);
  }
  proc.kill("SIGTERM");
  throw new Error(`preview server failed to start on ${ORIGIN}`);
}

async function run() {
  let preview;
  try {
    const probe = await fetch(ORIGIN, { signal: AbortSignal.timeout(500) });
    if (!probe.ok) throw new Error("not ok");
    console.log(`ℹ Reusing existing server on ${ORIGIN}`);
  } catch {
    console.log(`▶ Starting vite preview on ${ORIGIN}`);
    preview = await startPreview();
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const offences = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await ctx.newPage();
    await page.goto(ORIGIN, { waitUntil: "networkidle" });

    const results = await page.evaluate(() => {
      // --- color helpers (run in page) -----------------------------------
      function hexToHsl(hex) {
        const m = hex.replace("#", "");
        const s = m.length === 3 ? m.split("").map(c => c + c).join("") : m;
        if (s.length < 6) return null;
        const r = parseInt(s.slice(0, 2), 16) / 255;
        const g = parseInt(s.slice(2, 4), 16) / 255;
        const b = parseInt(s.slice(4, 6), 16) / 255;
        return rgbToHsl(r, g, b);
      }
      function rgbToHsl(r, g, b) {
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return { h: 0, s: 0, l };
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          default: h = (r - g) / d + 4;
        }
        return { h: (h * 60) % 360, s, l };
      }
      // Amber/ember sits around hue 25°–55° with meaningful saturation.
      function isAmber(hsl) {
        if (!hsl) return false;
        return hsl.h >= 20 && hsl.h <= 60 && hsl.s >= 0.35 && hsl.l > 0.18 && hsl.l < 0.85;
      }
      function scanString(s) {
        if (!s) return false;
        if (/\b(ember|amber)\b/i.test(s)) return true;
        const hexes = s.match(/#[0-9a-fA-F]{3,8}/g) || [];
        for (const h of hexes) if (isAmber(hexToHsl(h))) return true;
        const rgbs = s.match(/rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+/g) || [];
        for (const rgb of rgbs) {
          const m = rgb.match(/(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
          if (!m) continue;
          if (isAmber(rgbToHsl(+m[1]/255, +m[2]/255, +m[3]/255))) return true;
        }
        return false;
      }
      // --- walk DOM ------------------------------------------------------
      const props = ["color","backgroundColor","backgroundImage","borderColor",
        "borderTopColor","borderRightColor","borderBottomColor","borderLeftColor",
        "boxShadow","outlineColor","textShadow","fill","stroke","caretColor"];
      const hits = [];
      const nodes = document.querySelectorAll("*");
      for (const el of nodes) {
        const cs = getComputedStyle(el);
        for (const p of props) {
          const v = cs.getPropertyValue(p);
          if (scanString(v)) {
            hits.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.getAttribute("class") || "").slice(0, 80),
              prop: p,
              value: v.slice(0, 120),
            });
            if (hits.length >= 25) return { hits, truncated: true };
          }
        }
        // class names like `ember-text` or `text-amber-500`
        const cls = el.getAttribute("class") || "";
        if (/\b(ember|amber)[-_]/i.test(cls)) {
          hits.push({ tag: el.tagName.toLowerCase(), cls: cls.slice(0, 80), prop: "class", value: cls.slice(0, 120) });
        }
      }
      // Also scan CSS variables on :root.
      const rootStyle = getComputedStyle(document.documentElement);
      for (let i = 0; i < rootStyle.length; i++) {
        const name = rootStyle[i];
        if (!name.startsWith("--")) continue;
        const value = rootStyle.getPropertyValue(name);
        if (/ember|amber/i.test(name) || scanString(value)) {
          hits.push({ tag: ":root", cls: "", prop: name, value: value.slice(0, 120) });
        }
      }
      return { hits, truncated: false };
    });

    for (const h of results.hits) offences.push(h);
    if (results.truncated) console.warn("  (scan truncated at 25 hits)");
  } finally {
    await browser.close();
    if (preview) preview.kill("SIGTERM");
  }

  if (offences.length) {
    console.error(`\n✗ amber audit failed: ${offences.length} offence(s).`);
    offences.forEach((o) =>
      console.error(`  <${o.tag}${o.cls ? ` class="${o.cls}"` : ""}>  ${o.prop}: ${o.value}`));
    process.exit(1);
  }
  console.log("✓ amber audit: rendered homepage contains no amber/ember styles.");
}
run().catch((e) => { console.error("✗ amber audit crashed:", e); process.exit(1); });
