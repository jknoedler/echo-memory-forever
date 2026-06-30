#!/usr/bin/env node
/**
 * Brand audit — scans the codebase for raw "Mement0" occurrences in
 * user-facing UI surfaces. The canonical wordmark is "MementØ" (slashed-Ø)
 * rendered via <Mement0Wordmark /> or BRAND tokens; anywhere we still spell
 * the product as "Mement0" in JSX text or visible strings is a regression.
 *
 * Allowed exceptions (whitelist):
 *   - src/lib/brand.ts             — token source-of-truth
 *   - src/components/mement0-logo.tsx — references BRAND.name only
 *   - src/assets/*.asset.json      — CDN filenames
 *   - src/routeTree.gen.ts         — generated
 *   - Anything outside src/
 *
 * Exits non-zero on findings so CI / build fails loudly.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const NEEDLE = /Mement0/g;
const ALLOW = new Set([
  "src/lib/brand.ts",
  "src/components/mement0-logo.tsx",
  "src/routeTree.gen.ts",
  "scripts/audit-branding.mjs",
]);
const ALLOW_SUFFIX = [".asset.json"];
const EXT = /\.(tsx?|jsx?|html|css|md)$/;

/** @type {{file:string,line:number,text:string}[]} */
const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!EXT.test(entry)) continue;
    if (ALLOW.has(rel)) continue;
    if (ALLOW_SUFFIX.some((s) => rel.endsWith(s))) continue;
    const text = readFileSync(full, "utf8");
    if (!NEEDLE.test(text)) continue;
    text.split("\n").forEach((line, i) => {
      if (line.includes("Mement0")) hits.push({ file: rel, line: i + 1, text: line.trim() });
    });
  }
}

walk(SRC);

if (hits.length === 0) {
  console.log("✓ brand audit: no stray 'Mement0' in user-facing source.");
  process.exit(0);
}

console.error(`✗ brand audit: ${hits.length} stray 'Mement0' occurrence(s) — use 'MementØ' or <Mement0Wordmark />:\n`);
for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.text}`);
console.error("\nIf an occurrence is intentional (e.g. a new token), add the path to ALLOW in scripts/audit-branding.mjs.");
process.exit(1);
