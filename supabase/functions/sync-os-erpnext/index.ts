import { getAdminClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { chunkArray, fetchErpnextResource, type ErpnextFilter } from "../_shared/erpnext.ts";

interface OrdemServico {
  informe_numero_serie: string | null;
  name: string;
  data_cal: string | null;
  data_cal_recomendada: string | null;
  anexo_certificado: string | null;
}

interface SyncState {
  id: boolean;
  last_synced_at: string | null;
  last_run_started_at: string | null;
  last_run_status: string | null;
  last_error: string | null;
}

const RUNNING_LOCK_MINUTES = 20;

// So interessam calibracoes recentes: queremos a MAIS RECENTE de cada equipamento, entao
// nao ha motivo para varrer o historico inteiro do ERPNext.
const DATA_CAL_FLOOR = "2026-01-01";

// Equipamentos por consulta ao ERPNext. Mantem a URL num tamanho seguro e o volume
// de cada resposta pequeno.
const EQUIPAMENTOS_POR_CONSULTA = 50;

const OS_FIELDS = ["informe_numero_serie", "name", "data_cal", "data_cal_recomendada", "anexo_certificado"];
const OR_FILTERS: ErpnextFilter[] = [
  ["cal_rbc", "=", 1],
  ["cal_rastreavel", "=", 1],
];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const adminClient = getAdminClient();

  try {
    const { data: state, error: stateError } = await adminClient
      .from("erpnext_sync_state")
      .select("*")
      .eq("id", true)
      .single<SyncState>();

    if (stateError) {
      return jsonResponse({ error: stateError.message }, { status: 400 });
    }

    if (state.last_run_status === "running" && state.last_run_started_at) {
      const elapsedMinutes = (Date.now() - new Date(state.last_run_started_at).getTime()) / 60000;
      if (elapsedMinutes < RUNNING_LOCK_MINUTES) {
        return jsonResponse({ skipped: true, reason: "Sincronizacao anterior ainda em execucao." });
      }
    }

    const runStartedAt = new Date();

    await adminClient
      .from("erpnext_sync_state")
      .update({ last_run_status: "running", last_run_started_at: runStartedAt.toISOString() })
      .eq("id", true);

    // 1. Só nos importam os equipamentos que ja tem vinculo com o ERPNext.
    const { data: vinculados, error: vinculadosError } = await adminClient
      .from("equipamentos")
      .select("erpnext_equipment_id")
      .not("erpnext_equipment_id", "is", null)
      .returns<{ erpnext_equipment_id: string }[]>();

    if (vinculadosError) {
      throw new Error(`Falha ao carregar equipamentos vinculados: ${vinculadosError.message}`);
    }

    const equipmentIds = (vinculados ?? []).map((row) => row.erpnext_equipment_id);

    if (equipmentIds.length === 0) {
      await adminClient
        .from("erpnext_sync_state")
        .update({ last_synced_at: runStartedAt.toISOString(), last_run_status: "success", last_error: null })
        .eq("id", true);
      return jsonResponse({ success: true, equipamentosConsultados: 0, atualizados: 0, semVinculo: 0 });
    }

    // 2. Pergunta ao ERPNext apenas as OS DESSES equipamentos, em blocos e em sequencia
    //    (nunca em paralelo, para nao ocupar varios workers do Frappe ao mesmo tempo).
    const maisRecentePorEquipamento = new Map<string, OrdemServico>();

    for (const bloco of chunkArray(equipmentIds, EQUIPAMENTOS_POR_CONSULTA)) {
      const filtrosComuns: ErpnextFilter[] = [
        ["repair_status", "in", ["Liberado", "Liberado com Restrição"]],
        ["data_cal_recomendada", "is", "set"],
        ["data_cal", ">=", DATA_CAL_FLOOR],
        ["informe_numero_serie", "in", bloco],
      ];

      const interna = await fetchErpnextResource<OrdemServico>("Ordem Servico Interna", {
        filters: [["status_conserto", "=", "Finalizado"], ...filtrosComuns],
        orFilters: OR_FILTERS,
        fields: OS_FIELDS,
        orderBy: "data_cal desc",
      });

      const externa = await fetchErpnextResource<OrdemServico>("Ordem Servico Externa", {
        filters: filtrosComuns,
        orFilters: OR_FILTERS,
        fields: OS_FIELDS,
        orderBy: "data_cal desc",
      });

      // 3. Junta Interna + Externa e fica com a calibracao de data_cal mais recente.
      for (const os of [...interna, ...externa]) {
        if (!os.informe_numero_serie) continue;
        const atual = maisRecentePorEquipamento.get(os.informe_numero_serie);
        if (!atual || (os.data_cal ?? "") > (atual.data_cal ?? "")) {
          maisRecentePorEquipamento.set(os.informe_numero_serie, os);
        }
      }
    }

    // 4. Grava tudo numa unica operacao no banco.
    const registros = Array.from(maisRecentePorEquipamento.entries()).map(([equipmentId, os]) => ({
      erpnext_equipment_id: equipmentId,
      data_cal: os.data_cal,
      data_cal_recomendada: os.data_cal_recomendada,
      os_name: os.name,
      anexo_certificado: os.anexo_certificado,
    }));

    let atualizados = 0;
    let semVinculo: string[] = [];

    if (registros.length > 0) {
      const { data: resultado, error: applyError } = await adminClient
        .rpc("aplicar_sync_erpnext", { p_registros: registros })
        .single<{ atualizados: number; sem_vinculo: string[] }>();

      if (applyError) {
        throw new Error(`Falha ao aplicar atualizacoes: ${applyError.message}`);
      }

      atualizados = resultado?.atualizados ?? 0;
      semVinculo = resultado?.sem_vinculo ?? [];
    }

    if (semVinculo.length > 0) {
      await adminClient.rpc("registrar_log", {
        p_user_id: null,
        p_acao: "Sincronizacao ERPNext: OS sem equipamento vinculado",
        p_tabela: "equipamentos",
        p_registro_id: null,
        p_valor_anterior: null,
        p_valor_novo: { sem_vinculo: semVinculo },
      });
    }

    await adminClient
      .from("erpnext_sync_state")
      .update({
        last_synced_at: runStartedAt.toISOString(),
        last_run_status: "success",
        last_error: null,
      })
      .eq("id", true);

    return jsonResponse({
      success: true,
      equipamentosConsultados: equipmentIds.length,
      osEncontradas: registros.length,
      atualizados,
      semVinculo: semVinculo.length,
      duracaoSegundos: Math.round((Date.now() - runStartedAt.getTime()) / 1000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno na sincronizacao com o ERPNext.";
    await adminClient
      .from("erpnext_sync_state")
      .update({ last_run_status: "error", last_error: message })
      .eq("id", true);
    return jsonResponse({ error: message }, { status: 500 });
  }
});
