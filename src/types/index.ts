export type UserRole = "admin" | "gestor" | "lider" | "usuario";

export type CrmColuna =
  | "sem_contato"
  | "aguardando_retorno"
  | "em_contato"
  | "agendado"
  | "calibrado"
  | "perdido";

export type EquipamentoStatus =
  | "agendado"
  | "vencido"
  | "critico"
  | "alerta_60"
  | "calibrado";

export type EmailLogStatus = "enviado" | "falha" | "ignorado_sem_destinatario";

export type ReviewRequestStatus = "aberto" | "em_analise" | "concluido";

export interface AppUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  district: string | null;
  role: UserRole;
  lider_id: string | null;
  active: boolean;
  created_at: string;
}

export interface Calibracao {
  id: string;
  equipamento_id: string;
  data_calibracao: string;
  realizado: boolean;
  created_at: string;
}

export interface ErpnextOrdemServico {
  id: string;
  equipamento_id: string;
  erpnext_equipment_id: string;
  os_name: string;
  doctype: string;
  data_cal: string | null;
  data_cal_recomendada: string | null;
  anexo_certificado: string | null;
  synced_at: string;
}

export interface EquipamentoDocumento {
  id: string;
  equipamento_id: string;
  nome_arquivo: string;
  caminho_storage: string;
  tipo_mime: string;
  tamanho_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface Equipamento {
  id: string;
  serial_number: string;
  equipamento: string;
  brand: string | null;
  model: string | null;
  owner_id: string;
  ultima_calibracao: string | null;
  proxima_calibracao: string | null;
  certificado: string | null;
  erpnext_equipment_id: string | null;
  erpnext_anexo_certificado: string | null;
  district: string | null;
  region_state: string | null;
  city: string | null;
  customer: string | null;
  vendor: string | null;
  observacao: string | null;
  status_contato_importado?: string | null;
  executado_importado?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EquipamentoVisao extends Equipamento {
  owner_name: string;
  owner_email: string;
  owner_phone: string | null;
  owner_district: string | null;
  lider_name: string | null;
  lider_email: string | null;
  dias_para_vencer: number | null;
  status_calibracao: EquipamentoStatus;
  status_contato: string;
  executado: string;
}

export interface CrmCard {
  id: string;
  owner_id: string;
  coluna: CrmColuna;
  notas: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmInteraction {
  id: string;
  card_id: string;
  owner_id: string;
  tipo: "nota" | "email" | "movimentacao" | "contato_manual";
  descricao: string;
  meta: Record<string, string | number | boolean | null>;
  created_at: string;
  created_by: string | null;
}

export interface CrmInteractionAttachment {
  id: string;
  interaction_id: string;
  card_id: string;
  owner_id: string;
  nome_arquivo: string;
  caminho_storage: string;
  tipo_mime: string;
  tamanho_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface EmailLog {
  id: string;
  owner_id: string;
  equipamento_id: string | null;
  tipo: "aviso_60" | "aviso_45" | "escalonamento_gestor" | "semanal_lider";
  enviado_para: string[];
  enviado_em: string;
  status: EmailLogStatus;
  provider_email_id?: string | null;
  last_event?: string | null;
  opened_at?: string | null;
  open_count?: number | null;
  meta?: Record<string, string | number | boolean | null> | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name?: string | null;
  acao: string;
  tabela: string | null;
  registro_id: string | null;
  valor_anterior: Record<string, unknown> | null;
  valor_novo: Record<string, unknown> | null;
  created_at: string;
}

export interface ReviewRequest {
  id: string;
  equipamento_id: string;
  requested_by: string;
  status: ReviewRequestStatus;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardFiltro {
  district: string;
}

export interface Permissoes {
  canManageUsers: boolean;
  canManageEquipamentos: boolean;
  canViewDashboard: boolean;
  canViewEmails: boolean;
  canViewCrm: boolean;
  canMoveCrmCards: boolean;
  canViewLogs: boolean;
  canViewRelatorios: boolean;
  canRequestReview: boolean;
}

export interface EquipamentosFilters {
  search: string;
  status: "todos" | EquipamentoStatus;
  ownerId: string;
}

export interface RelatorioFiltro {
  dataInicio?: string;
  dataFim?: string;
  district?: string;
  ownerId?: string;
  status?: "todos" | EquipamentoStatus;
  tipoEmail?: EmailLog["tipo"] | "todos";
}

export interface DashboardMetrics {
  calibracoesRealizadas: number;
  equipamentosCalibrados: number;
  equipamentosAtivos: number;
  equipamentosVencidos: number;
  previstoPorMes: Array<{ mes: string; previsto: number; executado: number }>;
  statusEquipamentos: Array<{ nome: string; valor: number }>;
  crmResumo: Array<{ coluna: CrmColuna; label: string; valor: number }>;
  distritos: Array<{
    district: string;
    calibrado: number;
    critico: number;
    vencido: number;
    agendado: number;
    total: number;
  }>;
  pendingReviews: number;
}
