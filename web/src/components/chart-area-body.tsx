import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ChartContainer,
  XAxis,
  YAxis,
  type ChartConfig
} from "@/components/ui/chart";
import type { ChartPoint } from "@/lib/chart-data";
import { formatUsd } from "@/lib/utils";

const chartConfig = {
  requests: { label: "Requests", color: "var(--chart-1)" },
  savings: { label: "Savings", color: "var(--chart-2)" }
} satisfies ChartConfig;

const CHART_MARGIN = { left: 12, right: 12, top: 12, bottom: 0 };
const Y_AXIS_LEFT = 36;
const Y_AXIS_RIGHT = 44;

function plotMetrics(width: number) {
  const left = CHART_MARGIN.left + Y_AXIS_LEFT;
  const right = CHART_MARGIN.right + Y_AXIS_RIGHT;
  return {
    left,
    right,
    width: Math.max(width - left - right, 1)
  };
}

function indexAtX(clientX: number, rect: DOMRect, count: number): number {
  if (count <= 1) {
    return 0;
  }

  const { left, width } = plotMetrics(rect.width);
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left - left) / width));
  return Math.round(ratio * (count - 1));
}

function lineAtIndex(index: number, rect: DOMRect, count: number): number {
  const { left, width } = plotMetrics(rect.width);
  if (count <= 1) {
    return left + width / 2;
  }
  return left + (index / (count - 1)) * width;
}

export function ChartAreaBody({ data }: { data: ChartPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [lineX, setLineX] = useState<number | null>(null);
  const [tooltipX, setTooltipX] = useState<number | null>(null);
  const hovered = hoverIndex != null ? data[hoverIndex] : null;

  const updateHover = (clientX: number, currentTarget: HTMLDivElement) => {
    if (data.length === 0) {
      return;
    }

    const rect = currentTarget.getBoundingClientRect();
    const index = indexAtX(clientX, rect, data.length);
    const x = lineAtIndex(index, rect, data.length);
    setHoverIndex(index);
    setLineX(x);
    setTooltipX(Math.min(Math.max(x, 96), rect.width - 96));
  };

  return (
    <div className="relative h-[250px] w-full">
      <ChartContainer config={chartConfig} className="pointer-events-none h-full w-full [&_.recharts-wrapper]:!h-full [&_.recharts-wrapper]:!w-full">
        <AreaChart data={data} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-requests)" stopOpacity={0.55} />
              <stop offset="95%" stopColor="var(--color-requests)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="fillSavings" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-savings)" stopOpacity={0.45} />
              <stop offset="95%" stopColor="var(--color-savings)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis
            yAxisId="requests"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={Y_AXIS_LEFT}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="savings"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={Y_AXIS_RIGHT}
            tickFormatter={(value) => `$${value}`}
          />
          <Area
            yAxisId="requests"
            dataKey="requests"
            type="natural"
            fill="url(#fillRequests)"
            stroke="var(--color-requests)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
          />
          <Area
            yAxisId="savings"
            dataKey="savings"
            type="natural"
            fill="url(#fillSavings)"
            stroke="var(--color-savings)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ChartContainer>

      <div
        aria-hidden
        className="absolute inset-0 z-10 touch-none cursor-crosshair"
        onPointerMove={(event) => updateHover(event.clientX, event.currentTarget)}
        onPointerLeave={() => {
          setHoverIndex(null);
          setLineX(null);
          setTooltipX(null);
        }}
      />

      {hovered && lineX != null && tooltipX != null ? (
        <>
          <div
            className="pointer-events-none absolute bottom-8 top-3 z-20 border-l border-dashed border-border"
            style={{ left: lineX }}
          />
          <div
            className="pointer-events-none absolute z-30 min-w-[8rem] -translate-x-1/2 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
            style={{ left: tooltipX, top: 12 }}
          >
            <div className="mb-1.5 font-medium">{hovered.date}</div>
            <div className="grid gap-1.5">
              <TooltipRow color="var(--color-requests)" label="Requests" value={hovered.requests.toLocaleString()} />
              <TooltipRow color="var(--color-savings)" label="Savings" value={formatUsd(hovered.savings)} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      <div className="flex flex-1 items-center justify-between gap-4">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium tabular-nums">{value}</span>
      </div>
    </div>
  );
}

