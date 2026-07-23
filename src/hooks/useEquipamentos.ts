import { useEffect, useMemo, useState } from "react";
import type { EquipamentoFormValues } from "@/components/equipamentos/ModalEquipamento";
import { useAuth } from "@/hooks/useAuth";
import { mockCalibracoes, mockEquipamentoDocumentos, mockEquipamentos, mockUsers } from "@/lib/mockData";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getDiasParaVencer, getEquipamentoStatus } from "@/lib/statusUtils";
import { invokeEdgeFunction } from "@/services/emailService";
import { registerLog } from "@/services/logService";
import type {
  AppUser,
  Calibracao,
  EquipamentoDocumento,
  EquipamentoVisao,
  EquipamentosFilters,
  ErpnextOrdemServico,
} from "@/types";

const defaultFilters: EquipamentosFilters = {
  search: "",
  status: "todos",
  ownerId: "todos",
};

type EquipamentoViewRow = EquipamentoVisao;
type SpreadsheetImportRow = Record<string, string>;

const spreadsheetTemplateRow = {
  "Status Do equipamento": "Ativo",
  "Serial Number": "",
  Equipamento: "",
  Brand: "",
  Model: "",
  "Ultima Calibracao": "",
  "Proxima calibracao": "",
  Certificate: "",
  Owner: "",
  "e-mail": "",
  "Cel #": "",
  Leader: "",
  "email (leader)": "",
  District: "",
  "Region/State": "",
  City: "",
  Customer: "",
  Vendor: "ER ANALITICA",
  "Obs.": "",
  "STATUS Contato": "",
  Executado: "",
};

function toNullableDate(value: string | undefined) {
  return value ? value : null;
}

function toNullableText(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

async function parseSpreadsheetFile(file: File): Promise<SpreadsheetImportRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  if (!worksheet) {
    throw new Error("A planilha nao possui abas validas.");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

  return rows.map((row) =>
    Object.entries(row).reduce<SpreadsheetImportRow>((acc, [key, value]) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const day = String(value.getDate()).padStart(2, "0");
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const year = String(value.getFullYear());
        acc[key] = `${day}/${month}/${year}`;
        return acc;
      }

      acc[key] = value === null || value === undefined ? "" : String(value).trim();
      return acc;
    }, {}),
  );
}

function buildLocalEquipamento(
  values: EquipamentoFormValues,
  owners: AppUser[],
  current?: EquipamentoVisao | null,
): EquipamentoVisao {
  const owner = owners.find((entry) => entry.id === values.owner_id) ?? owners[0];
  const lider = owners.find((entry) => entry.id === owner?.lider_id) ?? null;
  const proximaCalibracao = toNullableDate(values.proxima_calibracao);

  return {
    id: current?.id ?? crypto.randomUUID(),
    serial_number: values.serial_number,
    equipamento: values.equipamento,
    brand: values.brand || null,
    model: values.model || null,
    owner_id: values.owner_id,
    ultima_calibracao: toNullableDate(values.ultima_calibracao),
    proxima_calibracao: proximaCalibracao,
    certificado: values.certificado || null,
    erpnext_equipment_id: current?.erpnext_equipment_id ?? null,
    erpnext_anexo_certificado: current?.erpnext_anexo_certificado ?? null,
    district: toNullableText(values.district) ?? owner?.district ?? null,
    region_state: toNullableText(values.region_state),
    city: toNullableText(values.city),
    customer: toNullableText(values.customer),
    vendor: toNullableText(values.vendor),
    observacao: toNullableText(values.observacao),
    status_contato_importado: current?.status_contato_importado ?? null,
    executado_importado: current?.executado_importado ?? null,
    active: values.active === "true",
    created_at: current?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    owner_name: owner?.full_name ?? "Owner nao encontrado",
    owner_email: owner?.email ?? "",
    owner_phone: owner?.phone ?? null,
    owner_district: owner?.district ?? null,
    lider_name: lider?.full_name ?? null,
    lider_email: lider?.email ?? null,
    dias_para_vencer: getDiasParaVencer(proximaCalibracao),
    status_calibracao: getEquipamentoStatus(proximaCalibracao),
    status_contato: current?.status_contato ?? "Sem contato",
    executado: current?.executado ?? "0",
  };
}

