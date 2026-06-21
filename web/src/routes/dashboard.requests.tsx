import { createFileRoute } from "@tanstack/react-router";
import { RequestsDataTable } from "@/components/requests-data-table";
import { api } from "@/lib/api";

export const Route = createFileRoute("/dashboard/requests")({
  loader: () => api.requests(100),
  component: RequestsPage
});

function RequestsPage() {
  const { requests } = Route.useLoaderData();

  return (
    <div className="px-4 lg:px-6">
      <RequestsDataTable requests={requests} />
    </div>
  );
}
