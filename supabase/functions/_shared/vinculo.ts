import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { chunkArray, fetchErpnextResource, normalizeSerial } from "./erpnext.ts";

// Auto-vinculo pelo CADASTRO de Equipamentos do ERP (doctype "Equipamentos"): casa a serie do
// equipamento (numero_serie) com o codigo do registro (name = EQUIPC-XXXXX ou codigo antigo).
// So vincula quando a serie casa com UM UNICO registro; series duplicadas ou nao encontradas
// vao para revisao (erpnext_vinculo_revisao). Nunca sobrescreve vinculo existente, nunca liga
// dois equipamentos ao mesmo codigo. Compartilhado pela funcao manual e pela sincronizacao
// periodica (auto-recuperacao apos reset/reimport).

interface EquipLocal {
  id: string;
  serial_number: string;
  customer: string | null;
  certificado: string | null;
}

interface EquipErp {
  name: string;
  numero_serie: string | null;
}

export interface ResultadoVinculo {
  vinculados: { id: string; serial_number: string; equipamento_id_erp: string }[];
  revisao: number;
}

export async function autoVincularEquipamentos(
  admin: SupabaseClient,
  opts: { equipamentoId?: string } = {},
): Promise<ResultadoVinculo> {
  // 1. Equipamentos sem vinculo (ou apenas um, no modo teste).
  let query = admin
    .from("equipamentos")
    .select("id, serial_number, customer, certificado")
    .is("erpnext_equipment_id", null);
  if (opts.equipamentoId) {
    query = query.eq("id", opts.equipamentoId);
  }
  const { data: equipamentos, error: equipError } = await query.returns<EquipLocal[]>();
  if (equipError) {
    throw new Error(`Falha ao carregar equipamentos sem vinculo: ${equipError.message}`);
  }
  if (!equipamentos || equipamentos.length === 0) {
    return { vinculados: [], revisao: 0 };
  }

  // 2. Codigos do ERP ja usados por outros equipamentos (para nao duplicar vinculo).
  const { data: usados } = await admin
    .from("equipamentos")
    .select("erpnext_equipment_id")
    .not("erpnext_equipment_id", "is", null)
    .returns<{ erpnext_equipment_id: string }[]>();
  const idsUsados = new Set((usados ?? []).map((u) => u.erpnext_equipment_id));

  // 3. Busca o cadastro de Equipamentos do ERP pelas series dos nossos equipamentos e mapeia,
  //    por serie normalizada, o conjunto de codigos (name).
  const serials = [...new Set(equipamentos.map((e) => e.serial_number).filter(Boolean))];
  const serieParaCodigos = new Map<string, Set<string>>();
  for (const bloco of chunkArray(serials, 50)) {
    const linhas = await fetchErpnextResource<EquipErp>("Equipamentos", {
      filters: [["numero_serie", "in", bloco]],
      fields: ["name", "numero_serie"],
    });
    for (const linha of linhas) {
      const chave = normalizeSerial(linha.numero_serie);
      if (!chave) continue;
      if (!serieParaCodigos.has(chave)) serieParaCodigos.set(chave, new Set());
      serieParaCodigos.get(chave)!.add(linha.name);
    }
  }

  // 4. Decide caso a caso.
  const paraVincular: { equipamento_id: string; erpnext_equipment_id: string }[] = [];
  const vinculados: ResultadoVinculo["vinculados"] = [];
  const revisao: {
    equipamento_id: string;
    serial_number: string;
    customer: string | null;
    certificado: string | null;
    os_consultada: string | null;
    serie_number_erp: string | null;
    equipamento_id_erp: string | null;
    motivo: string;
  }[] = [];
  const idsAtribuidosAgora = new Set<string>();

  for (const e of equipamentos) {
    const base = {
      equipamento_id: e.id,
      serial_number: e.serial_number,
      customer: e.customer,
      certificado: e.certificado,
      os_consultada: null as string | null,
      serie_number_erp: e.serial_number,
    };

    const codigos = [...(serieParaCodigos.get(normalizeSerial(e.serial_number)) ?? new Set<string>())];

    if (codigos.length === 0) {
      revisao.push({ ...base, equipamento_id_erp: null, motivo: "Serie nao encontrada no cadastro de Equipamentos do ERP" });
      continue;
    }
    if (codigos.length > 1) {
      revisao.push({ ...base, equipamento_id_erp: codigos.join(", "), motivo: `Serie duplicada no cadastro do ERP: ${codigos.join(", ")}` });
      continue;
    }

    const idErp = codigos[0];
    if (idsUsados.has(idErp) || idsAtribuidosAgora.has(idErp)) {
      revisao.push({ ...base, equipamento_id_erp: idErp, motivo: `Codigo ${idErp} ja vinculado a outro equipamento` });
      continue;
    }

    idsAtribuidosAgora.add(idErp);
    paraVincular.push({ equipamento_id: e.id, erpnext_equipment_id: idErp });
    vinculados.push({ id: e.id, serial_number: e.serial_number, equipamento_id_erp: idErp });
  }

  // 5. Grava os vinculos em lote (uma operacao).
  if (paraVincular.length > 0) {
    for (const bloco of chunkArray(paraVincular, 500)) {
      const { error: applyError } = await admin.rpc("aplicar_vinculos_erpnext", { p_vinculos: bloco });
      if (applyError) {
        throw new Error(`Falha ao gravar vinculos: ${applyError.message}`);
      }
    }
  }

  // 6. Reescreve a lista de revisao (delete + insert), sem apagar antes de ter o resultado novo.
  const del = admin.from("erpnext_vinculo_revisao").delete();
  const { error: delError } = await (opts.equipamentoId
    ? del.eq("equipamento_id", opts.equipamentoId)
    : del.not("id", "is", null));
  if (delError) {
    throw new Error(`Falha ao limpar revisao anterior: ${delError.message}`);
  }
  if (revisao.length > 0) {
    for (const bloco of chunkArray(revisao, 200)) {
      await admin.from("erpnext_vinculo_revisao").insert(bloco);
    }
  }

  return { vinculados, revisao: revisao.length };
}
