import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { api } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    try {
      const { user } = await api.me();
      return { user };
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardLayout
});

function DashboardLayout() {
  const { user } = Route.useRouteContext();
  return <DashboardShell user={user} />;
}
