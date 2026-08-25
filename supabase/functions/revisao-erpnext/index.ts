import { getAdminClient, getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { chunkArray, fetchErpnextResource } from "../_shared/erpnext.ts";

// Le a tabela de revisao de vinculo e devolve, para a tela do admin, tres grupos:
//  - duplicados: serie real que aponta para varios equipamentos no ERP -> mostra cada candidato
//    com descricao + cliente (do cadastro Equipamentos) para o admin escolher o certo.
//  - naoEncontrados: serie real que nao existe no cadastro do ERP -> cadastrar la (ou vincular manual).
//  - placeholders: serie invalida ("Nao informado" etc.) -> corrigir a serie primeiro.
// Somente leitura; nao altera nada.

interface RevisaoRow {
  equipamento_id: string;
  serial_number: string | null;
  customer: string | null;
  equipamento_id_erp: string | null;
  motivo: string;
}

interface EquipErp {
  name: string;
  numero_serie: string | null;
  customer: string | null;
  descricao: string | null;
}

function isPlaceholder(serial: string | null): boolean {
  const s = (serial ?? "").trim().toLowerCase();
  if (!s) return true;
  if (/(informado|especificado)/.test(s)) return true;
  if (/^n\/?a\b/.test(s) || s === "n/a") return true;
  if (/^[0\-\s.]+$/.test(s)) return true;
  return false;
}

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
      return jsonResponse({ error: "Apenas admin pode ver a revisao de vinculos." }, { status: 403 });
    }

    const { data: rows, error: rowsError } = await adminClient
      .from("erpnext_vinculo_revisao")
      .select("equipamento_id, serial_number, customer, equipamento_id_erp, motivo")
      .returns<RevisaoRow[]>();
    if (rowsError) {
      return jsonResponse({ error: rowsError.message }, { status: 400 });
    }

    const placeholders: RevisaoRow[] = [];
    const duplicados: RevisaoRow[] = [];
    const naoEncontrados: RevisaoRow[] = [];

    for (const row of rows ?? []) {
      if (isPlaceholder(row.serial_number)) {
        placeholders.push(row);
      } else if (row.motivo.startsWith("Serie duplicada")) {
        duplicados.push(row);
      } else {
        naoEncontrados.push(row);
      }
    }

    // Busca no ERP a descricao + cliente de cada codigo candidato dos duplicados.
    const codigos = new Set<string>();
    for (const row of duplicados) {
      for (const codigo of (row.equipamento_id_erp ?? "").split(",").map((c) => c.trim()).filter(Boolean)) {
        codigos.add(codigo);
      }
    }

    const detalhePorCodigo = new Map<string, EquipErp>();
    if (codigos.size > 0) {
      for (const bloco of chunkArray([...codigos], 50)) {
        const linhas = await fetchErpnextResource<EquipErp>("Equipamentos", {
          filters: [["name", "in", bloco]],
          fields: ["name", "numero_serie", "customer", "descricao"],
        });
        for (const linha of linhas) {
          detalhePorCodigo.set(linha.name, linha);
        }
      }
    }

    const duplicadosDetalhados = duplicados.map((row) => ({
      equipamento_id: row.equipamento_id,
      serial_number: row.serial_number,
      customer: row.customer,
      candidatos: (row.equipamento_id_erp ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .map((codigo) => {
          const d = detalhePorCodigo.get(codigo);
          return {
            codigo,
            descricao: d?.descricao ?? null,
            customer: d?.customer ?? null,
            numero_serie: d?.numero_serie ?? null,
          };
        }),
    }));

    return jsonResponse({
      success: true,
      resumo: {
        duplicados: duplicados.length,
        naoEncontrados: naoEncontrados.length,
        placeholders: placeholders.length,
      },
      duplicados: duplicadosDetalhados,
      naoEncontrados: naoEncontrados.map((r) => ({
        equipamento_id: r.equipamento_id,
        serial_number: r.serial_number,
        customer: r.customer,
      })),
      placeholders: placeholders.map((r) => ({
        equipamento_id: r.equipamento_id,
        serial_number: r.serial_number,
        customer: r.customer,
      })),
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro interno ao carregar a revisao." },
      { status: 500 },
    );
  }
});
