import { addDays, addMonths, subDays } from "date-fns";
import type {
  AppUser,
  AuditLog,
  Calibracao,
  CrmCard,
  CrmInteraction,
  EmailLog,
  EquipamentoDocumento,
  EquipamentoVisao,
  ReviewRequest,
} from "@/types";
import { getDiasParaVencer, getEquipamentoStatus } from "@/lib/statusUtils";

const now = new Date().toISOString();

export const mockUsers: AppUser[] = [
  {
    id: "u-admin",
    full_name: "Ana Paula",
    email: "admin@eranalitica.com",
    phone: "(11) 99999-1000",
    district: "Campinas",
    role: "admin",
    lider_id: null,
    active: true,
    created_at: now,
  },
  {
    id: "u-gestor",
    full_name: "Carlos Gestor",
    email: "gestor@veolia.com",
    phone: "(11) 99999-2000",
    district: "Campinas",
    role: "gestor",
    lider_id: null,
    active: true,
    created_at: now,
  },
  {
    id: "u-lider",
    full_name: "Daniel Lider",
    email: "lider@veolia.com",
    phone: "(11) 99999-3000",
    district: "Campinas",
    role: "lider",
    lider_id: null,
    active: true,
    created_at: now,
  },
  {
    id: "u-owner",
    full_name: "Bianca Owner",
    email: "owner@veolia.com",
    phone: "(11) 99999-4000",
    district: "Campinas",
    role: "usuario",
    lider_id: "u-lider",
    active: true,
    created_at: now,
  },
];

export const mockCalibracoes: Calibracao[] = [
  {
    id: "c-1",
    equipamento_id: "eq-1",
    data_calibracao: addDays(new Date(), 30).toISOString(),
    realizado: false,
    created_at: now,
  },
  {
    id: "c-2",
    equipamento_id: "eq-2",
    data_calibracao: subDays(new Date(), 15).toISOString(),
    realizado: true,
    created_at: now,
  },
];

const baseEquipamentos = [
  {
    id: "eq-1",
    serial_number: "COND-001",
    equipamento: "Condutivimetro",
    brand: "Hach",
    model: "HQ40D",
    owner_id: "u-owner",
    ultima_calibracao: subDays(new Date(), 320).toISOString(),
    proxima_calibracao: addDays(new Date(), 20).toISOString(),
    certificado: "CER-001",
    erpnext_equipment_id: null,
    erpnext_anexo_certificado: null,
    district: "Heavy Industry - Zeus",
    region_state: "SP",
    city: "Maua-SP",
    customer: "Braskem",
    vendor: "ER ANALITICA",
    observacao: "Aguardando janela para retirada.",
    status_contato_importado: "Aguardando retorno",
    executado_importado: "0",
    active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "eq-2",
    serial_number: "PH-014",
    equipamento: "pHmetro",
    brand: "Mettler",
    model: "SevenCompact",
    owner_id: "u-owner",
    ultima_calibracao: subDays(new Date(), 40).toISOString(),
    proxima_calibracao: addMonths(new Date(), 3).toISOString(),
    certificado: "CER-002",
    erpnext_equipment_id: null,
    erpnext_anexo_certificado: null,
    district: "Campinas",
    region_state: "SP",
    city: "Campinas-SP",
    customer: "Veolia Lab",
    vendor: "ER ANALITICA",
    observacao: null,
    status_contato_importado: "Realizado",
    executado_importado: "1",
    active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "eq-3",
    serial_number: "TURB-332",
    equipamento: "Turbidimetro",
    brand: "Hanna",
    model: "HI88703",
    owner_id: "u-lider",
    ultima_calibracao: subDays(new Date(), 430).toISOString(),
    proxima_calibracao: subDays(new Date(), 5).toISOString(),
    certificado: "CER-003",
    erpnext_equipment_id: null,
    erpnext_anexo_certificado: null,
    district: "Araraquara",
    region_state: "SP",
    city: "Araraquara-SP",
    customer: "Unidade Araraquara",
    vendor: "ER ANALITICA",
    observacao: "Equipamento descontinuado.",
    status_contato_importado: "Sem contato",
    executado_importado: "0",
    active: false,
    created_at: now,
    updated_at: now,
  },
];

export const mockEquipamentos: EquipamentoVisao[] = baseEquipamentos.map((item) => {
  const owner = mockUsers.find((user) => user.id === item.owner_id) ?? mockUsers[0];
  const lider = mockUsers.find((user) => user.id === owner.lider_id) ?? null;
  const calibracoes = mockCalibracoes.filter((calibracao) => calibracao.equipamento_id === item.id);
  return {
    ...item,
    owner_name: owner.full_name,
    owner_email: owner.email,
    owner_phone: owner.phone,
    owner_district: owner.district,
    lider_name: lider?.full_name ?? null,
    lider_email: lider?.email ?? null,
    dias_para_vencer: getDiasParaVencer(item.proxima_calibracao),
    status_calibracao: getEquipamentoStatus(item.proxima_calibracao, calibracoes),
    status_contato: item.status_contato_importado ?? (owner.id === "u-owner" ? "Aguardando retorno" : "Sem contato"),
    executado: item.executado_importado ?? String(calibracoes.filter((calibracao) => calibracao.realizado).length),
  };
});

export const mockCrmCards: CrmCard[] = [
  {
    id: "card-1",
    owner_id: "u-owner",
    coluna: "aguardando_retorno",
    notas: "Aguardando retorno do owner para agendar visita.",
    last_contact_at: subDays(new Date(), 2).toISOString(),
    created_at: now,
    updated_at: now,
  },
];

export const mockCrmInteractions: CrmInteraction[] = [
  {
    id: "ci-1",
    card_id: "card-1",
    owner_id: "u-owner",
    tipo: "email",
    descricao: "Disparo automatico de aviso 60 dias.",
    meta: { tipo: "aviso_60" },
    created_at: subDays(new Date(), 2).toISOString(),
    created_by: "system",
  },
];

export const mockEmailLogs: EmailLog[] = [
  {
    id: "el-1",
    owner_id: "u-owner",
    equipamento_id: "eq-1",
    tipo: "aviso_60",
    enviado_para: ["owner@veolia.com"],
    enviado_em: subDays(new Date(), 2).toISOString(),
    status: "enviado",
  },
];

export const mockEquipamentoDocumentos: EquipamentoDocumento[] = [
  {
    id: "doc-1",
    equipamento_id: "eq-2",
    nome_arquivo: "comprovacao-revisao-dr900.pdf",
    caminho_storage: "eq-2/comprovacao-revisao-dr900.pdf",
    tipo_mime: "application/pdf",
    tamanho_bytes: 245760,
    uploaded_by: "u-admin",
    created_at: now,
  },
];

export const mockLogs: AuditLog[] = [
  {
    id: "log-1",
    user_id: "u-admin",
    acao: "Criou equipamento",
    tabela: "equipamentos",
    registro_id: "eq-1",
    valor_anterior: null,
    valor_novo: { serial_number: "COND-001" },
    created_at: now,
  },
];

export const mockReviewRequests: ReviewRequest[] = [
  {
    id: "rr-1",
    equipamento_id: "eq-1",
    requested_by: "u-gestor",
    status: "aberto",
    observacao: "Verificar possibilidade de antecipacao da visita.",
    created_at: now,
    updated_at: now,
  },
];
