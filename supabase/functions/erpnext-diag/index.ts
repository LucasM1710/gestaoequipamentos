import { getAdminClient, getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

// Diagnostico profundo do acesso a arquivos privados do ERPNext. Somente admin. Usa as
// credenciais da API (mesmas do sync) e reporta: quem o ERP reconhece no token, o estado do
// arquivo no cadastro, e o que cada rota de download responde. Nao altera nada.

const erpnextBaseUrl = Deno.env.get("ERPNEXT_BASE_URL") ?? "";
const erpnextApiKey = Deno.env.get("ERPNEXT_API_KEY") ?? "";
const erpnextApiSecret = Deno.env.get("ERPNEXT_API_SECRET") ?? "";
const erpnextAuth = { Authorization: `token ${erpnextApiKey}:${erpnextApiSecret}` };

async function sonda(url: string) {
  try {
    const res = await fetch(url, { headers: erpnextAuth });
    const ct = res.headers.get("content-type") ?? "";
    const corpo = await res.text().catch(() => "");
    return { url, status: res.status, contentType: ct, corpo: corpo.slice(0, 400) };
  } catch (e) {
    return { url, erro: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Token ausente." }, { status: 401 });

    const userClient = getUserClient(authHeader);
    const adminClient = getAdminClient();
    const {
      data: { user: caller },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !caller) return jsonResponse({ error: "Nao autenticado." }, { status: 401 });

    const { data: perfil } = await adminClient.from("users").select("role").eq("id", caller.id).single();
    if (!perfil || perfil.role !== "admin") {
      return jsonResponse({ error: "Apenas admin." }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const caminho = typeof payload?.caminho === "string" && payload.caminho
      ? payload.caminho
      : "/private/files/060204_01 - Veolia Araraquara - L6606.pdf";

    const recurso = (doctype: string, filters: unknown, fields: unknown) =>
      `${erpnextBaseUrl}/api/resource/${encodeURIComponent(doctype)}` +
      `?filters=${encodeURIComponent(JSON.stringify(filters))}` +
      `&fields=${encodeURIComponent(JSON.stringify(fields))}&limit_page_length=0`;

    const fileFields = [
      "name",
      "file_name",
      "is_private",
      "attached_to_doctype",
      "attached_to_name",
      "owner",
      "file_url",
    ];

    // 1. Quem o ERP reconhece no nosso token?
    const quemSou = await sonda(`${erpnextBaseUrl}/api/method/frappe.auth.get_logged_user`);

    // 2. Papeis do usuario da API (para confirmar se e realmente System Manager).
    const papeis = await sonda(
      recurso("Has Role", [["parent", "=", "api-portal-veolia@eranalitica.com.br"]], ["role"]),
    );

    // 3. Arquivos anexados a OS-60204, e por padrao no nome (via LIKE), evitando problema de encoding.
    const arquivosDaOs = await sonda(recurso("File", [["attached_to_name", "=", "OS-60204"]], fileFields));
    const arquivosPorNome = await sonda(recurso("File", [["file_url", "like", "%060204%"]], fileFields));
    const arquivo = await sonda(recurso("File", [["file_url", "=", caminho]], fileFields));

    // 3. Conseguimos ler a OS-60204 diretamente?
    const os = await sonda(
      `${erpnextBaseUrl}/api/resource/${encodeURIComponent("Ordem Servico Externa")}/OS-60204?fields=${encodeURIComponent(
        JSON.stringify(["name", "informe_numero_serie", "anexo_certificado"]),
      )}`,
    );

    // 4. Rotas de download (para registro).
    const downloadDireto = await sonda(`${erpnextBaseUrl}${encodeURI(caminho)}`);
    const downloadMetodo = await sonda(
      `${erpnextBaseUrl}/api/method/frappe.utils.file_manager.download_file?file_url=${encodeURIComponent(caminho)}`,
    );

    return jsonResponse({
      caminho,
      quemSou,
      papeis,
      arquivosDaOs,
      arquivosPorNome,
      arquivo,
      os,
      downloadDireto,
      downloadMetodo,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro no diagnostico." },
      { status: 500 },
    );
  }
});
