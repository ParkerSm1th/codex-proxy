import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { api } from "@/lib/api";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      const { user } = await api.me();
      throw redirect({ to: user.hasCodexTokens ? "/dashboard" : "/onboarding" });
    } catch (error) {
      if (isRedirect(error)) {
        throw error;
      }
      throw redirect({ to: "/login" });
    }
  }
});
