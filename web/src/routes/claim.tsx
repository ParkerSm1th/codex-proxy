import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth-form";
import { api } from "@/lib/api";

export const Route = createFileRoute("/claim")({
  component: ClaimPage
});

function ClaimPage() {
  return (
    <AuthForm
      title="Claim your account"
      description="If you were provisioned via the CLI, set a dashboard password using the same email."
      submitLabel="Set password"
      onSubmit={(email, password) => api.claim(email, password).then(() => undefined)}
      footer={
        <p>
          Need a fresh account?{" "}
          <Link className="text-primary hover:underline" to="/register">
            Register instead
          </Link>
        </p>
      }
    />
  );
}
