import { useRouterState } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/keys": "API Keys",
  "/dashboard/codex": "Codex Auth",
  "/dashboard/requests": "Requests"
};

export function SiteHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const title =
    titles[pathname] ??
    Object.entries(titles).find(([path]) => pathname.startsWith(path) && path !== "/dashboard")?.[1] ??
    "Dashboard";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-base font-medium">{title}</h1>
      </div>
    </header>
  );
}
