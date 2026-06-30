## Actual issue

I traced the path. The old bad metadata is still physically in `src/routes/__root.tsx` after the new helper was added.

Current failure path:

```text
src/routes/__root.tsx
  → meta: [...rootMeta(), old inline metadata still here]
  → old Memento description still here
  → old external R2 og:image/twitter:image still here
  → audits fail again
```

So the previous fix added `brand-meta.ts`, but did not fully delete the old root metadata block. That is why it keeps coming back.

## Implementation plan

### 1. Rewrite the source of truth

File: `src/lib/brand-meta.ts`

- Keep one `BRAND` config for name, domain, title, description, share description, and local image path.
- Keep `BRAND.ogImage.path` local only: `/og-image.png`.
- Export:
  - `rootMeta()` for root-only defaults.
  - `pageMeta()` for page titles/descriptions.
  - `shareImageMeta()` for OG/Twitter image tags.

### 2. Gut root metadata completely

File: `src/routes/__root.tsx`

- Replace the whole root `meta` array with only:
  - charset
  - viewport
  - `...rootMeta()`
- Delete every stale inline metadata entry:
  - `Memento: Your Eternal Archive`
  - inline `description`
  - inline `og:description`
  - inline `twitter:description`
  - external R2 `og:image`
  - external R2 `twitter:image`
  - duplicate `twitter:card`
  - duplicate `og:type`
- Keep stylesheet, icon, manifest, and font links untouched.

### 3. Sweep all route heads

Files under `src/routes/**/*.tsx`

- Find every `head:` block.
- Replace repeated brand metadata with `pageMeta()` / `BRAND` helpers.
- Ensure leaf routes use self-referencing `canonical` and `og:url` where present.
- Do not inline external share images anywhere.

### 4. Rewrite the share-image audit so this exact bug cannot pass

File: `scripts/test-share-images.mjs`

- Scan all `src/**/*.{ts,tsx,mts,cts}`.
- Fail on any `og:image` or `twitter:image` containing `http://` or `https://`.
- Fail on any external URL within the same object/nearby text as `og:image` or `twitter:image`.
- Fail on inline share-image metadata outside `src/lib/brand-meta.ts` unless it is a local `/public` path.
- Print exact file and line number.

### 5. Tighten icon audit duplicate detection

File: `scripts/audit-icons.mjs`

- Resolve canonical share image from `brand-meta.ts`.
- Fail if `__root.tsx` imports `rootMeta()` but also defines direct `og:image` or `twitter:image` tags.
- Fail on duplicate share-image refs.
- Fail external share-image URLs before any asset checks.

### 6. Tighten branding audit wording and stale-copy detection

File: `scripts/audit-branding.mjs`

- Fail on stale `Memento:` metadata copy.
- Keep allowing internal identifiers like `Mement0Logo`.
- Change remediation text to: remove stale metadata or move intentional copy to `src/lib/brand-meta.ts`; do not allowlist stale root metadata.

### 7. Verify the entire path

Run/confirm:

```text
rg "r2.dev|Memento: Your Eternal Archive|og:image.*https|twitter:image.*https" src scripts
node scripts/audit-branding.mjs
node scripts/test-share-images.mjs
node scripts/audit-icons.mjs
```

Then confirm `package.json` still gates build with those audits before Vite.

## Expected result

There will be exactly one legal source for OG/Twitter images: `src/lib/brand-meta.ts` pointing at local `/og-image.png`. If an external preview URL or stale root metadata is pasted again, the build fails immediately with the exact file and line.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>