import { createFileRoute } from "@tanstack/react-router";
import { AuthForm, AuthFooter } from "@/components/auth-form";
import { api } from "@/lib/api";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === "string" ? search.error : null
  }),
  component: LoginPage
});

function LoginPage() {
  const { error } = Route.useSearch();

  return (
    <AuthForm
      title="Sign in"
      description="Enter your email and we'll send a one-time sign-in link."
      submitLabel="Email me a sign-in link"
      initialError={error}
      onSubmit={(email) => api.requestMagicLink(email)}
      footer={<AuthFooter />}
    />
  );
}
