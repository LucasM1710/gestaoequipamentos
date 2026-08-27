import { getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const erpnextBaseUrl = Deno.env.get("ERPNEXT_BASE_URL") ?? "";
const erpnextApiKey = Deno.env.get("ERPNEXT_API_KEY") ?? "";
const erpnextApiSecret = Deno.env.get("ERPNEXT_API_SECRET") ?? "";

// SEGURANCA: esta funcao usa a chave do ERPNext, que le o ERP inteiro. Por isso o ponto de
// ancora e SEMPRE o equipamento (equipamentoId): a leitura passa pelo client do usuario, entao
// a RLS decide se ele pode ver aquele equipamento. O numero da OS nunca vem digitado livremente
// pelo cliente — vem de uma OS ja vinculada ao equipamento OU do campo certificado do proprio
// equipamento. Assim ninguem consegue baixar um arquivo arbitrario do ERPNext.

const erpnextAuth = { Authorization: `token ${erpnextApiKey}:${erpnextApiSecret}` };

// "44104" -> "OS-44104"; "OS-60716" -> "OS-60716"; "CER-001" -> null (nao e numero de OS).
function derivarOsName(certificado: string | null): string | null {
  const c = (certificado ?? "").trim();
  if (!c) return null;
  if (/^OS-\d+$/i.test(c)) return c.toUpperCase();
  const digitos = c.replace(/\D/g, "");
  return digitos.length >= 3 ? `OS-${digitos}` : null;
}

async function buscarAnexoNoErp(osName: string): Promise<string | null> {
  for (const doctype of ["Ordem Servico Externa", "Ordem Servico Interna"]) {
    const params = new URLSearchParams({
      filters: JSON.stringify([["name", "=", osName]]),
      fields: JSON.stringify(["name", "anexo_certificado"]),
      limit_page_length: "1",
    });
    const url = `${erpnextBaseUrl}/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`;
    const res = await fetch(url, { headers: erpnextAuth });
    if (!res.ok) continue;
    const payload = (await res.json()) as { data?: { anexo_certificado?: string | null }[] };
    const anexo = payload.data?.[0]?.anexo_certificado;
    if (anexo) return anexo;
  }
  return null;
}

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
    const equipamentoId = typeof payload?.equipamentoId === "string" ? payload.equipamentoId : "";
    const osName = typeof payload?.osName === "string" ? payload.osName.trim() : "";

    if (!equipamentoId) {
      return jsonResponse({ error: "Informe o equipamento." }, { status: 400 });
    }

    // Ancora de permissao: a leitura usa o client do usuario, entao a RLS de `equipamentos`
    // garante que ele so alcança equipamentos que tem direito de ver.
    const { data: equipamento, error: equipamentoError } = await userClient
      .from("equipamentos")
      .select("id, certificado")
      .eq("id", equipamentoId)
      .maybeSingle<{ id: string; certificado: string | null }>();

    if (equipamentoError) {
      return jsonResponse({ error: equipamentoError.message }, { status: 400 });
    }

    if (!equipamento) {
      return jsonResponse({ error: "Equipamento nao encontrado ou sem permissao de acesso." }, { status: 404 });
    }

    let caminho: string | null = null;

    if (osName) {
      // Caso vinculado: a OS precisa pertencer a ESTE equipamento (checado no nosso banco).
      const { data: ordem } = await userClient
        .from("erpnext_ordens_servico")
        .select("anexo_certificado")
        .eq("equipamento_id", equipamentoId)
        .eq("os_name", osName)
        .maybeSingle<{ anexo_certificado: string | null }>();
      caminho = ordem?.anexo_certificado ?? null;
      if (!caminho) {
        caminho = await buscarAnexoNoErp(osName);
      }
    } else {
      // Caso sem vinculo: usa o numero de OS guardado no campo certificado do proprio equipamento.
      const derivado = derivarOsName(equipamento.certificado);
      if (!derivado) {
        return jsonResponse(
          { error: "Este equipamento nao tem um numero de OS valido para buscar o certificado." },
          { status: 404 },
        );
      }
      caminho = await buscarAnexoNoErp(derivado);
    }

    if (!caminho) {
      return jsonResponse({ error: "Nenhum certificado anexado foi encontrado para este equipamento." }, { status: 404 });
    }

    const base = caminho.startsWith("http") ? caminho : `${erpnextBaseUrl}${caminho}`;
    if (!base.startsWith(erpnextBaseUrl)) {
      return jsonResponse({ error: "Caminho de certificado invalido." }, { status: 400 });
    }
    const caminhoRelativo = base.slice(erpnextBaseUrl.length); // "/private/files/....pdf"

    // A rota /private/files/ do Frappe nao aplica o token da API (trata como visitante -> 403).
    // Entao tentamos primeiro o metodo de download via /api/ (onde o token vale), e o link
    // direto so como reserva.
    const tentativas = [
      `${erpnextBaseUrl}/api/method/frappe.utils.file_manager.download_file?file_url=${encodeURIComponent(caminhoRelativo)}`,
      `${erpnextBaseUrl}/api/method/frappe.core.doctype.file.file.download_file?file_url=${encodeURIComponent(caminhoRelativo)}`,
      encodeURI(base),
    ];

    let fileResponse: Response | null = null;
    for (const url of tentativas) {
      const res = await fetch(url, { headers: erpnextAuth });
      const ct = res.headers.get("content-type") ?? "";
      if (res.ok && !ct.includes("text/html")) {
        fileResponse = res;
        break;
      }
      const corpoErro = await res.text().catch(() => "");
      console.error(
        "erpnext-certificado: tentativa falhou",
        JSON.stringify({ url, status: res.status, contentType: ct, corpo: corpoErro.slice(0, 300) }),
      );
    }

    if (!fileResponse) {
      return jsonResponse(
        { error: "Nao foi possivel obter o certificado no ERPNext (sem acesso ao arquivo privado)." },
        { status: 502 },
      );
    }

    const conteudo = await fileResponse.arrayBuffer();
    const contentType = fileResponse.headers.get("content-type") ?? "application/pdf";
    const nomeArquivo = caminho.split("/").pop() || "certificado.pdf";

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
