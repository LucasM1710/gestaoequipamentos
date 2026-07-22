import { getAdminClient, getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { fetchErpnextResource, normalizeSerial, normalizeText } from "../_shared/erpnext.ts";

interface ErpnextEquipamento {
  name: string;
  numero_serie: string | null;
  customer: string | null;
}

interface LocalEquipamento {
  id: string;
  serial_number: string;
  customer: string | null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

    const { data: callerProfile } = await adminClient
      .from("users")
      .select("id, role")
      .eq("id", caller.id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return jsonResponse({ error: "Apenas admin pode vincular equipamentos ao ERPNext." }, { status: 403 });
    }

    const erpnextEquipamentos = await fetchErpnextResource<ErpnextEquipamento>("Equipamentos", {
      fields: ["name", "numero_serie", "customer"],
    });

    const bySerial = new Map<string, ErpnextEquipamento[]>();
    for (const item of erpnextEquipamentos) {
      const key = normalizeSerial(item.numero_serie);
      if (!key) continue;
      const list = bySerial.get(key) ?? [];
      list.push(item);
      bySerial.set(key, list);
    }

    const { data: localRows, error: localError } = await adminClient
      .from("equipamentos")
      .select("id, serial_number, customer")
      .is("erpnext_equipment_id", null)
      .returns<LocalEquipamento[]>();

    if (localError) {
      return jsonResponse({ error: localError.message }, { status: 400 });
    }

    const matched: { localId: string; erpnextId: string }[] = [];
    const unmatched: { id: string; serial_number: string; customer: string | null }[] = [];
    const ambiguous: {
      id: string;
      serial_number: string;
      customer: string | null;
      candidates: { name: string; customer: string | null }[];
    }[] = [];

    for (const row of localRows ?? []) {
      const candidates = bySerial.get(normalizeSerial(row.serial_number)) ?? [];

      if (candidates.length === 0) {
        unmatched.push({ id: row.id, serial_number: row.serial_number, customer: row.customer });
        continue;
      }

      if (candidates.length === 1) {
        matched.push({ localId: row.id, erpnextId: candidates[0].name });
        continue;
      }

      const byCustomer = candidates.filter(
        (candidate) => normalizeText(candidate.customer) === normalizeText(row.customer),
      );

      if (byCustomer.length === 1) {
        matched.push({ localId: row.id, erpnextId: byCustomer[0].name });
      } else {
        ambiguous.push({
          id: row.id,
          serial_number: row.serial_number,
          customer: row.customer,
          candidates: candidates.map((candidate) => ({ name: candidate.name, customer: candidate.customer })),
        });
      }
    }

    for (const chunk of chunkArray(matched, 100)) {
      for (const match of chunk) {
        const { error: updateError } = await adminClient
          .from("equipamentos")
          .update({ erpnext_equipment_id: match.erpnextId })
          .eq("id", match.localId);

        if (updateError) {
          return jsonResponse({ error: updateError.message }, { status: 400 });
        }
      }
    }

    const stats = {
      totalErpnext: erpnextEquipamentos.length,
      totalLocalSemVinculo: (localRows ?? []).length,
      matched: matched.length,
      unmatchedCount: unmatched.length,
      ambiguousCount: ambiguous.length,
    };

    await adminClient.rpc("registrar_log", {
      p_user_id: caller.id,
      p_acao: "Bootstrap vinculo ERPNext",
      p_tabela: "equipamentos",
      p_registro_id: null,
      p_valor_anterior: null,
      p_valor_novo: stats,
    });

    return jsonResponse({ success: true, stats, unmatched, ambiguous });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro interno no bootstrap do vinculo ERPNext." },
      { status: 500 },
    );
  }
});
