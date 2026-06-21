import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { CodexLinkFlow } from "@/components/codex-link-flow";
import { api } from "@/lib/api";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    try {
      const { user } = await api.me();
      if (user.hasCodexTokens) {
        throw redirect({ to: "/dashboard" });
      }
      return { user };
    } catch (error) {
      if (isRedirect(error)) {
        throw error;
      }
      throw redirect({ to: "/login" });
    }
  },
  component: OnboardingPage
});

function OnboardingPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-muted/40 p-10 lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex size-8 overflow-hidden rounded-lg">
            <BrandMark />
          </div>
          {BRAND_NAME}
        </div>
        <div className="space-y-2">
          <blockquote className="text-lg leading-relaxed">
            {BRAND_TAGLINE} Connect your Codex subscription to start routing requests.
          </blockquote>
        </div>
        <p className="text-sm text-muted-foreground">One ChatGPT sign-in links your subscription to UseMySub.</p>
      </div>

      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-lg space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Connect Codex</h1>
            <p className="text-sm text-muted-foreground">
              UseMySub needs access to your Codex subscription before you can create proxy keys or send requests.
            </p>
          </div>
          <CodexLinkFlow
            onLinked={() => {
              window.location.href = "/dashboard";
            }}
          />
        </div>
      </div>
    </div>
  );
}
