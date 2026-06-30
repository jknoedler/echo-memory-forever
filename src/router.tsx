import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { AppLoading } from "@/components/app-loading";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Custom pending/loading screen — pure black + MementØ mark + "DØ MØRE".
    // Prevents any third-party framework loading state from flashing.
    defaultPendingComponent: AppLoading,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });

  return router;
};

