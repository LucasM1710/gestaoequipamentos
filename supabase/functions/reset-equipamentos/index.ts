import { getAdminClient, getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

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

    const { data: callerProfile } = await adminClient.from("users").select("id, role").eq("id", caller.id).single();
    if (!callerProfile || callerProfile.role !== "admin") {
      return jsonResponse({ error: "Apenas admin pode resetar equipamentos." }, { status: 403 });
    }

    const body = (await request.json()) as { password?: string };
    const expectedPassword = Deno.env.get("RESET_EQUIPAMENTOS_PASSWORD");

    if (!expectedPassword) {
      return jsonResponse({ error: "Senha de reset nao configurada." }, { status: 500 });
    }

    if (!body.password || body.password !== expectedPassword) {
      return jsonResponse({ error: "Senha invalida para reset de equipamentos." }, { status: 403 });
    }

    const { count: equipamentosCountBefore, error: countError } = await adminClient
      .from("equipamentos")
      .select("id", { count: "exact", head: true });

    if (countError) {
      return jsonResponse({ error: countError.message }, { status: 400 });
    }

    const { error: emailLogsError } = await adminClient
      .from("email_logs")
      .update({ equipamento_id: null })
      .not("equipamento_id", "is", null);

    if (emailLogsError) {
      return jsonResponse({ error: emailLogsError.message }, { status: 400 });
    }

    const { error: equipamentosDeleteError } = await adminClient
      .from("equipamentos")
      .delete()
      .not("id", "is", null);

    if (equipamentosDeleteError) {
      return jsonResponse({ error: equipamentosDeleteError.message }, { status: 400 });
    }

    await adminClient.rpc("registrar_log", {
      p_user_id: caller.id,
      p_acao: "Resetou equipamentos",
      p_tabela: "equipamentos",
      p_registro_id: null,
      p_valor_anterior: { total_antes: equipamentosCountBefore ?? 0 },
      p_valor_novo: { total_depois: 0 },
    });

    return jsonResponse({
      success: true,
      message: `${equipamentosCountBefore ?? 0} equipamento(s) removido(s) com sucesso.`,
      removed: equipamentosCountBefore ?? 0,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro interno ao resetar equipamentos." },
      { status: 500 },
    );
  }
});
