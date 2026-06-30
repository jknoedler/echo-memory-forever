#!/usr/bin/env node
/**
 * Brand audit — two passes:
 *
 *   1. NEGATIVE: scan tsx/html source for stray bare "Mement0" in user-facing
 *      strings. The canonical wordmark is "MementØ" (slashed-Ø) rendered via
 *      <Mement0Wordmark /> or BRAND tokens.
 *
 *   2. POSITIVE: every <title>, meta description, og:title, og:description,
 *      twitter:title, twitter:description that names the product must spell
 *      it "MementØ". Empty / dynamic meta values are allowed. Built HTML in
 *      `dist/` and `.output/public/` (Cloudflare Workers / nitro output) is
 *      also swept so a stale built artefact can't ship the old spelling.
 *
 * Exits non-zero on findings so CI / build fails loudly.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

// Bare "Mement0" — not followed by an identifier char, so component names
// like Mement0Logo / Mement0Wordmark / Mement0Mark / Mement0Hero pass.
const NEEDLE = /Mement0(?![A-Za-z0-9_])/;
const CANONICAL = "MementØ";

const ALLOW = new Set([
  "src/lib/brand.ts",                       // brand token source-of-truth
  "src/lib/persona.ts",                     // LLM system prompt
  "src/lib/palette.ts",                     // internal code comment
  "src/lib/provider-catalog.ts",            // internal copy
  "src/lib/youtube.ts",                     // outbound User-Agent header
  "src/components/mement0-logo.tsx",        // references BRAND.name
  "src/routes/__root.tsx",                  // intentional legacy SEO description
  "src/routes/api/chat.ts",                 // server-side system prompt
  "src/routes/api/youtube.ts",              // outbound User-Agent header
  "src/routes/_authenticated/settings.tsx", // X-Mement0-* HTTP header id
  "src/routeTree.gen.ts",
  "scripts/audit-branding.mjs",
]);
const ALLOW_SUFFIX = [".asset.json"];
const EXT = /\.(tsx|html)$/;

/** @type {{file:string,line:number,text:string}[]} */
const negativeHits = [];
/** @type {{file:string, role:string, value:string}[]} */
const positiveHits = [];

// ─────────────────────────── pass 1: source tree ────────────────────────────
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!EXT.test(entry)) continue;
    if (ALLOW_SUFFIX.some((s) => rel.endsWith(s))) continue;

    const text = readFileSync(full, "utf8");

    if (!ALLOW.has(rel)) {
      text.split("\n").forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        if (/^\s*import\s/.test(line)) return;
        if (NEEDLE.test(line)) negativeHits.push({ file: rel, line: i + 1, text: trimmed });
      });
    }

    // Positive: meta surfaces inside `head()` returns.
    if (!ALLOW.has(rel) && rel.endsWith(".tsx") && /head\s*:\s*\(/.test(text)) {
      auditMetaTags(rel, text);
    }
  }
}

/**
 * Pull title / og:title / description / og:description / twitter:* strings
 * out of a tsx file and confirm they spell the product "MementØ" if they
 * mention it at all. We only care about literal strings here — dynamic
 * `${loaderData.title}` expressions are skipped.
 */
function auditMetaTags(file, text) {
  const checks = [
    { role: "title",             re: /\btitle:\s*["']([^"']+)["']/g },
    { role: "description",       re: /name:\s*["']description["'][\s\S]{0,80}?content:\s*["']([^"']+)["']/g },
    { role: "og:title",          re: /property:\s*["']og:title["'][\s\S]{0,80}?content:\s*["']([^"']+)["']/g },
    { role: "og:description",    re: /property:\s*["']og:description["'][\s\S]{0,200}?content:\s*["']([^"']+)["']/g },
    { role: "og:site_name",      re: /property:\s*["']og:site_name["'][\s\S]{0,80}?content:\s*["']([^"']+)["']/g },
    { role: "twitter:title",     re: /name:\s*["']twitter:title["'][\s\S]{0,80}?content:\s*["']([^"']+)["']/g },
    { role: "twitter:description", re: /name:\s*["']twitter:description["'][\s\S]{0,200}?content:\s*["']([^"']+)["']/g },
    { role: "author",            re: /name:\s*["']author["'][\s\S]{0,80}?content:\s*["']([^"']+)["']/g },
  ];
  for (const { role, re } of checks) {
    for (const m of text.matchAll(re)) {
      const value = m[1];
      // If it doesn't mention the product, that's allowed.
      const mentionsProduct =
        /mement[0øO]/i.test(value) || value.toLowerCase().includes("memento");
      if (!mentionsProduct) continue;
      if (!value.includes(CANONICAL)) {
        positiveHits.push({ file, role, value });
      }
    }
  }
}

// ────────────────────── pass 2: built HTML in dist/.output ──────────────────
const BUILD_DIRS = [
  join(ROOT, "dist"),
  join(ROOT, ".output", "public"),
];
function sweepBuiltHtml() {
  for (const dir of BUILD_DIRS) {
    if (!existsSync(dir)) continue;
    walkBuilt(dir);
  }
}
function walkBuilt(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { walkBuilt(full); continue; }
    if (!/\.html?$/.test(entry)) continue;
    const text = readFileSync(full, "utf8");
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    text.split("\n").forEach((line, i) => {
      if (NEEDLE.test(line)) negativeHits.push({ file: rel, line: i + 1, text: line.trim().slice(0, 200) });
    });
    // Positive check on built <title> and meta tags.
    const builtChecks = [
      { role: "<title>", re: /<title>([^<]+)<\/title>/g },
      { role: "og:title", re: /property=["']og:title["']\s+content=["']([^"']+)["']/g },
      { role: "og:description", re: /property=["']og:description["']\s+content=["']([^"']+)["']/g },
      { role: "description", re: /name=["']description["']\s+content=["']([^"']+)["']/g },
    ];
    for (const { role, re } of builtChecks) {
      for (const m of text.matchAll(re)) {
        const v = m[1];
        if (!/mement[0øO]/i.test(v)) continue;
        if (!v.includes(CANONICAL)) positiveHits.push({ file: rel, role, value: v });
      }
    }
  }
}

// ──────────────────────────────────── run ──────────────────────────────────
walk(SRC);
sweepBuiltHtml();

let failed = false;

if (negativeHits.length) {
  failed = true;
  console.error(`✗ brand audit (negative): ${negativeHits.length} stray 'Mement0' occurrence(s) — use 'MementØ' or <Mement0Wordmark />:\n`);
  for (const h of negativeHits) console.error(`  ${h.file}:${h.line}  ${h.text}`);
  console.error("");
}

if (positiveHits.length) {
  failed = true;
  console.error(`✗ brand audit (positive): ${positiveHits.length} meta tag(s) name the product without the slashed-Ø:\n`);
  for (const h of positiveHits) console.error(`  ${h.file}  [${h.role}]  ${h.value}`);
  console.error("");
}

if (failed) {
  console.error("If an occurrence is intentional, add the path to ALLOW in scripts/audit-branding.mjs.");
  process.exit(1);
}

console.log("✓ brand audit: no stray 'Mement0' and every product-name meta tag uses 'MementØ'.");
