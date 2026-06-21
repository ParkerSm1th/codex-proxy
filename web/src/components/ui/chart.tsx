import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
  }
>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

export function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return context;
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "relative flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const css = Object.entries(config)
    .filter(([, item]) => item.color)
    .map(([key, item]) => `--color-${key}: ${item.color};`)
    .join(" ");

  if (!css) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] { ${css} }`
      }}
    />
  );
}

type TooltipPayload = {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
  payload?: Record<string, unknown>;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  valueFormatter,
  config: configProp,
  className
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  valueFormatter?: (key: string, value: number) => string;
  config?: ChartConfig;
  className?: string;
}) {
  const contextConfig = React.useContext(ChartContext)?.config;
  const config = configProp ?? contextConfig ?? {};

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {label ? <div className="font-medium">{label}</div> : null}
      <div className="grid gap-1.5">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? "");
          const itemConfig = config[key];
          const value = entry.value ?? 0;
          const formatted = valueFormatter?.(key, value) ?? value.toLocaleString();

          return (
            <div key={key} className="flex w-full items-center gap-2 [&>svg]:size-2.5 [&>svg]:text-muted-foreground">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: itemConfig?.color ?? entry.color }}
              />
              <div className="flex flex-1 items-center justify-between leading-none">
                <span className="text-muted-foreground">{itemConfig?.label ?? key}</span>
                <span className="font-mono font-medium tabular-nums text-foreground">{formatted}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartTooltip({
  content,
  cursor = { stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "4 4" },
  ...props
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip>) {
  return (
    <RechartsPrimitive.Tooltip
      animationDuration={0}
      cursor={cursor}
      wrapperStyle={{ outline: "none", zIndex: 50 }}
      content={content}
      {...props}
    />
  );
}

export { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
