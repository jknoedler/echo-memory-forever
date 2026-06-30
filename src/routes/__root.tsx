import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/lib/theme";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

// Properly-sized icon assets live in `public/` and are served at their
// literal paths. Variants are generated from a single brand mark source by
// scripts/regen-icons.mjs — keep them in lockstep with the audit budget.
const FAVICON_32 = "/favicon-32.png";
const FAVICON_48 = "/favicon-48.png";
const APPLE_TOUCH_ICON = "/apple-touch-icon.png";
const OG_IMAGE = "/og-image.png";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MementØ — MØRE" },
      {
        name: "description",
        content:
          "MementØ is a lifelong AI archive of your life. Lossless memory, model-agnostic, agentic. Your legacy, never forgotten.",
      },
      { name: "author", content: "MementØ" },
      { name: "theme-color", content: "#0a0a0a" },
      { property: "og:title", content: "MementØ — MØRE" },
      {
        property: "og:description",
        content:
          "A lifelong AI memory and agentic OS. 0 loss. Your archive, eternal.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE },
      // LinkedIn / Slack / Discord / iMessage all read og:image — these
      // are the explicit hints LinkedIn's post-inspector checks for.
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:alt", content: "MementØ — MORE / 0 loss" },
      { name: "twitter:title", content: "MementØ — MØRE" },
      { name: "description", content: "0 loss archival agentic ai." },
      { property: "og:description", content: "0 loss archival agentic ai." },
      { name: "twitter:description", content: "0 loss archival agentic ai." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/66bd8ed4-d60b-45a5-8987-a835bc3a8fc6" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/66bd8ed4-d60b-45a5-8987-a835bc3a8fc6" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", sizes: "32x32", href: FAVICON_32 },
      { rel: "icon", type: "image/png", sizes: "48x48", href: FAVICON_48 },
      { rel: "shortcut icon", type: "image/png", href: FAVICON_32 },
      { rel: "apple-touch-icon", sizes: "180x180", href: APPLE_TOUCH_ICON },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,400;0,700;0,900;1,400&display=swap",
      },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | undefined;
    let onHide: (() => void) | undefined;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (!mounted) return;
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      unsub = () => sub.subscription.unsubscribe();

      // Honor the "Stay logged in" preference. If unchecked, end the session
      // when the tab is hidden/closed so it doesn't persist on this device.
      onHide = () => {
        try {
          if (localStorage.getItem("mement0:stayLoggedIn") === "0" && document.visibilityState === "hidden") {
            supabase.auth.signOut();
          }
        } catch {}
      };
      window.addEventListener("pagehide", onHide);
      document.addEventListener("visibilitychange", onHide);
    });
    return () => {
      mounted = false;
      unsub?.();
      if (onHide) {
        window.removeEventListener("pagehide", onHide);
        document.removeEventListener("visibilitychange", onHide);
      }
    };
  }, [router, queryClient]);


  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <Toaster position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
