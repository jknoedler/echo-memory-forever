/**
 * Single source of truth for brand identity + shareable metadata.
 *
 * Every route reads OG / Twitter / description copy from here so the share
 * preview can never drift between pages. Update values here, not in routes.
 *
 * Hard rule (enforced by scripts/audit-share-images.mjs):
 *   og:image and twitter:image MUST resolve to a local /public path.
 *   External http(s) URLs are rejected at build time.
 */

export const BRAND = {
  name: "MementØ",
  tagline: "MORE / 0 loss",
  domain: "https://mement0.com",
  author: "MementØ",
  themeColor: "#0a0a0a",

  /** Default copy used as a fallback when a route doesn't override. */
  defaultTitle: "MementØ — MORE / 0 loss",
  defaultDescription:
    "A lifelong AI memory and agentic OS. Lossless archive of your life. Model-agnostic.",

  /** Short single-line description reused for og:description / twitter:description. */
  shareDescription: "Lifelong AI archive. 0 loss memory. Agentic. Eternal.",

  /** Share image — MUST be a local /public path. No external URLs. */
  ogImage: {
    path: "/og-image.png",
    width: "1200",
    height: "630",
    type: "image/png",
    alt: "MementØ — MØRE / 0 loss",
  },
} as const;

type MetaEntry =
  | { name: string; content: string }
  | { property: string; content: string };

/**
 * Shared og/twitter image meta. Use in any route that wants the canonical
 * share preview. The root route already emits these; per-page calls are a
 * no-op because TanStack dedupes meta by name/property.
 */
export function shareImageMeta(): MetaEntry[] {
  return [
    { property: "og:image", content: BRAND.ogImage.path },
    { property: "og:image:width", content: BRAND.ogImage.width },
    { property: "og:image:height", content: BRAND.ogImage.height },
    { property: "og:image:type", content: BRAND.ogImage.type },
    { property: "og:image:alt", content: BRAND.ogImage.alt },
    { name: "twitter:image", content: BRAND.ogImage.path },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/** Sitewide defaults emitted from the root route. */
export function rootMeta(): MetaEntry[] {
  return [
    { name: "author", content: BRAND.author },
    { name: "theme-color", content: BRAND.themeColor },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: BRAND.name },
    ...shareImageMeta(),
  ];
}
