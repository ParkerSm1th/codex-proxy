import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { api } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    try {
      const { user } = await api.me();
      if (!user.hasCodexTokens) {
        throw redirect({ to: "/onboarding" });
      }
      return { user };
    } catch (error) {
      if (isRedirect(error)) {
        throw error;
      }
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardLayout
});

function DashboardLayout() {
  const { user } = Route.useRouteContext();
  return <DashboardShell user={user} />;
}
