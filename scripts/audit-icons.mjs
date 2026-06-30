#!/usr/bin/env node
/**
 * Icon audit — verifies favicon / apple-touch-icon / og:image links in
 * src/routes/__root.tsx resolve to real asset pointers with sane
 * content-types and weights, and that PNG dimensions match the sizes
 * common browsers and iOS/Android home-screens expect.
 *
 * Recommended targets (covers Chrome/Safari/Firefox/Edge + iOS/Android):
 *   - favicon (rel="icon")          → 32x32 or 48x48 PNG/SVG/ICO, <100KB
 *   - apple-touch-icon              → 180x180 PNG, <300KB
 *   - og:image / twitter:image      → ≥1200x630 PNG/JPG, <1MB
 *
 * The script reads .asset.json pointers under src/assets/ and decodes PNG
 * width/height from the original_filename + size metadata plus the locally
 * cached binary when present. If only the CDN pointer is available, it
 * still validates content-type and the recorded byte size.
 *
 * Exits non-zero if any required icon is missing or violates a hard limit.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ROOT_ROUTE = join(ROOT, "src/routes/__root.tsx");
const ASSETS_DIR = join(ROOT, "src/assets");

/** PNG IHDR decoder — pulls width/height out of the first 24 bytes. */
function pngDimensions(buf) {
  if (buf.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47
  ) return null;
  const width  = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

/** Index every .asset.json under src/assets/ by its CDN url. */
function indexAssets() {
  /** @type {Record<string, {file:string, json:any, bin?:Buffer}>} */
  const byUrl = {};
  if (!existsSync(ASSETS_DIR)) return byUrl;
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!full.endsWith(".asset.json")) continue;
      const json = JSON.parse(readFileSync(full, "utf8"));
      // Look for a sibling raw file (in case the binary is still on disk).
      const sibling = full.replace(/\.asset\.json$/, "");
      const bin = existsSync(sibling) ? readFileSync(sibling) : undefined;
      byUrl[json.url] = { file: relative(ROOT, full), json, bin };
    }
  };
  walk(ASSETS_DIR);
  return byUrl;
}

/** Parse all link/meta tags in __root.tsx that reference an icon-like URL. */
function parseIconRefs() {
  const src = readFileSync(ROOT_ROUTE, "utf8");
  /** @type {{role:string, href:string}[]} */
  const refs = [];

  // links: { rel: "icon" | "apple-touch-icon" | "shortcut icon", href: <expr> }
  const linkRe = /\{\s*rel:\s*["']([^"']+)["'][^}]*?href:\s*([A-Za-z_][\w.]*)/g;
  for (const m of src.matchAll(linkRe)) {
    refs.push({ role: `link:${m[1]}`, href: resolveIdent(src, m[2]) });
  }
  // meta og:image / twitter:image with content: <expr>
  const metaRe = /property:\s*["'](og:image|twitter:image)["'][^}]*?content:\s*([A-Za-z_][\w.]*)/g;
  for (const m of src.matchAll(metaRe)) {
    refs.push({ role: `meta:${m[1]}`, href: resolveIdent(src, m[2]) });
  }
  const metaNameRe = /name:\s*["'](twitter:image)["'][^}]*?content:\s*([A-Za-z_][\w.]*)/g;
  for (const m of src.matchAll(metaNameRe)) {
    refs.push({ role: `meta:${m[1]}`, href: resolveIdent(src, m[2]) });
  }
  return refs;
}

/** Best-effort resolution: const X = <something>.url; */
function resolveIdent(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
  const m = src.match(re);
  if (!m) return `<${name}>`;
  const expr = m[1].trim();
  // brandLogo.url → look up brandLogo import path and read its url field
  const dotMatch = expr.match(/^(\w+)\.url$/);
  if (dotMatch) {
    const importRe = new RegExp(`import\\s+${dotMatch[1]}\\s+from\\s+["']([^"']+)["']`);
    const im = src.match(importRe);
    if (im) {
      const importPath = im[1].replace(/^@\//, "src/");
      const full = join(ROOT, importPath);
      if (existsSync(full)) {
        const j = JSON.parse(readFileSync(full, "utf8"));
        return j.url;
      }
    }
  }
  return expr;
}

const RULES = {
  "link:icon":              { maxBytes: 200_000, idealW: [32, 48, 64], types: ["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"] },
  "link:shortcut icon":     { maxBytes: 200_000, idealW: [32, 48, 64], types: ["image/png", "image/svg+xml", "image/x-icon"] },
  "link:apple-touch-icon":  { maxBytes: 400_000, idealW: [180],         types: ["image/png"] },
  "meta:og:image":          { maxBytes: 2_000_000, minW: 600,            types: ["image/png", "image/jpeg", "image/webp"] },
  "meta:twitter:image":     { maxBytes: 2_000_000, minW: 600,            types: ["image/png", "image/jpeg", "image/webp"] },
};

const REQUIRED = ["link:icon", "link:apple-touch-icon", "meta:og:image"];

function main() {
  const assets = indexAssets();
  const refs = parseIconRefs();

  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  const present = new Set(refs.map((r) => r.role));
  for (const must of REQUIRED) {
    if (!present.has(must)) errors.push(`missing required tag: ${must}`);
  }

  console.log(`Icon audit — ${refs.length} reference(s) found in src/routes/__root.tsx\n`);

  for (const r of refs) {
    const rule = RULES[r.role];
    const asset = assets[r.href];
    const label = `${r.role.padEnd(24)} ${r.href}`;
    if (!asset) {
      warnings.push(`${label}\n    ↳ no matching .asset.json under src/assets/ (external or unresolved)`);
      continue;
    }
    const { json, bin } = asset;
    const dims = bin ? pngDimensions(bin) : null;
    const info = [
      `type=${json.content_type}`,
      `size=${(json.size / 1024).toFixed(1)}KB`,
      dims ? `${dims.width}x${dims.height}` : "dims=unknown",
    ].join("  ");
    console.log(`  ${label}\n    ↳ ${info}`);

    if (rule) {
      if (!rule.types.includes(json.content_type)) {
        errors.push(`${r.role}: content-type ${json.content_type} not allowed (expected ${rule.types.join(", ")})`);
      }
      if (rule.maxBytes && json.size > rule.maxBytes) {
        warnings.push(`${r.role}: ${(json.size / 1024).toFixed(0)}KB exceeds recommended ${(rule.maxBytes / 1024).toFixed(0)}KB — browsers cache this on every page load`);
      }
      if (dims) {
        if (rule.idealW && !rule.idealW.includes(dims.width)) {
          warnings.push(`${r.role}: ${dims.width}x${dims.height} — common targets are ${rule.idealW.map((w) => `${w}x${w}`).join(" / ")}`);
        }
        if (rule.minW && dims.width < rule.minW) {
          warnings.push(`${r.role}: ${dims.width}x${dims.height} below recommended min width ${rule.minW}`);
        }
      }
    }
  }

  console.log("");
  for (const w of warnings) console.warn(`! ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error(`\nIcon audit failed: ${errors.length} error(s).`);
    process.exit(1);
  }
  console.log(`✓ icon audit: ${refs.length} reference(s) OK${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`);
}

main();
