#!/usr/bin/env node
/**
 * Icon audit — verifies favicon / apple-touch-icon / og:image links in
 * src/routes/__root.tsx exist on disk and meet the size / content-type /
 * dimension budgets common browsers, iOS / Android home-screens, and social
 * crawlers expect.
 *
 * Resolves references in two ways:
 *   1. Literal URL strings ("/favicon-32.png") → public/favicon-32.png
 *   2. Module identifiers whose const expression is `<asset>.url` and `<asset>`
 *      imports a `.asset.json` pointer under src/assets/
 *
 * Hard fails (exit 1) on: missing required tag, missing file, wrong
 * content-type, dimensions outside the per-role range, size over the hard
 * max, or PNG that can't be decoded.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

const ROOT = process.cwd();
const ROOT_ROUTE = join(ROOT, "src/routes/__root.tsx");
const ASSETS_DIR = join(ROOT, "src/assets");
const PUBLIC_DIR = join(ROOT, "public");

const MIME = {
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".gif":  "image/gif",
};

/** PNG IHDR decoder — width/height from bytes 16..23 of a PNG. */
function pngDimensions(buf) {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Index every .asset.json under src/assets/ by its CDN url. */
function indexAssets() {
  /** @type {Record<string, {file:string, contentType:string, size:number, bin?:Buffer}>} */
  const byUrl = {};
  if (!existsSync(ASSETS_DIR)) return byUrl;
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!full.endsWith(".asset.json")) continue;
      const json = JSON.parse(readFileSync(full, "utf8"));
      const sibling = full.replace(/\.asset\.json$/, "");
      const bin = existsSync(sibling) ? readFileSync(sibling) : undefined;
      byUrl[json.url] = {
        file: relative(ROOT, full),
        contentType: json.content_type,
        size: json.size,
        bin,
      };
    }
  };
  walk(ASSETS_DIR);
  return byUrl;
}

/** Resolve an href/content value to a binary on disk plus metadata. */
function resolveRef(href, assets) {
  // 1) Literal absolute path served from /public
  if (href.startsWith("/") && !href.startsWith("/__l5e/")) {
    const full = join(PUBLIC_DIR, href.replace(/^\/+/, ""));
    if (!existsSync(full)) return { ok: false, reason: `file not found at public${href}` };
    const bin = readFileSync(full);
    const ext = href.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
    return {
      ok: true,
      source: `public${href}`,
      contentType: MIME[ext] ?? "application/octet-stream",
      size: bin.length,
      bin,
    };
  }
  // 2) CDN url backed by a .asset.json under src/assets/
  const asset = assets[href];
  if (asset) {
    return {
      ok: true,
      source: asset.file,
      contentType: asset.contentType,
      size: asset.size,
      bin: asset.bin,
    };
  }
  return { ok: false, reason: `unresolved reference (no public file, no asset pointer)` };
}

