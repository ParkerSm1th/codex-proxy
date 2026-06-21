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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-muted/40 p-10 lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex size-8 overflow-hidden rounded-lg">
            <BrandMark />
          </div>
          {BRAND_NAME}
        </div>
        <div className="space-y-4">
          <p className="text-lg leading-relaxed">{BRAND_TAGLINE}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Connect your Codex subscription, create a proxy API key, and send requests through your own account.
            UseMySub speaks the OpenAI API, so tools like Cursor can point at it instead of running a local proxy.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">Codex only for now.</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-8 p-6 md:p-10">
        <div className="flex items-center gap-2 text-lg font-semibold lg:hidden">
          <div className="flex size-8 overflow-hidden rounded-lg">
            <BrandMark />
          </div>
          {BRAND_NAME}
        </div>

        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-2xl font-semibold">Use your Codex subscription anywhere</h1>
            <p className="text-sm text-muted-foreground">
              Sign in, link Codex, and create a proxy key. Then set your client&apos;s OpenAI base URL to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{PUBLIC_API_BASE}</code>.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            In Cursor, add a custom OpenAI-compatible provider with your UseMySub base URL and API key. Cursor sends
            chat requests to the proxy, and UseMySub routes them through your linked Codex account.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="flex-1" asChild>
              <Link to="/login">Sign in to get started</Link>
            </Button>
            <Button className="flex-1" variant="outline" asChild>
              <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
