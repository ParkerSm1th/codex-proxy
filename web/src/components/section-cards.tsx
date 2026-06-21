import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { SavingsSummary } from "@/lib/api";
import { formatUsd } from "@/lib/utils";

export function SectionCards({ savings }: { savings: SavingsSummary }) {
  const cards = [
    {
      title: "Estimated Savings",
      value: formatUsd(savings.estimatedSavingsUsd),
      footer: "Versus OpenAI list pricing"
    },
    {
      title: "Total Requests",
      value: savings.totalRequests.toLocaleString(),
      footer: `${savings.successfulRequests} successful calls`
    },
    {
      title: "Input Tokens",
      value: savings.totalInputTokens.toLocaleString(),
      footer: "Prompt tokens logged"
    },
    {
      title: "Output Tokens",
      value: savings.totalOutputTokens.toLocaleString(),
      footer: "Completion tokens logged"
    }
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-2">
            <CardDescription>{card.title}</CardDescription>
            <CardTitle className="pt-2 text-2xl font-semibold tabular-nums tracking-tight @[250px]/card:text-3xl">
              {card.value}
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 pt-0 text-sm">
            <div className="line-clamp-1 font-medium">{card.footer}</div>
            <div className="text-muted-foreground">Tracked from proxy request logs</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
