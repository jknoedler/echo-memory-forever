#!/usr/bin/env node
/**
 * Share-image regression test.
 *
 * Asserts that src/routes/__root.tsx declares exactly ONE og:image and
 * exactly ONE twitter:image, and that both resolve to a local /public file.
 * External URLs (http/https) in either tag are an immediate failure — this
 * is the regression that broke the build repeatedly when a preview URL was
 * pasted back into the head meta.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ROOT_ROUTE = join(ROOT, "src/routes/__root.tsx");
const PUBLIC_DIR = join(ROOT, "public");

const errors = [];
const src = readFileSync(ROOT_ROUTE, "utf8");

// Match every meta entry that declares og:image or twitter:image and capture
// its content string. Tolerates quote style and key ordering.
const TAG_RE =
  /\{\s*(?:property|name)\s*:\s*["'](og:image|twitter:image)["']\s*,\s*content\s*:\s*([^,}]+)\s*\}/g;

const found = { "og:image": [], "twitter:image": [] };
let m;
while ((m = TAG_RE.exec(src)) !== null) {
  const role = m[1];
  const rawContent = m[2].trim();
  // Strip surrounding quotes if literal; otherwise keep the identifier name.
  const literal = rawContent.match(/^["'`](.+)["'`]$/);
  found[role].push({ raw: rawContent, value: literal ? literal[1] : null });
}

for (const role of ["og:image", "twitter:image"]) {
  const hits = found[role];
  if (hits.length === 0) {
    errors.push(`${role}: no tag found in __root.tsx`);
    continue;
  }
  if (hits.length > 1) {
    errors.push(`${role}: expected exactly 1 tag, found ${hits.length}`);
  }
  for (const hit of hits) {
    // Resolve identifier references (e.g. OG_IMAGE) to their const declaration.
    let value = hit.value;
    if (value === null) {
      const ident = hit.raw;
      const declRe = new RegExp(
        `const\\s+${ident.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`,
      );
      const dm = declRe.exec(src);
      if (!dm) {
        errors.push(`${role}: cannot resolve identifier '${ident}' to a literal`);
        continue;
      }
      value = dm[1];
    }
    if (/^https?:\/\//i.test(value)) {
      errors.push(`${role}: external URL forbidden — ${value}`);
      continue;
    }
    if (!value.startsWith("/")) {
      errors.push(`${role}: must be an absolute /public path, got '${value}'`);
      continue;
    }
    const full = join(PUBLIC_DIR, value.replace(/^\/+/, ""));
    if (!existsSync(full)) {
      errors.push(`${role}: file not found at public${value}`);
    }
  }
}

// Belt-and-suspenders: a literal http(s) URL anywhere inside an og:image /
// twitter:image meta object should never appear, regardless of regex above.
const FORBIDDEN_RE =
  /\{\s*(?:property|name)\s*:\s*["'](?:og:image|twitter:image)["'][^}]*https?:\/\/[^}]*\}/g;
let f;
while ((f = FORBIDDEN_RE.exec(src)) !== null) {
  errors.push(`forbidden external URL inside share-image meta: ${f[0]}`);
}

if (errors.length) {
  console.error("✗ share-image test failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `✓ share-image test: og:image x${found["og:image"].length}, twitter:image x${found["twitter:image"].length}, all local /public references.`,
);
