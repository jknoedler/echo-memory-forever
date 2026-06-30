/**
 * Single source of truth for brand identity + shareable metadata.
 *
 * Every route reads OG / Twitter / description copy from here so the share
 * preview can never drift between pages. Update values here, not in routes.
 *
 * Routes should use these helpers instead of hand-rolled metadata.
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

  /** Default share image for route helpers. */
  ogImage: {
    path: "/og-image.png",
    width: "1200",
    height: "630",
    type: "image/png",
    alt: "MementØ — MØRE / 0 loss",
  },
} as const;

type MetaEntry =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

export type PageMetaInput = {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  type?: "website" | "article" | "profile" | "product";
};

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

/** Shared page-level title / description metadata. */
export function pageMeta(input: PageMetaInput = {}): MetaEntry[] {
  const title = input.title ?? BRAND.defaultTitle;
  const description = input.description ?? BRAND.defaultDescription;
  const ogTitle = input.ogTitle ?? title;
  const ogDescription = input.ogDescription ?? BRAND.shareDescription;

  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: ogTitle },
    { property: "og:description", content: ogDescription },
    { name: "twitter:title", content: ogTitle },
    { name: "twitter:description", content: ogDescription },
    ...(input.ogUrl ? [{ property: "og:url", content: input.ogUrl } satisfies MetaEntry] : []),
    ...(input.type ? [{ property: "og:type", content: input.type } satisfies MetaEntry] : []),
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
