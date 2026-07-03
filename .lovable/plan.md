
# Ship MementØ as an installable PWA

Goal: Add to Home Screen on iOS/Android and "Install app" on desktop Chromium, using the app's existing brand mark. No offline caching, no service worker (per Lovable PWA skill — offline wasn't requested and SWs break the preview).

## What we'll change

### 1. Icons in `public/`
Generate the sizes install prompts actually require, from the existing MementØ mark:
- `icon-192.png` (192×192, any)
- `icon-512.png` (512×512, any)
- `icon-maskable-512.png` (512×512, maskable — padded so Android's mask never clips the Ø)

Keep the existing `favicon-32.png`, `favicon-48.png`, `apple-touch-icon.png`, `favicon.ico`.

### 2. `public/manifest.webmanifest`
Upgrade the manifest so Chrome/Edge/Android accept it for install:
- Add `id: "/"` (stable install identity — safe to set now, before anyone has installed)
- Add `lang: "en"`, `dir: "ltr"`, `orientation: "portrait"`, `categories: ["productivity","lifestyle"]`
- Add the 3 new icon entries above (192 any, 512 any, 512 maskable)
- Keep existing name, short_name, start_url, scope, display: standalone, colors

### 3. `src/routes/__root.tsx` head
Add the iOS/Android install meta tags:
- `apple-mobile-web-app-capable: yes`
- `apple-mobile-web-app-status-bar-style: black-translucent`
- `apple-mobile-web-app-title: MementØ`
- `mobile-web-app-capable: yes`
- `application-name: MementØ`
- `format-detection: telephone=no`

(Viewport already has `viewport-fit=cover` — good for iOS notch.)

### 4. Audits
`scripts/audit-manifest.mjs` already validates sizes/type/existence — it will cover the new icons automatically. No script changes needed; CI will fail if any icon is missing or wrong.

## Explicitly NOT doing
- No service worker, no `vite-plugin-pwa`, no offline caching (SWs break Lovable preview; user asked for installability, not offline).
- No Capacitor / native shells.
- No changes to auth, chat, memory, or any app logic.

## After merge
User publishes, then on iPhone: Safari → Share → Add to Home Screen. On Android/desktop: browser shows an Install prompt. Icon = MementØ mark, launches full-screen, no browser chrome.