/** Parse icon-shaped link/meta tags from __root.tsx. */
function parseIconRefs() {
  const src = readFileSync(ROOT_ROUTE, "utf8");
  /** @type {{role:string, href:string, raw:string}[]} */
  const refs = [];
  const ICON_RELS = new Set(["icon", "shortcut icon", "apple-touch-icon", "mask-icon", "fluid-icon"]);

  const linkRe = /\{\s*rel:\s*["']([^"']+)["'][^}]*?href:\s*(?:["']([^"']+)["']|([A-Za-z_]\w*))/g;
  for (const m of src.matchAll(linkRe)) {
    if (!ICON_RELS.has(m[1])) continue;
    const href = m[2] ?? resolveIdent(src, m[3]);
    refs.push({ role: `link:${m[1]}`, href, raw: m[2] ?? m[3] });
  }
  const metaPropRe = /property:\s*["'](og:image|twitter:image)["'][^}]*?content:\s*(?:["']([^"']+)["']|([A-Za-z_]\w*))/g;
  for (const m of src.matchAll(metaPropRe)) {
    const href = m[2] ?? resolveIdent(src, m[3]);
    refs.push({ role: `meta:${m[1]}`, href, raw: m[2] ?? m[3] });
  }
  const metaNameRe = /name:\s*["'](twitter:image)["'][^}]*?content:\s*(?:["']([^"']+)["']|([A-Za-z_]\w*))/g;
  for (const m of src.matchAll(metaNameRe)) {
    const href = m[2] ?? resolveIdent(src, m[3]);
    refs.push({ role: `meta:${m[1]}`, href, raw: m[2] ?? m[3] });
  }

  // og:image / twitter:image now come from src/lib/brand-meta.ts via
  // rootMeta()/shareImageMeta(). If __root.tsx imports rootMeta or
  // shareImageMeta, synthesize refs from the brand config so this audit
  // still verifies the file on disk.
  if (/from\s+["']@\/lib\/brand-meta["']/.test(src)) {
    const brandFile = join(ROOT, "src/lib/brand-meta.ts");
    if (existsSync(brandFile)) {
      const brand = readFileSync(brandFile, "utf8");
      const pm = /ogImage\s*:\s*\{[^}]*path\s*:\s*["']([^"']+)["']/m.exec(brand);
      if (pm) {
        const path = pm[1];
        refs.push({ role: "meta:og:image", href: path, raw: "BRAND.ogImage.path" });
        refs.push({ role: "meta:twitter:image", href: path, raw: "BRAND.ogImage.path" });
      }
    }
  }
  return refs;
}

function scanForbiddenShareImageUrls() {
  const src = readFileSync(ROOT_ROUTE, "utf8");
  const errors = [];
  const usesBrandMeta = /from\s+["']@\/lib\/brand-meta["']/.test(src);
  const directShareMetaRe = /\{[^}]*?(?:property|name):\s*["'](og:image|twitter:image)["'][^}]*?content:\s*(?:["']([^"']+)["']|([A-Za-z_]\w*))[\s\S]*?\}/g;
  for (const match of src.matchAll(directShareMetaRe)) {
    const role = match[1];
    const raw = match[2] ?? match[3] ?? "<unknown>";
    const line = src.slice(0, match.index ?? 0).split("\n").length;
    if (usesBrandMeta) {
      errors.push(
        `${relative(ROOT, ROOT_ROUTE)}:${line}: direct ${role} metadata is forbidden when rootMeta()/brand-meta is imported; delete the inline tag and use src/lib/brand-meta.ts only (${raw}).`,
      );
    }
    if (/^https?:\/\//i.test(raw)) {
      errors.push(`forbidden external share image URL in ${relative(ROOT, ROOT_ROUTE)}:${line}: ${raw}`);
    }
  }
  const externalShareMetaRe = /\{[^}]*?(?:property|name):\s*["'](?:og:image|twitter:image)["'][^}]*?content:\s*["'](https?:\/\/[^"']+)["'][^}]*?\}/g;
  for (const match of src.matchAll(externalShareMetaRe)) {
    errors.push(`forbidden external share image URL in ${relative(ROOT, ROOT_ROUTE)}: ${match[1]}`);
  }
  return errors;
}

/** Resolve `const NAME = "literal"` or `const NAME = something.url;`. */
function resolveIdent(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
  const m = src.match(re);
  if (!m) return `<${name}>`;
  const expr = m[1].trim();
  const strLit = expr.match(/^["']([^"']+)["']$/);
  if (strLit) return strLit[1];
  const dot = expr.match(/^(\w+)\.url$/);
  if (dot) {
    const im = src.match(new RegExp(`import\\s+${dot[1]}\\s+from\\s+["']([^"']+)["']`));
    if (im) {
      const importPath = im[1].replace(/^@\//, "src/");
      const full = join(ROOT, importPath);
      if (existsSync(full)) return JSON.parse(readFileSync(full, "utf8")).url;
    }
  }
  return expr;
}

/**
 * Per-role budgets. `dims` is an allow-list of {w,h} pairs (exact match);
 * `dimsRange` is [{minW,minH,maxW,maxH}]. `types` is the content-type allow-list.
 */
const RULES = {
  "link:icon": {
    types: ["image/png", "image/svg+xml", "image/x-icon"],
    dims: [{ w: 32, h: 32 }, { w: 48, h: 48 }, { w: 64, h: 64 }, { w: 16, h: 16 }],
    hardMaxBytes: 100_000,
  },
  "link:shortcut icon": {
    types: ["image/png", "image/svg+xml", "image/x-icon"],
    dims: [{ w: 32, h: 32 }, { w: 48, h: 48 }, { w: 64, h: 64 }, { w: 16, h: 16 }],
    hardMaxBytes: 100_000,
  },
  "link:apple-touch-icon": {
    types: ["image/png"],
    dims: [{ w: 180, h: 180 }, { w: 152, h: 152 }, { w: 167, h: 167 }, { w: 192, h: 192 }],
    hardMaxBytes: 300_000,
  },
  "meta:og:image": {
    types: ["image/png", "image/jpeg", "image/webp"],
    dimsRange: { minW: 600, minH: 315, maxW: 4096, maxH: 4096 },
    // Recommended exact aspect 1.91:1 → 1200x630.
    preferred: { w: 1200, h: 630 },
    hardMaxBytes: 1_000_000,
  },
  "meta:twitter:image": {
    types: ["image/png", "image/jpeg", "image/webp"],
    dimsRange: { minW: 600, minH: 315, maxW: 4096, maxH: 4096 },
    preferred: { w: 1200, h: 630 },
    hardMaxBytes: 1_000_000,
  },
};

const REQUIRED = ["link:icon", "link:apple-touch-icon", "meta:og:image", "meta:twitter:image"];

function checkDims(rule, dims) {
  if (!dims) return { ok: false, msg: "dimensions could not be decoded" };
  if (rule.dims) {
    const hit = rule.dims.find((d) => d.w === dims.width && d.h === dims.height);
    if (!hit) return { ok: false, msg: `${dims.width}x${dims.height} — expected one of ${rule.dims.map((d) => `${d.w}x${d.h}`).join(", ")}` };
  }
  if (rule.dimsRange) {
    const r = rule.dimsRange;
    if (dims.width < r.minW || dims.height < r.minH || dims.width > r.maxW || dims.height > r.maxH) {
      return { ok: false, msg: `${dims.width}x${dims.height} outside ${r.minW}x${r.minH}..${r.maxW}x${r.maxH}` };
    }
  }
  return { ok: true };
}

function main() {
  const assets = indexAssets();
  const refs = parseIconRefs();
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];

  errors.push(...scanForbiddenShareImageUrls());

  const present = new Set(refs.map((r) => r.role));
  for (const must of REQUIRED) {
    if (!present.has(must)) errors.push(`missing required tag: ${must}`);
  }

  for (const role of ["meta:og:image", "meta:twitter:image"]) {
    const matches = refs.filter((r) => r.role === role);
    if (matches.length > 1) {
      errors.push(`${role}: duplicate tags found (${matches.length}); keep exactly one local /public image reference`);
    }
  }

  console.log(`Icon audit — ${refs.length} reference(s) in src/routes/__root.tsx\n`);

  for (const r of refs) {
    const rule = RULES[r.role];
    const resolved = resolveRef(r.href, assets);
    const head = `${r.role.padEnd(24)} ${r.href}`;
    if ((r.role === "meta:og:image" || r.role === "meta:twitter:image") && /^https?:\/\//i.test(r.href)) {
      errors.push(`${r.role}: external URLs are forbidden for share images; use /og-image.png or a tracked asset`);
    }
    if (!resolved.ok) {
      errors.push(`${r.role}: ${resolved.reason}`);
      console.log(`  ${head}\n    ✗ ${resolved.reason}`);
      continue;
    }
    const dims = resolved.bin ? pngDimensions(resolved.bin) : null;
    const sizeKB = (resolved.size / 1024).toFixed(1);
    const dimStr = dims ? `${dims.width}x${dims.height}` : "dims=?";
    console.log(`  ${head}\n    ↳ ${resolved.source}  type=${resolved.contentType}  size=${sizeKB}KB  ${dimStr}`);

    if (!rule) continue;
    if (!rule.types.includes(resolved.contentType)) {
      errors.push(`${r.role}: content-type ${resolved.contentType} not in [${rule.types.join(", ")}]`);
    }
    if (resolved.size > rule.hardMaxBytes) {
      errors.push(`${r.role}: ${sizeKB}KB exceeds hard budget ${(rule.hardMaxBytes / 1024).toFixed(0)}KB`);
    }
    // Dimension check only meaningful for PNG (svg has no IHDR).
    if (resolved.contentType === "image/png") {
      const dc = checkDims(rule, dims);
      if (!dc.ok) errors.push(`${r.role}: ${dc.msg}`);
      if (rule.preferred && dims && (dims.width !== rule.preferred.w || dims.height !== rule.preferred.h)) {
        warnings.push(`${r.role}: ${dims.width}x${dims.height} is valid but ${rule.preferred.w}x${rule.preferred.h} is the recommended share aspect (1.91:1)`);
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
