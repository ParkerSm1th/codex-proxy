import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/codex")({
  loader: () => api.codexStatus(),
  component: CodexPage
});

function CodexPage() {
  const initial = Route.useLoaderData();
  const [codex, setCodex] = useState(initial.codex);
  const [authJson, setAuthJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Codex OAuth status</CardTitle>
          <CardDescription>Your proxy uses these tokens to call Codex on your behalf.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={codex.linked ? "success" : "warning"}>{codex.linked ? "Linked" : "Not linked"}</Badge>
            {codex.reauthRequired ? <Badge variant="danger">Reauth required</Badge> : null}
          </div>
          {codex.linked ? (
            <>
              <p>
                <span className="text-muted-foreground">Account:</span> {codex.chatgptAccountId ?? "Unknown"}
              </p>
              <p>
                <span className="text-muted-foreground">Last refresh:</span> {formatDate(codex.lastRefresh)}
              </p>
              <p>
                <span className="text-muted-foreground">Updated:</span> {formatDate(codex.updatedAt)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Paste your Codex auth JSON below to link tokens.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Link Codex auth</CardTitle>
          <CardDescription>Paste the contents of your Codex auth file (usually ~/.codex/auth.json).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="authJson">Auth JSON</Label>
            <Textarea
              id="authJson"
              value={authJson}
              onChange={(event) => setAuthJson(event.target.value)}
              placeholder='{"tokens":{"access_token":"...","refresh_token":"..."}}'
            />
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-300">{success}</p> : null}
          <Button
            onClick={async () => {
              setError(null);
              setSuccess(null);
              try {
                const auth = JSON.parse(authJson) as Record<string, unknown>;
                const { codex: next } = await api.linkCodex(auth);
                setCodex(next);
                setAuthJson("");
                setSuccess("Codex auth linked successfully.");
              } catch (linkError) {
                setError(linkError instanceof ApiError ? linkError.message : "Invalid JSON or auth payload");
              }
            }}
          >
            Save auth
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
