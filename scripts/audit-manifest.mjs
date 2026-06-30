#!/usr/bin/env node
/**
 * Manifest audit — validates public/manifest.webmanifest:
 *   - parses as JSON
 *   - every `icons[].src` exists on disk under public/ (or .output/public)
 *   - declared `sizes` matches the PNG's actual pixel dimensions
 *   - `type` matches the file's real magic bytes
 *
 * Runs as part of `bun run audit` and in CI before build.
 */
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["public", ".output/public", "dist"];
const MANIFEST_REL = "manifest.webmanifest";

function pngDims(buf) {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function sniffType(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "image/webp";
  if (buf.slice(0, 5).toString() === "<?xml" || buf.slice(0, 4).toString() === "<svg") return "image/svg+xml";
  return null;
}

async function findRoot() {
  for (const r of ROOTS) {
    if (existsSync(join(r, MANIFEST_REL))) return r;
  }
  return null;
}

async function run() {
  const root = await findRoot();
  if (!root) {
    console.error(`✗ no ${MANIFEST_REL} found under ${ROOTS.join(", ")}`);
    process.exit(1);
  }
  const path = join(root, MANIFEST_REL);
  let manifest;
  try { manifest = JSON.parse(await readFile(path, "utf8")); }
  catch (e) { console.error(`✗ ${path} — invalid JSON: ${e.message}`); process.exit(1); }

  const errors = [];
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    errors.push("manifest.icons must be a non-empty array");
  }
  for (const icon of manifest.icons ?? []) {
    const src = icon.src;
    if (!src || typeof src !== "string") { errors.push(`icon missing src`); continue; }
    const rel = src.replace(/^\//, "");
    const file = join(root, rel);
    if (!existsSync(file)) { errors.push(`${src} — not found in ${root}/`); continue; }
    const buf = await readFile(file);
    const realType = sniffType(buf);
    if (icon.type && realType && icon.type !== realType) {
      errors.push(`${src} — manifest type "${icon.type}" but file is ${realType}`);
    }
    if (realType === "image/png" && icon.sizes && /^\d+x\d+$/.test(icon.sizes)) {
      const d = pngDims(buf);
      const [w, h] = icon.sizes.split("x").map(Number);
      if (!d || d.width !== w || d.height !== h) {
        errors.push(`${src} — sizes="${icon.sizes}" but image is ${d?.width}x${d?.height}`);
      }
    }
    const sz = await stat(file);
    console.log(`  ✓ ${src.padEnd(28)} ${realType} ${icon.sizes ?? "?"} ${(sz.size/1024).toFixed(1)}KB`);
  }

  if (errors.length) {
    console.error(`\n✗ manifest audit failed (${errors.length} error(s)):`);
    errors.forEach((e) => console.error("  " + e));
    process.exit(1);
  }
  console.log(`\n✓ manifest audit: ${manifest.icons.length} icon(s) valid in ${root}/${MANIFEST_REL}.`);
}
run().catch((e) => { console.error("✗ manifest audit crashed:", e); process.exit(1); });
