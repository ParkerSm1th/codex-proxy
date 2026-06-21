import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "@/lib/api";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      await api.me();
      throw redirect({ to: "/dashboard" });
    } catch {
      throw redirect({ to: "/login" });
    }
  }
});
