import { getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const erpnextBaseUrl = Deno.env.get("ERPNEXT_BASE_URL") ?? "";
const erpnextApiKey = Deno.env.get("ERPNEXT_API_KEY") ?? "";
const erpnextApiSecret = Deno.env.get("ERPNEXT_API_SECRET") ?? "";

// SEGURANCA: esta funcao usa a chave do ERPNext, que le o ERP inteiro. Por isso ela NUNCA
// aceita um caminho de arquivo vindo do cliente — apenas o numero da OS. O caminho real e
// buscado no nosso proprio banco, e a leitura passa pelo client do usuario (getUserClient),
// entao as policies de RLS decidem se aquele usuario pode ver aquele equipamento.
// Sem isso, qualquer usuario logado poderia baixar qualquer arquivo do ERPNext.

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!erpnextBaseUrl || !erpnextApiKey || !erpnextApiSecret) {
      return jsonResponse({ error: "Integracao com o ERPNext nao configurada." }, { status: 500 });
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Token ausente." }, { status: 401 });
    }

    const userClient = getUserClient(authHeader);

    const {
      data: { user: caller },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !caller) {
      return jsonResponse({ error: "Nao autenticado." }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const osName = typeof payload?.osName === "string" ? payload.osName.trim() : "";

    if (!osName) {
      return jsonResponse({ error: "Informe o numero da OS." }, { status: 400 });
    }

    // A consulta usa o client DO USUARIO: se ele nao tem acesso ao equipamento, a RLS
    // devolve zero linhas e o acesso e negado — sem precisar duplicar regra de permissao.
    const { data: ordem, error: ordemError } = await userClient
      .from("erpnext_ordens_servico")
      .select("os_name, anexo_certificado")
      .eq("os_name", osName)
      .maybeSingle<{ os_name: string; anexo_certificado: string | null }>();

    if (ordemError) {
      return jsonResponse({ error: ordemError.message }, { status: 400 });
    }

    if (!ordem) {
      return jsonResponse({ error: "OS nao encontrada ou sem permissao de acesso." }, { status: 404 });
    }

    if (!ordem.anexo_certificado) {
      return jsonResponse({ error: "Esta OS nao possui certificado anexado no ERPNext." }, { status: 404 });
    }

    // O caminho vem do nosso banco (gravado pela sincronizacao), nunca do cliente.
    const caminho = ordem.anexo_certificado;
    const fileUrl = caminho.startsWith("http") ? caminho : `${erpnextBaseUrl}${caminho}`;

    // Trava extra: so servimos arquivos do proprio ERPNext configurado.
    if (!fileUrl.startsWith(erpnextBaseUrl)) {
      return jsonResponse({ error: "Caminho de certificado invalido." }, { status: 400 });
    }

    const fileResponse = await fetch(fileUrl, {
      headers: { Authorization: `token ${erpnextApiKey}:${erpnextApiSecret}` },
    });

    if (!fileResponse.ok) {
      return jsonResponse(
        { error: `Nao foi possivel obter o certificado no ERPNext (${fileResponse.status}).` },
        { status: 502 },
      );
    }

    const conteudo = await fileResponse.arrayBuffer();
    const contentType = fileResponse.headers.get("content-type") ?? "application/pdf";
    const nomeArquivo = caminho.split("/").pop() || `${osName}.pdf`;

    return new Response(conteudo, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${nomeArquivo}"`,
      },
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro interno ao obter o certificado." },
      { status: 500 },
    );
  }
});
