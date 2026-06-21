import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { CodexLinkFlow } from "@/components/codex-link-flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { BRAND_NAME, BRAND_TAGLINE, PUBLIC_API_BASE } from "@/lib/brand";

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

type OnboardingStep = "link" | "create-key" | "complete";

function OnboardingPage() {
  const [step, setStep] = useState<OnboardingStep>("link");
  const [label, setLabel] = useState("default");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sidebarQuote =
    step === "link"
      ? `${BRAND_TAGLINE} Connect your Codex subscription to start routing requests.`
      : step === "create-key"
        ? "Create a proxy API key so your tools can authenticate with UseMySub."
        : "You're set up. Use your base URL and API key in any OpenAI-compatible client.";

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
          <blockquote className="text-lg leading-relaxed">{sidebarQuote}</blockquote>
        </div>
        <p className="text-sm text-muted-foreground">
          {step === "link"
            ? "One ChatGPT sign-in links your subscription to UseMySub."
            : step === "create-key"
              ? "Keys are shown once — copy them before continuing."
              : "Manage keys and view usage from your dashboard anytime."}
        </p>
      </div>

      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-lg space-y-6">
          {step === "link" ? (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Connect Codex</h1>
                <p className="text-sm text-muted-foreground">
                  UseMySub needs access to your Codex subscription before you can create proxy keys or send requests.
                </p>
              </div>
              <CodexLinkFlow onLinked={() => setStep("create-key")} />
            </>
          ) : null}

          {step === "create-key" ? (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Create an API key</h1>
                <p className="text-sm text-muted-foreground">
                  Your tools will use this key as the bearer token when calling the OpenAI-compatible API.
                </p>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>API key</CardTitle>
                  <CardDescription>Give your key a label so you can recognize it later.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="key-label">Label</Label>
                    <Input
                      id="key-label"
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  <Button
                    className="w-full"
                    disabled={loading}
                    onClick={async () => {
                      setError(null);
                      setLoading(true);
                      try {
                        const { key } = await api.createKey(label.trim() || "default");
                        setApiKey(key.apiKey);
                        setStep("complete");
                      } catch (createError) {
                        setError(createError instanceof ApiError ? createError.message : "Failed to create key");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    {loading ? "Creating…" : "Create API key"}
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : null}

          {step === "complete" && apiKey ? (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">You're ready</h1>
                <p className="text-sm text-muted-foreground">
                  Copy these values into your client. This is the only time the full API key is shown.
                </p>
              </div>
              <Card className="border-primary/40">
                <CardHeader>
                  <CardTitle>Connection details</CardTitle>
                  <CardDescription>Use these settings in OpenAI-compatible clients.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CredentialField label="Base URL" value={PUBLIC_API_BASE} />
                  <CredentialField label="API key" value={apiKey} />
                  <Button
                    className="w-full"
                    onClick={() => {
                      window.location.href = "/dashboard";
                    }}
                  >
                    Go to dashboard
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CredentialField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-2">
        <code className="block flex-1 break-all rounded-lg bg-muted px-3 py-2 text-sm">{value}</code>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
          title={copied ? "Copied" : `Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
