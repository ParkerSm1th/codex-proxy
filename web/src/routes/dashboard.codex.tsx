import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodexLinkFlow } from "@/components/codex-link-flow";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/codex")({
  loader: () => api.codexStatus(),
  component: CodexPage
});

function CodexPage() {
  const initial = Route.useLoaderData();
  const [codex, setCodex] = useState(initial.codex);

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
            <p className="text-muted-foreground">Connect your Codex subscription below to start using the proxy.</p>
          )}
        </CardContent>
      </Card>

      <CodexLinkFlow
        title={codex.linked ? "Reconnect Codex" : "Connect Codex"}
        description="Sign in with ChatGPT, then paste the localhost redirect URL from your browser."
        onLinked={async () => {
          const { codex: next } = await api.codexStatus();
          setCodex(next);
        }}
      />
    </div>
  );
}
