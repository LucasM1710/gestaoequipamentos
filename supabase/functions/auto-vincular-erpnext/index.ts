import { getAdminClient, getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { autoVincularEquipamentos } from "../_shared/vinculo.ts";

// Auto-vinculo manual (admin). Liga cada equipamento SEM vinculo ao codigo do ERP usando o
// cadastro de Equipamentos (serie -> code). A logica fica em _shared/vinculo.ts, reaproveitada
// pela sincronizacao periodica (auto-recuperacao). Aceita { equipamentoId } para testar um so.

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Token ausente." }, { status: 401 });
    }

    const userClient = getUserClient(authHeader);
    const adminClient = getAdminClient();

    const {
      data: { user: caller },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !caller) {
      return jsonResponse({ error: "Nao autenticado." }, { status: 401 });
    }

    const { data: perfil } = await adminClient.from("users").select("id, role").eq("id", caller.id).single();
    if (!perfil || perfil.role !== "admin") {
      return jsonResponse({ error: "Apenas admin pode auto-vincular equipamentos." }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const equipamentoId = typeof payload?.equipamentoId === "string" ? payload.equipamentoId : undefined;

    const { vinculados, revisao } = await autoVincularEquipamentos(adminClient, { equipamentoId });

    const stats = { vinculados: vinculados.length, revisao };

    await adminClient.rpc("registrar_log", {
      p_user_id: caller.id,
      p_acao: "Auto-vinculo ERPNext pelo cadastro de Equipamentos",
      p_tabela: "equipamentos",
      p_registro_id: null,
      p_valor_anterior: null,
      p_valor_novo: stats,
    });

    return jsonResponse({ success: true, ...stats, vinculados });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro interno no auto-vinculo." },
      { status: 500 },
    );
  }
});
