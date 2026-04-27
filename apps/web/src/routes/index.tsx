import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listDeployments } from "../lib/api";
import { DeployForm } from "../components/DeployForm";
import { DeploymentTable } from "../components/DeploymentTable";
import { LogPane } from "../components/LogPane";

export const Route = createFileRoute("/")({ component: Page });

function Page() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["deployments"],
    queryFn: listDeployments,
    refetchInterval: 2000,
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-6">
        <DeployForm />
        {isLoading ? (
          <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-sm text-slate-500">
            Loading…
          </div>
        ) : (
          <DeploymentTable rows={data} selectedId={selected} onSelect={setSelected} />
        )}
      </div>
      <LogPane deploymentId={selected} />
    </div>
  );
}
