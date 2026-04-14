import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ModalHistoricoCalibracoes } from "@/components/equipamentos/ModalHistoricoCalibracoes";
import { ModalEquipamento } from "@/components/equipamentos/ModalEquipamento";
import { TabelaEquipamentos } from "@/components/equipamentos/TabelaEquipamentos";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useEquipamentos } from "@/hooks/useEquipamentos";
import type { Calibracao, EquipamentoDocumento, EquipamentoVisao } from "@/types";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function Equipamentos() {
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  const {
    equipamentos,
    owners,
    filters,
    isLoading,
    setFilters,
    saveEquipamento,
    deactivateEquipamento,
    requestReview,
    getHistoricoCalibracoes,
    getDocumentosEquipamento,
    uploadDocumentoEquipamento,
    deleteDocumentoEquipamento,
    openDocumentoEquipamento,
    uploadEquipamentosSheet,
    downloadModeloPlanilha,
    resetEquipamentos,
  } = useEquipamentos();
  const [selected, setSelected] = useState<EquipamentoVisao | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEquipamento, setHistoryEquipamento] = useState<EquipamentoVisao | null>(null);
  const [historyItems, setHistoryItems] = useState<Calibracao[]>([]);
  const [historyDocuments, setHistoryDocuments] = useState<EquipamentoDocumento[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const spreadsheetInputRef = useRef<HTMLInputElement | null>(null);

  const availableOwners = useMemo(() => {
    if (role === "lider" && profile) {
      return owners.filter((owner) => owner.lider_id === profile.id || owner.id === profile.id);
    }

    return owners;
  }, [owners, profile, role]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.ownerId, filters.search, filters.status, pageSize]);

  const totalItems = equipamentos.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedEquipamentos = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return equipamentos.slice(startIndex, startIndex + pageSize);
  }, [currentPage, equipamentos, pageSize]);

  function openCreate() {
    setSelected(null);
    setModalOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-borderSoft pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.03em] text-textPrimary">Equipamentos</h1>
          <p className="mt-0.5 text-sm text-textSecondary">Busca, filtros por status e acoes conforme o perfil.</p>
        </div>
        {role === "admin" ? <Button onClick={openCreate}>Cadastrar</Button> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Input
          placeholder="Buscar por serial ou owner"
          value={filters.search}
          autoComplete="off"
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
        />
        <Select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              status: event.target.value as typeof current.status,
            }))
          }
        >
          <option value="todos">Todos os status</option>
          <option value="vencido">Vencido</option>
          <option value="critico">Critico</option>
          <option value="alerta_60">Alerta 60</option>
          <option value="calibrado">Calibrado</option>
          <option value="agendado">Agendado</option>
        </Select>
        <Select
          value={filters.ownerId}
          onChange={(event) => setFilters((current) => ({ ...current, ownerId: event.target.value }))}
        >
          <option value="todos">Todos os owners</option>
          {availableOwners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.full_name}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? <p className="text-sm text-textSecondary">Carregando equipamentos...</p> : null}

      <TabelaEquipamentos
        items={paginatedEquipamentos}
        role={role}
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={(page) => setCurrentPage(Math.min(Math.max(page, 1), totalPages))}
        onPageSizeChange={(size) => setPageSize(PAGE_SIZE_OPTIONS.includes(size) ? size : 25)}
        onEdit={(item) => {
          setSelected(item);
          setModalOpen(true);
        }}
      onViewHistory={async (item) => {
          try {
            const [historico, documentos] = await Promise.all([
              getHistoricoCalibracoes(item.id),
              getDocumentosEquipamento(item.id),
            ]);
            setHistoryEquipamento(item);
            setHistoryItems(historico);
            setHistoryDocuments(documentos);
            setHistoryOpen(true);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao carregar historico de calibracoes.");
          }
        }}
        onManageDocuments={async (item) => {
          try {
            const [historico, documentos] = await Promise.all([
              getHistoricoCalibracoes(item.id),
              getDocumentosEquipamento(item.id),
            ]);
            setHistoryEquipamento(item);
            setHistoryItems(historico);
            setHistoryDocuments(documentos);
            setHistoryOpen(true);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao carregar documentos do equipamento.");
          }
        }}
        onDeactivate={async (item) => {
          try {
            await deactivateEquipamento(item);
            toast.success(`Equipamento ${item.serial_number} marcado para descontinuacao.`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao descontinuar equipamento.");
          }
        }}
        onRequestReview={async (item) => {
          try {
            await requestReview(item);
            toast.success(`Solicitacao de revisao aberta para ${item.serial_number}.`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao solicitar revisao.");
          }
        }}
        onOpenOwner={(item) => {
          navigate(`/usuarios?edit=${item.owner_id}`);
        }}
        onUploadSpreadsheet={() => spreadsheetInputRef.current?.click()}
        onDownloadTemplate={async () => {
          try {
            await downloadModeloPlanilha();
            toast.success("Modelo de planilha baixado.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao gerar modelo da planilha.");
          }
        }}
        onReset={() => {
          setResetPassword("");
          setResetOpen(true);
        }}
      />
      <input
        ref={spreadsheetInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";

          if (!file) {
            return;
          }

          try {
            const result = await uploadEquipamentosSheet(file);
            const message =
              typeof result === "object" && result && "message" in result
                ? String(result.message)
                : "Planilha importada com sucesso.";
            toast.success(message);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao importar planilha.");
          }
        }}
      />
      {role === "admin" ? (
        <ModalEquipamento
          open={modalOpen}
          item={selected}
          owners={owners}
          onClose={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              await saveEquipamento(values, selected);
              toast.success(selected ? "Equipamento atualizado." : "Equipamento cadastrado.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Falha ao salvar equipamento.");
              throw error;
            }
          }}
        />
      ) : null}
      <ModalHistoricoCalibracoes
        open={historyOpen}
        equipamento={historyEquipamento}
        historico={historyItems}
        documentos={historyDocuments}
        canManageDocuments={role === "admin"}
        onUploadDocument={async (file) => {
          if (!historyEquipamento) {
            return;
          }

          try {
            await uploadDocumentoEquipamento(historyEquipamento, file);
            const documentos = await getDocumentosEquipamento(historyEquipamento.id);
            setHistoryDocuments(documentos);
            toast.success("PDF anexado ao equipamento.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao anexar PDF.");
          }
        }}
        onDeleteDocument={async (documento) => {
          try {
            await deleteDocumentoEquipamento(documento);
            if (historyEquipamento) {
              const documentos = await getDocumentosEquipamento(historyEquipamento.id);
              setHistoryDocuments(documentos);
            }
            toast.success("PDF removido do equipamento.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao excluir PDF.");
          }
        }}
        onOpenDocument={async (documento) => {
          try {
            const url = await openDocumentoEquipamento(documento);
            window.open(url, "_blank", "noopener,noreferrer");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao abrir PDF.");
          }
        }}
        onClose={() => setHistoryOpen(false)}
      />
      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Resetar equipamentos"
        description="Essa acao remove todos os equipamentos e dependencias diretas. Informe a senha exclusiva de reset para confirmar."
        widthClassName="max-w-lg"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-textSecondary">Senha de reset</label>
            <Input
              type="password"
              value={resetPassword}
              autoComplete="new-password"
              onChange={(event) => setResetPassword(event.target.value)}
              placeholder="Digite a senha de reset"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  const result = await resetEquipamentos(resetPassword);
                  const message =
                    typeof result === "object" && result && "message" in result
                      ? String(result.message)
                      : "Equipamentos resetados com sucesso.";
                  toast.success(message);
                  setResetOpen(false);
                  setResetPassword("");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Falha ao resetar equipamentos.");
                }
              }}
            >
              Confirmar reset
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
