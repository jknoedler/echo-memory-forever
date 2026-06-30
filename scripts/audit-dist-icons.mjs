#!/usr/bin/env node
/**
 * Post-build icon audit — runs AFTER `vite build` (and AFTER nitro emits
 * the Cloudflare Worker bundle). Walks the generated build output and
 * confirms every icon URL referenced from the prerendered HTML still
 * resolves to a real file with the expected content-type + dimensions
 * + byte budget.
 *
 * Why this exists in addition to scripts/audit-icons.mjs:
 *   - audit-icons.mjs reads `src/routes/__root.tsx` (source-of-truth).
 *   - audit-dist-icons.mjs reads the EMITTED HTML in dist/.output, so it
 *     catches regressions where the build pipeline drops, rewrites, or
 *     fails to copy a `public/` asset into the deploy bundle.
 *
 * If no build output is present, the script is a no-op (exit 0) — so it's
 * safe to wire into local `bun run audit` without a prior build.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

// Candidate roots. TanStack Start on Cloudflare emits to .output/public;
// a plain vite build emits to dist. We accept whichever exists.
const CANDIDATES = [
  { root: join(ROOT, ".output", "public"), label: ".output/public" },
  { root: join(ROOT, "dist"),              label: "dist" },
];

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

const RULES = {
  "icon":              { types: ["image/png","image/svg+xml","image/x-icon"], hardMaxBytes: 100_000, expectDims: [[16,16],[32,32],[48,48],[64,64]] },
  "shortcut icon":     { types: ["image/png","image/svg+xml","image/x-icon"], hardMaxBytes: 100_000, expectDims: [[16,16],[32,32],[48,48],[64,64]] },
  "apple-touch-icon":  { types: ["image/png"], hardMaxBytes: 300_000, expectDims: [[152,152],[167,167],[180,180],[192,192]] },
  "og:image":          { types: ["image/png","image/jpeg","image/webp"], hardMaxBytes: 1_000_000, minDims: [600,315], preferred: [1200,630] },
  "twitter:image":     { types: ["image/png","image/jpeg","image/webp"], hardMaxBytes: 1_000_000, minDims: [600,315], preferred: [1200,630] },
};
const REQUIRED = ["icon", "apple-touch-icon", "og:image", "twitter:image"];

function pngDimensions(buf) {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function findHtml(dir) {
  /** @type {string[]} */ const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...findHtml(full)); continue; }
    if (/\.html?$/.test(entry)) out.push(full);
  }
  return out;
}

function parseRefs(html) {
  /** @type {{role:string, href:string}[]} */ const refs = [];
  const linkRe = /<link\b[^>]*\brel=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(linkRe)) {
    if (RULES[m[1]]) refs.push({ role: m[1], href: m[2] });
  }
  const metaRe = /<meta\b[^>]*\b(?:property|name)=["'](og:image|twitter:image)["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(metaRe)) refs.push({ role: m[1], href: m[2] });
  return refs;
}

function checkOne(root, ref, errors, warnings) {
  if (!ref.href.startsWith("/")) {
    warnings.push(`${ref.role}: skipped non-root href ${ref.href}`);
    return;
  }
  const full = join(root, ref.href.replace(/^\/+/, "").split("?")[0]);
  if (!existsSync(full)) {
    errors.push(`${ref.role}: missing build asset ${ref.href}`);
    return;
  }
  const bin = readFileSync(full);
  const ext = ref.href.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  const ctype = MIME[ext] ?? "application/octet-stream";
  const rule = RULES[ref.role];

  if (!rule.types.includes(ctype)) {
    errors.push(`${ref.role}: content-type ${ctype} not in [${rule.types.join(", ")}]`);
  }
  if (bin.length > rule.hardMaxBytes) {
    errors.push(`${ref.role}: ${(bin.length/1024).toFixed(1)}KB exceeds ${(rule.hardMaxBytes/1024).toFixed(0)}KB budget`);
  }
  if (ctype === "image/png") {
    const d = pngDimensions(bin);
    if (!d) { errors.push(`${ref.role}: PNG dimensions unreadable`); return; }
    if (rule.expectDims) {
      const hit = rule.expectDims.some(([w,h]) => d.width === w && d.height === h);
      if (!hit) errors.push(`${ref.role}: ${d.width}x${d.height} — expected one of ${rule.expectDims.map(([w,h])=>`${w}x${h}`).join(", ")}`);
    }
    if (rule.minDims && (d.width < rule.minDims[0] || d.height < rule.minDims[1])) {
      errors.push(`${ref.role}: ${d.width}x${d.height} smaller than required ${rule.minDims[0]}x${rule.minDims[1]}`);
    }
    if (rule.preferred && (d.width !== rule.preferred[0] || d.height !== rule.preferred[1])) {
      warnings.push(`${ref.role}: ${d.width}x${d.height} valid but ${rule.preferred[0]}x${rule.preferred[1]} preferred`);
    }
  }
}

function main() {
  const target = CANDIDATES.find((c) => existsSync(c.root));
  if (!target) {
    console.log("ℹ dist audit: no build output found (skipping). Run `bun run build` first to enforce.");
    process.exit(0);
  }
  const htmlFiles = findHtml(target.root);
  if (htmlFiles.length === 0) {
    // SPA shells may live in the prerender output of nitro under .output/server.
    // Without HTML we can still spot-check the public dir for the known files.
    console.log(`ℹ dist audit: no HTML in ${target.label}; falling back to public-dir spot-check.`);
    const errors = [];
    for (const name of ["favicon-32.png", "apple-touch-icon.png", "og-image.png"]) {
      if (!existsSync(join(target.root, name))) errors.push(`missing ${target.label}/${name}`);
    }
    if (errors.length) { errors.forEach((e) => console.error("✗ " + e)); process.exit(1); }
    console.log(`✓ dist audit: ${target.label} contains the expected icon files.`);
    return;
  }

  let errors = []; let warnings = [];
  let totalRefs = 0;
  const seenRoles = new Set();
  for (const html of htmlFiles) {
    const refs = parseRefs(readFileSync(html, "utf8"));
    totalRefs += refs.length;
    for (const r of refs) {
      seenRoles.add(r.role);
      checkOne(target.root, r, errors, warnings);
    }
  }
  for (const must of REQUIRED) {
    if (!seenRoles.has(must)) errors.push(`missing required tag in built HTML: ${must}`);
  }

  console.log(`Dist icon audit — ${totalRefs} reference(s) across ${htmlFiles.length} HTML file(s) in ${target.label}`);
  for (const w of warnings) console.warn("! " + w);
  if (errors.length) {
    errors.forEach((e) => console.error("✗ " + e));
    console.error(`\nDist icon audit failed: ${errors.length} error(s).`);
    process.exit(1);
  }
  console.log(`✓ dist icon audit: all icon/meta references resolved and within budget.`);
}

main();
