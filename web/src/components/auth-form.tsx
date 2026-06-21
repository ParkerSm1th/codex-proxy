import { useState } from "react";
import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

interface AuthFormProps {
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (email: string) => Promise<{ message: string; devLink?: string }>;
  footer?: React.ReactNode;
  initialError?: string | null;
}

export function AuthForm({ title, description, submitLabel, onSubmit, footer, initialError }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ message: string; devLink?: string } | null>(null);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-muted/40 p-10 lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Command className="size-4" />
          </div>
          {BRAND_NAME}
        </div>
        <div className="space-y-2">
          <blockquote className="text-lg leading-relaxed">
            {BRAND_TAGLINE} Track usage and manage proxy keys from one place.
          </blockquote>
        </div>
        <p className="text-sm text-muted-foreground">Codex only for now. OpenAI-compatible API on your subscription.</p>
      </div>

      <div className="flex items-center justify-center p-6 md:p-10">
        <Card className="w-full max-w-sm border-0 shadow-none lg:border lg:shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-sm">
                <p>{sent.message}</p>
                {sent.devLink ? (
                  <p className="break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{sent.devLink}</p>
                ) : null}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSent(null);
                    setEmail("");
                  }}
                >
                  Use a different email
                </Button>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setLoading(true);
                  setError(null);
                  try {
                    const result = await onSubmit(email);
                    setSent(result);
                  } catch (submitError) {
                    setError(submitError instanceof ApiError ? submitError.message : "Something went wrong");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button className="w-full" disabled={loading} type="submit">
                  {loading ? "Sending link…" : submitLabel}
                </Button>
              </form>
            )}
            {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AuthFooter() {
  return (
    <p>
      New here? Enter your email above to create an account and sign in with the same magic link.
    </p>
  );
}
