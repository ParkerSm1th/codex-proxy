import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RequestLogEntry } from "@/lib/api";
import { formatDate, formatUsd } from "@/lib/utils";

export function RequestsDataTable({ requests }: { requests: RequestLogEntry[] }) {
  const recent = requests.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Requests</CardTitle>
        <CardDescription>Latest proxy traffic with estimated savings</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="recent">
          <TabsList>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="all">All logged</TabsTrigger>
          </TabsList>
          <TabsContent value="recent" className="mt-4">
            <RequestTable rows={recent} />
          </TabsContent>
          <TabsContent value="all" className="mt-4">
            <RequestTable rows={requests} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function RequestTable({ rows }: { rows: RequestLogEntry[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Request ID</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Reasoning</TableHead>
            <TableHead>Service Tier</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tokens</TableHead>
            <TableHead className="text-right">Saved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                No requests logged yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">{formatDate(entry.createdAt)}</TableCell>
                <TableCell>
                  <CopyRequestIdButton requestId={entry.requestId} />
                </TableCell>
                <TableCell>{entry.model ?? "—"}</TableCell>
                <TableCell>{entry.reasoningEffort ? <Badge variant="secondary">{entry.reasoningEffort}</Badge> : "—"}</TableCell>
                <TableCell>{entry.serviceTier ? <Badge variant="outline">{entry.serviceTier}</Badge> : "—"}</TableCell>
                <TableCell>
                  <Badge variant={entry.status >= 200 && entry.status < 300 ? "success" : "danger"}>{entry.status}</Badge>
                </TableCell>
                <TableCell>
                  {entry.inputTokens ?? "—"} / {entry.outputTokens ?? "—"}
                </TableCell>
                <TableCell className="text-right">{formatUsd(entry.estimatedSavingsUsd)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function CopyRequestIdButton({ requestId }: { requestId: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <code className="max-w-[9rem] truncate text-xs text-muted-foreground" title={requestId}>
        {requestId}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={copied ? "Copied request ID" : "Copy request ID"}
        title={copied ? "Copied" : "Copy request ID"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(requestId);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}
