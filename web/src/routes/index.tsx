import { createFileRoute, isRedirect, Link, redirect } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { BRAND_GITHUB_URL, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

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
