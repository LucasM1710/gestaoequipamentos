import { useEffect, useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { CalibracaoChart } from "@/components/dashboard/CalibracaoChart";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { EquipamentosUrgentesList } from "@/components/dashboard/EquipamentosUrgentesList";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { ReviewRequestsPanel } from "@/components/dashboard/ReviewRequestsPanel";
import { TabelaDistritos } from "@/components/dashboard/TabelaDistritos";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardData } from "@/hooks/useDashboardData";
import { buildDashboardMetrics } from "@/lib/dashboard";
import { toast } from "sonner";

export function Dashboard() {
  const { role, profile } = useAuth();
  const {
    equipamentos,
    calibracoes,
    crmCards,
    reviewRequests,
    users,
    isLoading,
    updateReviewRequestStatus,
  } = useDashboardData(role, profile?.id);
  const [selectedDistrict, setSelectedDistrict] = useState(role === "lider" ? profile?.district ?? "todos" : "todos");

  useEffect(() => {
    if (role === "lider" && profile?.district) {
      setSelectedDistrict(profile.district);
    }
  }, [profile?.district, role]);

  const metrics = useMemo(
    () =>
      buildDashboardMetrics(equipamentos, selectedDistrict, role === "admin", {
        calibracoes,
        crmCards,
        reviewRequests,
      }),
    [calibracoes, crmCards, equipamentos, reviewRequests, role, selectedDistrict],
  );

  const districts = useMemo(() => {
    const unique = Array.from(new Set(equipamentos.map((item) => item.owner_district).filter(Boolean)));
    return ["todos", ...unique] as string[];
  }, [equipamentos]);

  const equipamentosUrgentes = useMemo(
    () =>
      equipamentos
        .filter((item) => {
          if (!item.active) {
            return false;
          }

          if (selectedDistrict !== "todos" && item.owner_district !== selectedDistrict) {
            return false;
          }

          return item.dias_para_vencer !== null && item.dias_para_vencer <= 45;
        })
        .sort((a, b) => {
          const diasA = a.dias_para_vencer ?? Number.POSITIVE_INFINITY;
          const diasB = b.dias_para_vencer ?? Number.POSITIVE_INFINITY;
          return diasA - diasB;
        }),
    [equipamentos, selectedDistrict],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-borderSoft pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.03em] text-textPrimary">Visao operacional</h1>
          <p className="mt-0.5 text-sm text-textSecondary">KPIs de calibracao, CRM e distribuicao por distrito.</p>
        </div>
        <Select
          disabled={role === "lider"}
          value={selectedDistrict}
          onChange={(event) => setSelectedDistrict(event.target.value)}
          className="w-[220px]"
        >
          {districts.map((district) => (
            <option key={district} value={district}>
              {district === "todos" ? "Todos os distritos" : district}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-textSecondary">Carregando dashboard...</p>
      ) : null}

      {role === "admin" && metrics.pendingReviews > 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-veoliaRed/20 bg-veoliaRed/5 px-4 py-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-veoliaRed" />
          <span className="text-sm font-medium text-veoliaRed">
            {metrics.pendingReviews} solicitacao(oes) de revisao pendente(s)
          </span>
        </div>
      ) : null}

      <KpiCards
        items={[
          { label: "Equipamentos cadastrados", value: metrics.equipamentosAtivos },
          { label: "Equipamentos calibrados", value: metrics.equipamentosCalibrados },
          { label: "Equipamentos vencidos", value: metrics.equipamentosVencidos, tone: "alert" },
        ]}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
        <CalibracaoChart data={metrics.previstoPorMes} />
        <DonutChart data={metrics.statusEquipamentos} />
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>CRM por coluna</CardTitle>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {metrics.crmResumo.map((item) => (
              <div
                key={item.coluna}
                className="flex items-center justify-between rounded-xl border border-borderSoft bg-appBg px-4 py-3"
              >
                <span className="text-sm text-textSecondary">{item.label}</span>
                <span className="text-base font-semibold text-textPrimary">{item.valor}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <TabelaDistritos rows={metrics.distritos} />
      <EquipamentosUrgentesList items={equipamentosUrgentes} />

      {role === "admin" ? (
        <ReviewRequestsPanel
          requests={reviewRequests}
          equipamentos={equipamentos}
          users={users}
          onUpdate={async (request, status, observacao) => {
            try {
              await updateReviewRequestStatus(request, status, observacao);
              toast.success("Solicitacao de revisao atualizada.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Falha ao atualizar solicitacao.");
            }
          }}
        />
      ) : null}
    </div>
  );
}
