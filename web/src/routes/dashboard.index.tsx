import { createFileRoute } from "@tanstack/react-router";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { RequestsDataTable } from "@/components/requests-data-table";
import { SectionCards } from "@/components/section-cards";
import { api } from "@/lib/api";

export const Route = createFileRoute("/dashboard/")({
  loader: async () => {
    const [savings, requests] = await Promise.all([api.savings(), api.requests(100)]);
    return { savings: savings.savings, requests: requests.requests };
  },
  component: OverviewPage
});

function OverviewPage() {
  const { savings, requests } = Route.useLoaderData();

  return (
    <>
      <SectionCards savings={savings} />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive requests={requests} />
      </div>
      <div className="px-4 lg:px-6">
        <RequestsDataTable requests={requests} />
      </div>
    </>
  );
}
