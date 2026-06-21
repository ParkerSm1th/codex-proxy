import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth-form";
import { api } from "@/lib/api";

export const Route = createFileRoute("/register")({
  component: RegisterPage
});

function RegisterPage() {
  return (
    <AuthForm
      title="Create account"
      description="Register to manage proxy API keys and view request history."
      submitLabel="Create account"
      showDisplayName
      onSubmit={(email, password, displayName) => api.register(email, password, displayName).then(() => undefined)}
      footer={
        <p>
          Already have an account?{" "}
          <Link className="text-primary hover:underline" to="/login">
            Sign in
          </Link>
        </p>
      }
    />
  );
}
