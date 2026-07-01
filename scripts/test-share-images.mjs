#!/usr/bin/env node
// Share-image audit: og:image / twitter:image must come from brand-meta.ts
// (or be injected by the publish pipeline). Fails if any route file inlines
// og:image or twitter:image, which caused duplicate-tag build errors before.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ROUTES_DIR = join(ROOT, "src", "routes");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const offenders = [];
for (const file of walk(ROUTES_DIR)) {
  const src = readFileSync(file, "utf8");
  // Look for inline og:image / twitter:image meta declarations.
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (/["'`](og:image|twitter:image)["'`]/.test(line)) {
      offenders.push({ file, line: i + 1, text: trimmed });
    }
  });
}

if (offenders.length > 0) {
  console.error("✗ share-image audit: og:image / twitter:image found inline in routes.");
  console.error("  Move to src/lib/brand-meta.ts (BRAND.ogImage) or let the publish pipeline inject.\n");
  for (const o of offenders) {
    console.error(`  ${o.file.replace(ROOT, "")}:${o.line}  ${o.text}`);
  }
  process.exit(1);
}

console.log("✓ share-image audit: no inline og:image / twitter:image in routes.");
