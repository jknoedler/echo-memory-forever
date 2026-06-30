#!/usr/bin/env node
/**
 * Share-image + external-URL regression test.
 *
 * Enforces three rules across the entire src/ tree:
 *
 *   1. The brand config (src/lib/brand-meta.ts) declares ONE og image path,
 *      and that path resolves to a real file under public/.
 *
 *   2. No source file except src/lib/brand-meta.ts may define an og:image
 *      or twitter:image meta object. Routes use helpers; they never inline
 *      share-image tags.
 *
 *   3. No og:image / twitter:image literal in any source file may point to
 *      an external URL. Catches accidental pastes of preview URLs.
 *
 * Failure prints exact file + line remediation so the build error is actionable.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public");
const BRAND_FILE = join(ROOT, "src/lib/brand-meta.ts");
const SRC = join(ROOT, "src");

/** @type {string[]} */
const errors = [];

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

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
const SHARE_KEY_RE = /(?:property|name)\s*:\s*["'](og:image(?::[a-z]+)?|twitter:image(?::src)?)["']/;
const SHARE_OBJECT_RE = /\{[\s\S]{0,700}?(?:property|name)\s*:\s*["'](og:image(?::[a-z]+)?|twitter:image(?::src)?)["'][\s\S]{0,700}?\}/g;
const CONTENT_RE = /content\s*:\s*(["'`])([^"'`]+)\1/;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!EXT.test(entry)) continue;
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    const isBrandMeta = rel === "src/lib/brand-meta.ts";
    if (rel.endsWith("test-share-images.mjs")) continue;
    const text = readFileSync(full, "utf8");

    // Brand meta is the one legal definition point. It is validated above.
    if (isBrandMeta) continue;

    // Any inline share-image object outside brand-meta is a regression. This
    // catches both local and external values so routes cannot drift from the
    // shared helper again.
    for (const m of text.matchAll(SHARE_OBJECT_RE)) {
      const block = m[0];
      const role = m[1];
      const content = CONTENT_RE.exec(block)?.[2];
      const line = lineOf(text, m.index ?? 0);
      errors.push(
        `${rel}:${line}: inline ${role} metadata is forbidden${content ? ` (${content})` : ""}. Use rootMeta()/shareImageMeta() from src/lib/brand-meta.ts only.`,
      );
    }

    // Catch raw external URLs sitting in the same nearby chunk as a share key,
    // even if the object format changes or the tag is malformed.
    for (let i = 0; i < text.length; i += 1) {
      const next = text.slice(i).search(SHARE_KEY_RE);
      if (next === -1) break;
      const keyIndex = i + next;
      const chunk = text.slice(keyIndex, keyIndex + 700);
      const external = chunk.match(/https?:\/\/[^"'\s},)]+/i)?.[0];
      if (external) {
        errors.push(
          `${rel}:${lineOf(text, keyIndex)}: external share-image URL near ${SHARE_KEY_RE.exec(chunk)?.[1] ?? "share image"} (${external}). Share images must come from src/lib/brand-meta.ts and be local /public paths.`,
        );
      }
      i = keyIndex + 1;
    }
  }
}
walk(SRC);

if (errors.length) {
  console.error("✗ share-image audit failed:\n");
  for (const e of errors) console.error("  - " + e);
  console.error("\nHow to fix:");
  console.error("  1. Edit src/lib/brand-meta.ts → BRAND.ogImage.path to a local /public file.");
  console.error("  2. Delete inline og:image / twitter:image objects from routes and root metadata.");
  console.error("  3. Use rootMeta()/shareImageMeta() from src/lib/brand-meta.ts; never paste preview/R2 URLs.");
  console.error("  4. Re-run: node scripts/test-share-images.mjs");
  process.exit(1);
}

console.log("✓ share-image audit: brand-meta.ts is canonical, no external URLs in og:image / twitter:image anywhere in src/.");
