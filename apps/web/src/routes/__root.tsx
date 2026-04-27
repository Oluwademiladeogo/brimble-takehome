import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Brimble · Mini Deployer</h1>
          <a
            className="text-sm text-slate-500 hover:text-slate-900"
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
          >
            repo ↗
          </a>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
    </div>
  ),
});
