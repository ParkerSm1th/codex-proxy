import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/keys")({
  loader: () => api.listKeys(),
  component: KeysPage
});

function KeysPage() {
  const initial = Route.useLoaderData();
  const [keys, setKeys] = useState(initial.keys);
  const [label, setLabel] = useState("cursor");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Create API key</CardTitle>
          <CardDescription>Use this key as the bearer token in Cursor&apos;s OpenAI-compatible settings.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="min-w-[220px] flex-1 space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input id="label" value={label} onChange={(event) => setLabel(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              onClick={async () => {
                setError(null);
                setCreatedKey(null);
                try {
                  const { key } = await api.createKey(label.trim() || "default");
                  setCreatedKey(key.apiKey);
                  setKeys((await api.listKeys()).keys);
                } catch (createError) {
                  setError(createError instanceof ApiError ? createError.message : "Failed to create key");
                }
              }}
            >
              Create key
            </Button>
          </div>
        </CardContent>
      </Card>

      {createdKey ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Copy your new key</CardTitle>
            <CardDescription>This is the only time the full key is shown.</CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded-lg bg-muted px-3 py-2 text-sm">{createdKey}</code>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.label}</TableCell>
                  <TableCell>{key.prefix}</TableCell>
                  <TableCell>{formatDate(key.createdAt)}</TableCell>
                  <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={key.disabled ? "danger" : "success"}>{key.disabled ? "Revoked" : "Active"}</Badge>
                  </TableCell>
                  <TableCell>
                    {!key.disabled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await api.revokeKey(key.id);
                          setKeys((await api.listKeys()).keys);
                        }}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
