import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

interface AuthFormProps {
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (email: string, password: string, displayName?: string) => Promise<void>;
  showDisplayName?: boolean;
  footer?: React.ReactNode;
}

export function AuthForm({ title, description, submitLabel, onSubmit, showDisplayName, footer }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-muted/40 p-10 lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Command className="size-4" />
          </div>
          Codex Proxy
        </div>
        <div className="space-y-2">
          <blockquote className="text-lg leading-relaxed">
            Route Cursor through your Codex subscription, track every request, and see how much you save versus API list pricing.
          </blockquote>
        </div>
        <p className="text-sm text-muted-foreground">Self-hosted OpenAI-compatible proxy for Codex OAuth users.</p>
      </div>

      <div className="flex items-center justify-center p-6 md:p-10">
        <Card className="w-full max-w-sm border-0 shadow-none lg:border lg:shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setLoading(true);
                setError(null);
                try {
                  await onSubmit(email, password, displayName || undefined);
                  window.location.href = "/dashboard";
                } catch (submitError) {
                  setError(submitError instanceof ApiError ? submitError.message : "Something went wrong");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {showDisplayName ? (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display name</Label>
                  <Input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </div>
              ) : null}
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
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button className="w-full" disabled={loading} type="submit">
                {loading ? "Working…" : submitLabel}
              </Button>
            </form>
            {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AuthFooter() {
  return (
    <p className="text-sm text-muted-foreground">
      Accounts are provisioned by your team admin via the CLI. Contact them if you need access.
    </p>
  );
}
