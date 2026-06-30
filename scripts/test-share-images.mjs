#!/usr/bin/env node
/**
 * Share-image + external-URL regression test.
 *
 * Enforces three rules across the entire src/ tree:
 *
 *   1. The brand config (src/lib/brand-meta.ts) declares ONE og image path,
 *      and that path resolves to a real file under public/.
 *
 *   2. No route file (src/routes/**.tsx) and no shared meta helper may
 *      reference an external http(s) URL in an og:image or twitter:image
 *      meta entry. These tags MUST come from brand-meta.ts and be local
 *      /public paths.
 *
 *   3. No og:image / twitter:image literal in any source file may point to
 *      an external URL. Catches accidental pastes of preview URLs.
 *
 * Failure prints exact remediation steps so the build error is actionable.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public");
const BRAND_FILE = join(ROOT, "src/lib/brand-meta.ts");
const SRC = join(ROOT, "src");

const errors = [];

// ── Rule 1: brand-meta.ts ogImage.path must exist in public/ ───────────────
if (!existsSync(BRAND_FILE)) {
  errors.push(
    `brand-meta.ts not found at ${relative(ROOT, BRAND_FILE)} — this is the single source of truth for share-image metadata; restore it.`,
  );
} else {
  const brand = readFileSync(BRAND_FILE, "utf8");
  const pathMatch = /ogImage\s*:\s*\{[^}]*path\s*:\s*["']([^"']+)["']/m.exec(brand);
  if (!pathMatch) {
    errors.push(
      "brand-meta.ts: cannot locate ogImage.path literal. Keep it as `path: \"/og-image.png\"` (or another local /public path).",
    );
  } else {
    const value = pathMatch[1];
    if (/^https?:\/\//i.test(value)) {
      errors.push(
        `brand-meta.ts: ogImage.path is an external URL (${value}). Share image MUST be a local /public path.`,
      );
    } else if (!value.startsWith("/")) {
      errors.push(
        `brand-meta.ts: ogImage.path must be an absolute /public path, got '${value}'.`,
      );
    } else {
      const onDisk = join(PUBLIC_DIR, value.replace(/^\/+/, ""));
      if (!existsSync(onDisk)) {
        errors.push(
          `brand-meta.ts: ogImage.path '${value}' has no matching file at public${value}. Add the file or update the path.`,
        );
      }
    }
  }
}

// ── Rule 2 + 3: scan source tree for forbidden patterns ────────────────────
const EXT = /\.(tsx?|mts|cts)$/;
const skip = new Set(["node_modules", "dist", ".output", ".nitro", ".vite", "routeTree.gen.ts"]);
// Match meta entry that declares og:image or twitter:image (any role suffix)
// together with its content value on the same object literal.
const SHARE_META_RE =
  /\{\s*(?:property|name)\s*:\s*["'](og:image(?::[a-z]+)?|twitter:image)["']\s*,\s*content\s*:\s*([^,}]+?)\s*\}/g;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!EXT.test(entry)) continue;
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    if (rel.endsWith("brand-meta.ts")) continue; // canonical source
    if (rel.endsWith("test-share-images.mjs")) continue;
    const text = readFileSync(full, "utf8");

    // Forbid literal external URLs in og:image / twitter:image entries.
    for (const m of text.matchAll(SHARE_META_RE)) {
      const raw = m[2].trim();
      const literal = raw.match(/^["'`](.+)["'`]$/);
      const val = literal ? literal[1] : raw;
      if (/^https?:\/\//i.test(val)) {
        errors.push(
          `${rel}: ${m[1]} points to an external URL (${val}). Remove it — share images come from src/lib/brand-meta.ts.`,
        );
      } else if (literal && !val.startsWith("/")) {
        errors.push(
          `${rel}: ${m[1]} must be a local /public path, got '${val}'.`,
        );
      }
    }

    // Catch raw https URLs sitting near an og:image / twitter:image key.
    const adjacent = /(og:image(?::[a-z]+)?|twitter:image)["'][^}]{0,160}https?:\/\/[^"'\s}]+/g;
    let a;
    while ((a = adjacent.exec(text)) !== null) {
      errors.push(
        `${rel}: external URL adjacent to ${a[1]} — only /public paths via brand-meta.ts are allowed.`,
      );
    }
  }
}
walk(SRC);

if (errors.length) {
  console.error("✗ share-image audit failed:\n");
  for (const e of errors) console.error("  - " + e);
  console.error("\nHow to fix:");
  console.error("  1. Edit src/lib/brand-meta.ts → BRAND.ogImage.path to a local /public file.");
  console.error("  2. Do NOT set og:image / twitter:image inline in any route — they come from rootMeta()/shareImageMeta() in brand-meta.ts.");
  console.error("  3. Remove any external http(s) URL from share-image meta entries.");
  console.error("  4. Re-run: node scripts/test-share-images.mjs");
  process.exit(1);
}

console.log("✓ share-image audit: brand-meta.ts is canonical, no external URLs in og:image / twitter:image anywhere in src/.");