export function useEquipamentos() {
  const { role, profile } = useAuth();
  const [items, setItems] = useState<EquipamentoVisao[]>(
    isSupabaseConfigured ? [] : mockEquipamentos,
  );
  const [owners, setOwners] = useState<AppUser[]>(
    isSupabaseConfigured ? [] : mockUsers.filter((user) => user.role === "usuario" || user.role === "lider"),
  );
  const [documentos, setDocumentos] = useState<EquipamentoDocumento[]>(
    isSupabaseConfigured ? [] : mockEquipamentoDocumentos,
  );
  const [filters, setFilters] = useState<EquipamentosFilters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);

  async function loadData() {
    setIsLoading(true);

    if (!isSupabaseConfigured || !supabase) {
      setItems(mockEquipamentos);
      setOwners(mockUsers.filter((user) => user.role === "usuario" || user.role === "lider"));
      setDocumentos(mockEquipamentoDocumentos);
      setIsLoading(false);
      return;
    }

    const [{ data: equipamentos, error: equipamentosError }, { data: users, error: usersError }, { data: documentosData, error: documentosError }] = await Promise.all([
      supabase.from("equipamentos_visao").select("*").order("created_at", { ascending: false }),
      supabase.from("users").select("*").eq("active", true),
      supabase.from("equipamento_documentos").select("*").order("created_at", { ascending: false }),
    ]);

    if (equipamentosError) {
      setIsLoading(false);
      throw equipamentosError;
    }

    if (usersError) {
      setIsLoading(false);
      throw usersError;
    }

    if (documentosError) {
      setIsLoading(false);
      throw documentosError;
    }

    const loadedUsers = (users as AppUser[] | null) ?? [];
    setOwners(loadedUsers.filter((user) => user.role === "usuario" || user.role === "lider"));
    setItems((equipamentos as EquipamentoViewRow[] | null) ?? []);
    setDocumentos((documentosData as EquipamentoDocumento[] | null) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadData().catch(() => {
      setIsLoading(false);
    });
  }, []);

  const ownersById = useMemo(() => new Map(owners.map((owner) => [owner.id, owner])), [owners]);
  const documentosByEquipamentoId = useMemo(() => {
    const map = new Map<string, EquipamentoDocumento[]>();
    for (const documento of documentos) {
      const current = map.get(documento.equipamento_id) ?? [];
      current.push(documento);
      map.set(documento.equipamento_id, current);
    }
    return map;
  }, [documentos]);

  const visibleItems = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return items
      .filter((item) => {
        if (!item.active && role !== "admin") {
          return false;
        }

        if (role === "lider" && profile) {
          const owner = ownersById.get(item.owner_id);
          return item.owner_id === profile.id || owner?.lider_id === profile.id;
        }

        if (role === "usuario" && profile) {
          return item.owner_id === profile.id;
        }

        return true;
      })
      .filter((item) => {
        if (!query) {
          return true;
        }

        return item.serial_number.toLowerCase().includes(query) || item.owner_name.toLowerCase().includes(query);
      })
      .filter((item) => (filters.status === "todos" ? true : item.status_calibracao === filters.status))
      .filter((item) => (filters.ownerId === "todos" ? true : item.owner_id === filters.ownerId));
  }, [filters.ownerId, filters.search, filters.status, items, ownersById, profile, role]);

  async function saveEquipamento(values: EquipamentoFormValues, current?: EquipamentoVisao | null) {
    const payload = {
      serial_number: values.serial_number,
      equipamento: values.equipamento,
      brand: values.brand || null,
      model: values.model || null,
      owner_id: values.owner_id,
      ultima_calibracao: toNullableDate(values.ultima_calibracao),
      proxima_calibracao: toNullableDate(values.proxima_calibracao),
      certificado: values.certificado || null,
      district: toNullableText(values.district),
      region_state: toNullableText(values.region_state),
      city: toNullableText(values.city),
      customer: toNullableText(values.customer),
      vendor: toNullableText(values.vendor),
      observacao: toNullableText(values.observacao),
      active: values.active === "true",
    };

    if (!isSupabaseConfigured || !supabase) {
      const nextItem = buildLocalEquipamento(values, owners, current);
      setItems((currentItems) =>
        current ? currentItems.map((item) => (item.id === current.id ? nextItem : item)) : [nextItem, ...currentItems],
      );

      await registerLog({
        userId: profile?.id,
        action: current ? "Atualizou equipamento" : "Criou equipamento",
        table: "equipamentos",
        recordId: current?.id ?? nextItem.id,
        previousValue: current ? { ...current } : null,
        nextValue: payload,
      });

      return nextItem;
    }

    if (current) {
      const { error } = await supabase.from("equipamentos").update(payload).eq("id", current.id);
      if (error) {
        throw error;
      }

      await registerLog({
        userId: profile?.id,
        action: "Atualizou equipamento",
        table: "equipamentos",
        recordId: current.id,
        previousValue: {
          serial_number: current.serial_number,
          owner_id: current.owner_id,
          active: current.active,
        },
        nextValue: payload,
      });
    } else {
      const { data, error } = await supabase.from("equipamentos").insert(payload).select("id").single();
      if (error) {
        throw error;
      }

      await registerLog({
        userId: profile?.id,
        action: "Criou equipamento",
        table: "equipamentos",
        recordId: (data as { id: string } | null)?.id ?? null,
        previousValue: null,
        nextValue: payload,
      });
    }

    await loadData();
  }

  async function deactivateEquipamento(item: EquipamentoVisao) {
    if (!isSupabaseConfigured || !supabase) {
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                active: false,
                updated_at: new Date().toISOString(),
              }
            : entry,
        ),
      );

      await registerLog({
        userId: profile?.id,
        action: "Descontinuou equipamento",
        table: "equipamentos",
        recordId: item.id,
        previousValue: { active: item.active },
        nextValue: { active: false },
      });

      return;
    }

    const { error } = await supabase.from("equipamentos").update({ active: false }).eq("id", item.id);
    if (error) {
      throw error;
    }

    await registerLog({
      userId: profile?.id,
      action: "Descontinuou equipamento",
      table: "equipamentos",
      recordId: item.id,
      previousValue: { active: item.active },
      nextValue: { active: false },
    });

    await loadData();
  }

  async function requestReview(item: EquipamentoVisao) {
    if (!profile?.id) {
      return;
    }

    const payload = {
      equipamento_id: item.id,
      requested_by: profile.id,
      status: "aberto",
      observacao: "Solicitacao aberta pelo gestor na listagem de equipamentos.",
    };

    if (!isSupabaseConfigured || !supabase) {
      await registerLog({
        userId: profile.id,
        action: "Solicitou revisao",
        table: "review_requests",
        recordId: item.id,
        previousValue: null,
        nextValue: payload,
      });
      return;
    }

    const { data, error } = await supabase.from("review_requests").insert(payload).select("id").single();
    if (error) {
      throw error;
    }

    await registerLog({
      userId: profile.id,
      action: "Solicitou revisao",
      table: "review_requests",
      recordId: (data as { id: string } | null)?.id ?? null,
      previousValue: null,
      nextValue: payload,
    });
  }

  async function getHistoricoCalibracoes(equipamentoId: string) {
    if (!isSupabaseConfigured || !supabase) {
      return mockCalibracoes
        .filter((item) => item.equipamento_id === equipamentoId)
        .sort((a, b) => new Date(b.data_calibracao).getTime() - new Date(a.data_calibracao).getTime());
    }

    const { data, error } = await supabase
      .from("calibracoes")
      .select("*")
      .eq("equipamento_id", equipamentoId)
      .order("data_calibracao", { ascending: false });

    if (error) {
      throw error;
    }

    return (data as Calibracao[] | null) ?? [];
  }

  async function getOrdensServicoErpnext(equipamentoId: string) {
    if (!isSupabaseConfigured || !supabase) {
      return [] as ErpnextOrdemServico[];
    }

    const { data, error } = await supabase
      .from("erpnext_ordens_servico")
      .select("*")
      .eq("equipamento_id", equipamentoId)
      .order("data_cal", { ascending: false });

    if (error) {
      throw error;
    }

    return (data as ErpnextOrdemServico[] | null) ?? [];
  }

  async function abrirCertificadoErpnext(equipamentoId: string, osName?: string) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase nao configurado.");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("Sessao expirada. Entre novamente.");
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erpnext-certificado`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ equipamentoId, osName }),
    });

    if (!response.ok) {
      const detalhe = await response.json().catch(() => ({}));
      throw new Error(detalhe?.error ?? "Nao foi possivel abrir o certificado.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function getDocumentosEquipamento(equipamentoId: string) {
    if (!isSupabaseConfigured || !supabase) {
      return (documentosByEquipamentoId.get(equipamentoId) ?? []).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }

    const { data, error } = await supabase
      .from("equipamento_documentos")
      .select("*")
      .eq("equipamento_id", equipamentoId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data as EquipamentoDocumento[] | null) ?? [];
  }

  async function uploadDocumentoEquipamento(equipamento: EquipamentoVisao, file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf") {
      throw new Error("Apenas arquivos PDF sao permitidos.");
    }

    if (!isSupabaseConfigured || !supabase) {
      const documento: EquipamentoDocumento = {
        id: crypto.randomUUID(),
        equipamento_id: equipamento.id,
        nome_arquivo: file.name,
        caminho_storage: `${equipamento.id}/${Date.now()}-${file.name}`,
        tipo_mime: file.type,
        tamanho_bytes: file.size,
        uploaded_by: profile?.id ?? null,
        created_at: new Date().toISOString(),
      };

      setDocumentos((current) => [documento, ...current]);

      await registerLog({
        userId: profile?.id,
        action: "Anexou PDF de revisao",
        table: "equipamento_documentos",
        recordId: documento.id,
        previousValue: null,
        nextValue: { equipamento_id: equipamento.id, nome_arquivo: file.name },
      });

      return documento;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const path = `${equipamento.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from("equipamento-pdfs").upload(path, file, {
      contentType: "application/pdf",
      upsert: false,
    });

    if (uploadError) {
      throw uploadError;
    }

    const { data, error } = await supabase
      .from("equipamento_documentos")
      .insert({
        equipamento_id: equipamento.id,
        nome_arquivo: file.name,
        caminho_storage: path,
        tipo_mime: "application/pdf",
        tamanho_bytes: file.size,
        uploaded_by: profile?.id ?? null,
      })
      .select("*")
      .single();

    if (error) {
      await supabase.storage.from("equipamento-pdfs").remove([path]);
      throw error;
    }

    await registerLog({
      userId: profile?.id,
      action: "Anexou PDF de revisao",
      table: "equipamento_documentos",
      recordId: (data as EquipamentoDocumento | null)?.id ?? null,
      previousValue: null,
      nextValue: { equipamento_id: equipamento.id, nome_arquivo: file.name },
    });

    await loadData();

    return data as EquipamentoDocumento;
  }

  async function deleteDocumentoEquipamento(documento: EquipamentoDocumento) {
    if (!isSupabaseConfigured || !supabase) {
      setDocumentos((current) => current.filter((item) => item.id !== documento.id));

      await registerLog({
        userId: profile?.id,
        action: "Excluiu PDF de revisao",
        table: "equipamento_documentos",
        recordId: documento.id,
        previousValue: { nome_arquivo: documento.nome_arquivo, equipamento_id: documento.equipamento_id },
        nextValue: null,
      });
      return;
    }

    const { error: deleteMetadataError } = await supabase
      .from("equipamento_documentos")
      .delete()
      .eq("id", documento.id);

    if (deleteMetadataError) {
      throw deleteMetadataError;
    }

    const { error: deleteFileError } = await supabase.storage.from("equipamento-pdfs").remove([documento.caminho_storage]);
    if (deleteFileError) {
      throw deleteFileError;
    }

    await registerLog({
      userId: profile?.id,
      action: "Excluiu PDF de revisao",
      table: "equipamento_documentos",
      recordId: documento.id,
      previousValue: { nome_arquivo: documento.nome_arquivo, equipamento_id: documento.equipamento_id },
      nextValue: null,
    });

    await loadData();
  }

  async function openDocumentoEquipamento(documento: EquipamentoDocumento) {
    if (!isSupabaseConfigured || !supabase) {
      return documento.caminho_storage;
    }

    const { data, error } = await supabase.storage
      .from("equipamento-pdfs")
      .createSignedUrl(documento.caminho_storage, 60);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  }

  async function uploadEquipamentosSheet(file: File) {
    const normalizedName = file.name.toLowerCase();
    const isSpreadsheet =
      normalizedName.endsWith(".xlsx") ||
      normalizedName.endsWith(".xls") ||
      normalizedName.endsWith(".csv");

    if (!isSpreadsheet) {
      throw new Error("Envie uma planilha em formato .xlsx, .xls ou .csv.");
    }

    const rows = await parseSpreadsheetFile(file);
    if (rows.length === 0) {
      throw new Error("A planilha enviada nao possui linhas validas para importar.");
    }

    if (!isSupabaseConfigured || !supabase) {
      return {
        success: true,
        message: "Upload de planilha simulado em modo local.",
        stats: {
          totalRows: rows.length,
          imported: rows.length,
          skipped: 0,
          ownersNotFound: 0,
          leadersLinked: 0,
          crmUpdated: 0,
        },
      };
    }

    const result = await invokeEdgeFunction("sync-equipamentos-sheet", { rows });
    await loadData();
    return result;
  }

  async function downloadModeloPlanilha() {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([spreadsheetTemplateRow]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Equipamentos");
    XLSX.writeFile(workbook, "modelo-planilha-equipamentos-er-analitica.xlsx");
  }

  async function resetEquipamentos(password: string) {
    if (!isSupabaseConfigured || !supabase) {
      const removed = items.length;
      setItems([]);
      return {
        success: true,
        message: `${removed} equipamento(s) removido(s) em modo local.`,
        removed,
      };
    }

    const result = await invokeEdgeFunction("reset-equipamentos", { password });
    await loadData();
    return result;
  }

  return {
    equipamentos: visibleItems,
    allEquipamentos: items,
    owners,
    filters,
    isLoading,
    setFilters,
    refresh: loadData,
    saveEquipamento,
    deactivateEquipamento,
    requestReview,
    getHistoricoCalibracoes,
    getOrdensServicoErpnext,
    abrirCertificadoErpnext,
    getDocumentosEquipamento,
    uploadDocumentoEquipamento,
    deleteDocumentoEquipamento,
    openDocumentoEquipamento,
    documentosByEquipamentoId,
    uploadEquipamentosSheet,
    downloadModeloPlanilha,
    resetEquipamentos,
  };
}
