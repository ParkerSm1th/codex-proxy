import { createFileRoute, isRedirect, Link, redirect } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { BRAND_GITHUB_URL, BRAND_NAME, BRAND_TAGLINE, PUBLIC_API_BASE } from "@/lib/brand";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      const { user } = await api.me();
      throw redirect({ to: user.hasCodexTokens ? "/dashboard" : "/onboarding" });
    } catch (error) {
      if (isRedirect(error)) {
        throw error;
      }
    }
  },
  component: HomePage
});

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-12 overflow-hidden rounded-xl">
          <BrandMark />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{BRAND_NAME}</h1>
          <p className="max-w-sm text-muted-foreground">{BRAND_TAGLINE}</p>
        </div>
      </div>

      <div className="max-w-md space-y-3 text-sm text-muted-foreground">
        <p>
          Sign in, link your Codex account, and create a proxy API key. UseMySub exposes an OpenAI-compatible API that
          routes chat requests through your subscription instead of a separate OpenAI billing account.
        </p>
        <p>
          Point any compatible client at{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{PUBLIC_API_BASE}</code> and use
          your proxy key as the API key.
        </p>
        <p>
          In Cursor, add a custom OpenAI-compatible provider with that base URL and key. Cursor sends requests to
          UseMySub, which forwards them to Codex using your linked subscription.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
        <Button variant="outline" asChild>
          <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </Button>
      </div>
    </div>
  );
}
