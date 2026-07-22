import { getAdminClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { fetchErpnextResource, type ErpnextFilter } from "../_shared/erpnext.ts";

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
const FIRST_RUN_FLOOR_DATE = "2026-01-01";
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

    // Sem sincronizacao anterior, limita a carga inicial a partir deste ano (em vez de todo o
    // historico do ERPNext) para nao estourar os limites de recursos da Edge Function.
    const deltaFilter: ErpnextFilter[] = state.last_synced_at
      ? [["modified", ">", state.last_synced_at]]
      : [["data_cal", ">=", FIRST_RUN_FLOOR_DATE]];

    const filtersInterna: ErpnextFilter[] = [
      ["status_conserto", "=", "Finalizado"],
      ["repair_status", "in", ["Liberado", "Liberado com Restrição"]],
      ["data_cal_recomendada", "is", "set"],
      ...deltaFilter,
    ];

    const filtersExterna: ErpnextFilter[] = [
      ["repair_status", "in", ["Liberado", "Liberado com Restrição"]],
      ["data_cal_recomendada", "is", "set"],
      ...deltaFilter,
    ];

    const [interna, externa] = await Promise.all([
      fetchErpnextResource<OrdemServico>("Ordem Servico Interna", {
        filters: filtersInterna,
        orFilters: OR_FILTERS,
        fields: OS_FIELDS,
      }),
      fetchErpnextResource<OrdemServico>("Ordem Servico Externa", {
        filters: filtersExterna,
        orFilters: OR_FILTERS,
        fields: OS_FIELDS,
      }),
    ]);

    const merged = new Map<string, OrdemServico>();
    for (const os of [...interna, ...externa]) {
      if (!os.informe_numero_serie) continue;
      const existing = merged.get(os.informe_numero_serie);
      if (!existing || (os.data_cal ?? "") > (existing.data_cal ?? "")) {
        merged.set(os.informe_numero_serie, os);
      }
    }

    const unmatched: string[] = [];

    for (const os of merged.values()) {
      const { data, error } = await adminClient
        .from("equipamentos")
        .update({
          ultima_calibracao: os.data_cal,
          proxima_calibracao: os.data_cal_recomendada,
          certificado: os.name,
          erpnext_anexo_certificado: os.anexo_certificado,
        })
        .eq("erpnext_equipment_id", os.informe_numero_serie)
        .select("id");

      if (error) {
        throw new Error(`Falha ao atualizar equipamento ${os.informe_numero_serie}: ${error.message}`);
      }

      if (!data || data.length === 0) {
        unmatched.push(os.informe_numero_serie as string);
      }
    }

    if (unmatched.length > 0) {
      await adminClient.rpc("registrar_log", {
        p_user_id: null,
        p_acao: "Sincronizacao ERPNext: equipamento sem vinculo",
        p_tabela: "equipamentos",
        p_registro_id: null,
        p_valor_anterior: null,
        p_valor_novo: { unmatched },
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

    return jsonResponse({ success: true, processed: merged.size, unmatched: unmatched.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno na sincronizacao com o ERPNext.";
    await adminClient
      .from("erpnext_sync_state")
      .update({ last_run_status: "error", last_error: message })
      .eq("id", true);
    return jsonResponse({ error: message }, { status: 500 });
  }
});
