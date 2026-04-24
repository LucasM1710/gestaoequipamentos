import { getAdminClient, getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type AppRole = "admin" | "gestor" | "lider" | "usuario";

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

    const { data: callerProfile, error: profileError } = await adminClient
      .from("users")
      .select("id, role")
      .eq("id", caller.id)
      .single();

    if (profileError || !callerProfile) {
      return jsonResponse({ error: "Perfil nao encontrado." }, { status: 403 });
    }

    const role = callerProfile.role as AppRole;
    if (!["admin", "gestor", "lider"].includes(role)) {
      return jsonResponse({ error: "Perfil sem acesso ao dashboard consolidado." }, { status: 403 });
    }

    const [equipamentosResponse, calibracoesResponse, crmCardsResponse, usersResponse] = await Promise.all([
      adminClient.from("equipamentos_visao").select("*").order("created_at", { ascending: false }),
      adminClient.from("calibracoes").select("*"),
      adminClient.from("crm_cards").select("*"),
      adminClient.from("users").select("*").eq("active", true),
    ]);

    if (equipamentosResponse.error) {
      return jsonResponse({ error: equipamentosResponse.error.message }, { status: 400 });
    }

    if (calibracoesResponse.error) {
      return jsonResponse({ error: calibracoesResponse.error.message }, { status: 400 });
    }

    if (crmCardsResponse.error) {
      return jsonResponse({ error: crmCardsResponse.error.message }, { status: 400 });
    }

    if (usersResponse.error) {
      return jsonResponse({ error: usersResponse.error.message }, { status: 400 });
    }

    let reviewRequests: unknown[] = [];
    if (role === "admin") {
      const { data, error } = await adminClient
        .from("review_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, { status: 400 });
      }

      reviewRequests = data ?? [];
    }

    return jsonResponse({
      equipamentos: equipamentosResponse.data ?? [],
      calibracoes: calibracoesResponse.data ?? [],
      crmCards: crmCardsResponse.data ?? [],
      reviewRequests,
      users: usersResponse.data ?? [],
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Erro interno ao carregar dashboard consolidado.",
      },
      { status: 500 },
    );
  }
});
