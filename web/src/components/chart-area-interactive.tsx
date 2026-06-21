import { ClientOnly } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChartAreaBody } from "@/components/chart-area-body";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RequestLogEntry } from "@/lib/api";
import { aggregateRequestChartData, type ChartRange } from "@/lib/chart-data";

const ranges: Array<{ value: ChartRange; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" }
];

function ChartSkeleton() {
  return <div className="h-[250px] w-full animate-pulse rounded-lg bg-muted/40" />;
}

export function ChartAreaInteractive({ requests }: { requests: RequestLogEntry[] }) {
  const [range, setRange] = useState<ChartRange>("7d");
  const data = useMemo(() => aggregateRequestChartData(requests, range), [requests, range]);

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-4 border-b !pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Proxy Activity</CardTitle>
          <CardDescription>Requests and estimated savings over time</CardDescription>
        </div>
        <Tabs value={range} onValueChange={(value) => setRange(value as ChartRange)} className="shrink-0">
          <TabsList>
            {ranges.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ClientOnly fallback={<ChartSkeleton />}>
          <ChartAreaBody data={data} />
        </ClientOnly>
      </CardContent>
    </Card>
  );
}
