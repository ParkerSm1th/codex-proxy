import { createFileRoute } from "@tanstack/react-router";
import { AuthForm, AuthFooter } from "@/components/auth-form";
import { api } from "@/lib/api";

export const Route = createFileRoute("/login")({
  component: LoginPage
});

function LoginPage() {
  return (
    <AuthForm
      title="Sign in"
      description="Manage your Codex proxy keys, link auth, and track savings."
      submitLabel="Sign in"
      onSubmit={(email, password) => api.login(email, password).then(() => undefined)}
      footer={<AuthFooter />}
    />
  );
}
