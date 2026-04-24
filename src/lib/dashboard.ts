import { getYear, parseISO } from "date-fns";
import { getMonthLabels } from "@/lib/utils";
import { summarizeStatus } from "@/lib/statusUtils";
import type { Calibracao, CrmCard, DashboardMetrics, EquipamentoVisao, ReviewRequest } from "@/types";

const crmLabels = {
  sem_contato: "Sem contato",
  aguardando_retorno: "Aguardando retorno",
  em_contato: "Em contato",
  agendado: "Agendado",
  calibrado: "Calibrado",
} as const;

interface DashboardMetricSources {
  calibracoes: Calibracao[];
  crmCards: CrmCard[];
  reviewRequests: ReviewRequest[];
}

export function getDashboardDistrict(item: Pick<EquipamentoVisao, "district" | "owner_district">) {
  const equipamentoDistrict = item.district?.trim();
  if (equipamentoDistrict) {
    return equipamentoDistrict;
  }

  const ownerDistrict = item.owner_district?.trim();
  if (ownerDistrict) {
    return ownerDistrict;
  }

  return "Sem distrito";
}

function matchesDashboardDistrict(item: EquipamentoVisao, district: string) {
  if (!district || district === "todos") {
    return true;
  }

  return getDashboardDistrict(item) === district;
}

export function buildDashboardMetrics(
  items: EquipamentoVisao[],
  district: string,
  isAdmin: boolean,
  sources: DashboardMetricSources,
): DashboardMetrics {
  const allScoped = items.filter((item) => matchesDashboardDistrict(item, district));

  const equipmentById = new Map(items.map((item) => [item.id, item]));
  const scoped = items.filter((item) => {
    if (!item.active) {
      return false;
    }

    return matchesDashboardDistrict(item, district);
  });

  const currentYear = new Date().getFullYear();
  const monthLabels = getMonthLabels();
  const status = summarizeStatus(scoped);

  const scopedCalibracoes = sources.calibracoes.filter((item) => {
    const equipamento = equipmentById.get(item.equipamento_id);
    if (!equipamento?.active) {
      return false;
    }

    if (district && district !== "todos") {
      return matchesDashboardDistrict(equipamento, district);
    }

    return true;
  });

  const calibracoesRealizadasKeys = new Set(
    scopedCalibracoes
      .filter((item) => item.realizado)
      .map((item) => `${item.equipamento_id}::${item.data_calibracao}`),
  );

  const fallbackCalibracoesImportadas = scoped
    .filter((item) => item.ultima_calibracao)
    .filter((item) => {
      const date = parseISO(item.ultima_calibracao as string);
      return getYear(date) === currentYear;
    })
    .filter((item) => !calibracoesRealizadasKeys.has(`${item.id}::${item.ultima_calibracao}`));

  const previstoPorMes = monthLabels.map((mes, index) => {
    const previsto = scoped.filter((item) => {
      if (!item.proxima_calibracao) {
        return false;
      }
      const date = parseISO(item.proxima_calibracao);
      return date.getMonth() === index && getYear(date) === currentYear;
    }).length;

    const executadoHistorico = scopedCalibracoes.filter((item) => {
      const date = parseISO(item.data_calibracao);
      return item.realizado && date.getMonth() === index && getYear(date) === currentYear;
    }).length;

    const executadoFallback = fallbackCalibracoesImportadas.filter((item) => {
      const date = parseISO(item.ultima_calibracao as string);
      return date.getMonth() === index;
    }).length;

    return { mes, previsto, executado: executadoHistorico + executadoFallback };
  });

  const crmResumo = Object.entries(crmLabels).map(([coluna, label]) => ({
    coluna: coluna as keyof typeof crmLabels,
    label,
    valor: sources.crmCards.filter((card) => card.coluna === coluna).length,
  }));

  const distritosMap = new Map<string, EquipamentoVisao[]>();
  scoped.forEach((item) => {
    const key = getDashboardDistrict(item);
    const current = distritosMap.get(key) ?? [];
    current.push(item);
    distritosMap.set(key, current);
  });

  const distritos = Array.from(distritosMap.entries()).map(([key, values]) => {
    const resumo = summarizeStatus(values);
    return {
      district: key,
      calibrado: resumo.calibrado,
      critico: resumo.critico,
      vencido: resumo.vencido,
      agendado: resumo.agendado,
      total: values.length,
    };
  });

  return {
    calibracoesRealizadas:
      scopedCalibracoes.filter((item) => {
        const date = parseISO(item.data_calibracao);
        return item.realizado && getYear(date) === currentYear;
      }).length + fallbackCalibracoesImportadas.length,
    equipamentosCalibrados: status.calibrado,
    equipamentosAtivos: allScoped.length,
    equipamentosVencidos: status.vencido,
    previstoPorMes,
    statusEquipamentos: [
      { nome: "Calibrado", valor: status.calibrado },
      { nome: "Critico", valor: status.critico },
      { nome: "Vencido", valor: status.vencido },
      { nome: "Agendado", valor: status.agendado },
    ],
    crmResumo,
    distritos,
    pendingReviews: isAdmin ? sources.reviewRequests.filter((item) => item.status === "aberto").length : 0,
  };
}
