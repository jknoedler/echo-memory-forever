#!/usr/bin/env node
/**
 * Playwright icon check — boots a local vite preview server, navigates to
 * the homepage in headless Chromium, and verifies that every icon URL the
 * page advertises actually returns 200 with the correct content-type and
 * the expected dimensions.
 *
 * Run after a build:
 *   bun run build && bun run check:icons:playwright
 *
 * CI uses this to guarantee favicons / apple-touch-icon / og:image /
 * twitter:image survive the bundle pipeline (some build steps silently
 * drop public/ assets when paths are misconfigured).
 */
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const PORT = Number(process.env.PREVIEW_PORT ?? 4173);
const ORIGIN = `http://127.0.0.1:${PORT}`;

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.error("✗ playwright not installed. Run: bun add -d playwright && bunx playwright install --with-deps chromium");
  process.exit(1);
}

const ICON_RELS = new Set(["icon", "shortcut icon", "apple-touch-icon", "manifest"]);
// Social-card metas: og:image (LinkedIn, Slack, Discord, iMessage, Facebook),
// twitter:image (X), plus explicit LinkedIn / Pinterest hints when present.
const META_NAMES = new Set([
  "og:image", "og:image:url", "og:image:secure_url",
  "twitter:image", "twitter:image:src",
  "linkedin:image", "thumbnail",
]);

const TYPES = {
  "icon":             ["image/png","image/svg+xml","image/x-icon","image/vnd.microsoft.icon"],
  "shortcut icon":    ["image/png","image/svg+xml","image/x-icon","image/vnd.microsoft.icon"],
  "apple-touch-icon": ["image/png"],
  "manifest":         ["application/manifest+json","application/json","text/json"],
  "og:image":         ["image/png","image/jpeg","image/webp"],
  "og:image:url":     ["image/png","image/jpeg","image/webp"],
  "og:image:secure_url": ["image/png","image/jpeg","image/webp"],
  "twitter:image":    ["image/png","image/jpeg","image/webp"],
  "twitter:image:src":["image/png","image/jpeg","image/webp"],
  "linkedin:image":   ["image/png","image/jpeg","image/webp"],
  "thumbnail":        ["image/png","image/jpeg","image/webp"],
};

function pngDims(buf) {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function startPreview() {
  const proc = spawn("bunx", ["vite", "preview", "--port", String(PORT), "--host", "127.0.0.1"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", () => {});
  // Poll until the server answers.
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(ORIGIN);
      if (res.ok) return proc;
    } catch {}
    await wait(200);
  }
  proc.kill("SIGTERM");
  throw new Error(`preview server failed to start on ${ORIGIN}`);
}

async function run() {
  let preview;
  // If something already serves on PORT (e.g. user running `bun run preview`),
  // reuse it instead of spawning a duplicate.
  try {
    const probe = await fetch(ORIGIN, { signal: AbortSignal.timeout(500) });
    if (!probe.ok) throw new Error("not ok");
    console.log(`ℹ Reusing existing server on ${ORIGIN}`);
  } catch {
    console.log(`▶ Starting vite preview on ${ORIGIN}`);
    preview = await startPreview();
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });

    const refs = await page.evaluate(({ ICON_RELS, META_NAMES }) => {
      const out = [];
      document.querySelectorAll("link[rel]").forEach((l) => {
        const rel = (l.getAttribute("rel") || "").toLowerCase();
        if (ICON_RELS.includes(rel)) {
          out.push({ role: rel, href: l.getAttribute("href") || "", sizes: l.getAttribute("sizes") || "" });
        }
      });
      document.querySelectorAll("meta").forEach((m) => {
        const key = (m.getAttribute("property") || m.getAttribute("name") || "").toLowerCase();
        if (META_NAMES.includes(key)) {
          out.push({ role: key, href: m.getAttribute("content") || "", sizes: "" });
        }
      });
      return out;
    }, { ICON_RELS: [...ICON_RELS], META_NAMES: [...META_NAMES] });

    if (!refs.length) errors.push("homepage exposed zero icon/meta references");

    for (const ref of refs) {
      const url = ref.href.startsWith("http") ? ref.href : new URL(ref.href, ORIGIN).toString();
      let res;
      try { res = await fetch(url); }
      catch (e) { errors.push(`${ref.role} ${url} — fetch failed: ${e.message}`); continue; }
      if (res.status !== 200) {
        errors.push(`${ref.role} ${url} — HTTP ${res.status}`);
        continue;
      }
      const ctype = (res.headers.get("content-type") || "").split(";")[0].trim();
      const allowed = TYPES[ref.role] || [];
      if (allowed.length && !allowed.includes(ctype)) {
        errors.push(`${ref.role} ${url} — content-type ${ctype} not in [${allowed.join(", ")}]`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) { errors.push(`${ref.role} ${url} — empty body`); continue; }

      if (ctype === "image/png") {
        const d = pngDims(buf);
        if (!d) { errors.push(`${ref.role} ${url} — invalid PNG`); continue; }
        if (ref.role === "apple-touch-icon" && (d.width !== 180 || d.height !== 180)) {
          errors.push(`${ref.role} ${url} — ${d.width}x${d.height}, expected 180x180`);
        }
        if (ref.sizes && /^\d+x\d+$/.test(ref.sizes)) {
          const [w,h] = ref.sizes.split("x").map(Number);
          if (d.width !== w || d.height !== h) {
            errors.push(`${ref.role} ${url} — sizes="${ref.sizes}" but image is ${d.width}x${d.height}`);
          }
        }
        if ((ref.role === "og:image" || ref.role === "twitter:image" || ref.role === "linkedin:image")
            && (d.width < 600 || d.height < 315)) {
          errors.push(`${ref.role} ${url} — ${d.width}x${d.height} smaller than 600x315`);
        }
        // LinkedIn recommends 1200x627 (close to og 1.91:1); flag bad ratios.
        if (ref.role === "og:image" && d.width / d.height < 1.6) {
          errors.push(`${ref.role} ${url} — aspect ratio ${(d.width/d.height).toFixed(2)} not LinkedIn-friendly (expect ≥1.6)`);
        }
        console.log(`  ✓ ${ref.role.padEnd(18)} ${url} → 200 ${ctype} ${d.width}x${d.height} ${(buf.length/1024).toFixed(1)}KB`);
      } else {
        console.log(`  ✓ ${ref.role.padEnd(18)} ${url} → 200 ${ctype} ${(buf.length/1024).toFixed(1)}KB`);
      }
    }
  } finally {
    await browser.close();
    if (preview) preview.kill("SIGTERM");
  }

  if (errors.length) {
    console.error(`\n✗ icon playwright check failed: ${errors.length} error(s).`);
    errors.forEach((e) => console.error("  " + e));
    process.exit(1);
  }
  console.log(`\n✓ icon playwright check: all references return 200 with correct type + dimensions.`);
}

run().catch((e) => { console.error("✗ playwright check crashed:", e); process.exit(1); });
