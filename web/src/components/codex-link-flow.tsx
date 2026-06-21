import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

interface CodexLinkFlowProps {
  title?: string;
  description?: string;
  onLinked?: () => void;
}

export function CodexLinkFlow({
  title = "Connect Codex",
  description = "Sign in with ChatGPT, then paste the localhost redirect URL from your browser.",
  onLinked
}: CodexLinkFlowProps) {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState("http://localhost:1455/auth/callback");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"start" | "complete" | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Open the ChatGPT sign-in page in your browser.</li>
          <li>After you sign in, your browser will redirect to a localhost URL that may show an error page.</li>
          <li>Copy the full URL from your browser address bar and paste it below.</li>
        </ol>

        <div className="space-y-3">
          <Button
            className="w-full"
            disabled={loading !== null}
            onClick={async () => {
              setError(null);
              setSuccess(null);
              setLoading("start");
              try {
                const result = await api.startCodexOAuth();
                setAuthUrl(result.authUrl);
                setRedirectUri(result.redirectUri);
                window.open(result.authUrl, "_blank", "noopener,noreferrer");
              } catch (startError) {
                setError(startError instanceof ApiError ? startError.message : "Could not start Codex sign-in");
              } finally {
                setLoading(null);
              }
            }}
          >
            {loading === "start" ? "Preparing sign-in…" : "Sign in with ChatGPT"}
            {authUrl ? <ExternalLink className="ml-2 size-4" /> : null}
          </Button>
          {authUrl ? (
            <p className="break-all text-xs text-muted-foreground">
              If the page did not open, use this link:{" "}
              <a className="underline" href={authUrl} rel="noreferrer" target="_blank">
                {authUrl}
              </a>
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="callbackUrl">Redirect URL</Label>
          <Input
            id="callbackUrl"
            value={callbackUrl}
            onChange={(event) => setCallbackUrl(event.target.value)}
            placeholder={`${redirectUri}?code=...&state=...`}
            autoComplete="off"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-400">{success}</p> : null}

        <Button
          className="w-full"
          disabled={loading !== null || callbackUrl.trim().length === 0}
          onClick={async () => {
            setError(null);
            setSuccess(null);
            setLoading("complete");
            try {
              await api.completeCodexOAuth(callbackUrl.trim());
              setSuccess("Codex connected successfully.");
              setCallbackUrl("");
              onLinked?.();
            } catch (completeError) {
              setError(completeError instanceof ApiError ? completeError.message : "Could not complete Codex sign-in");
            } finally {
              setLoading(null);
            }
          }}
        >
          {loading === "complete" ? "Connecting…" : "Complete setup"}
        </Button>
      </CardContent>
    </Card>
  );
}
