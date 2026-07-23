import { useRef, useState } from "react";
import { Download, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { Calibracao, EquipamentoDocumento, EquipamentoVisao, ErpnextOrdemServico } from "@/types";

interface ModalHistoricoCalibracoesProps {
  open: boolean;
  equipamento?: EquipamentoVisao | null;
  historico: Calibracao[];
  ordensErpnext: ErpnextOrdemServico[];
  documentos: EquipamentoDocumento[];
  canManageDocuments: boolean;
  onUploadDocument: (file: File) => Promise<void>;
  onDeleteDocument: (documento: EquipamentoDocumento) => Promise<void>;
  onOpenDocument: (documento: EquipamentoDocumento) => Promise<void>;
  onOpenCertificadoErpnext: (osName: string) => Promise<void>;
  onClose: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ModalHistoricoCalibracoes({
  open,
  equipamento,
  historico,
  ordensErpnext,
  documentos,
  canManageDocuments,
  onUploadDocument,
  onDeleteDocument,
  onOpenDocument,
  onOpenCertificadoErpnext,
  onClose,
}: ModalHistoricoCalibracoesProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [carregandoOs, setCarregandoOs] = useState<string | null>(null);

  async function handleAbrirCertificado(osName: string) {
    setCarregandoOs(osName);
    try {
      await onOpenCertificadoErpnext(osName);
    } finally {
      setCarregandoOs(null);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Certificate e revisoes${equipamento ? ` - ${equipamento.serial_number}` : ""}`}
      description="Central de certificados, comprovacoes em PDF e historico de calibracoes vinculados ao equipamento."
      widthClassName="max-w-5xl"
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-[linear-gradient(170deg,rgba(0,45,98,0.05),rgba(255,255,255,0.96))]">
          <CardTitle className="mb-4">Historico de calibracoes (ERPNext)</CardTitle>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Data de calibracao</TH>
                  <TH>Proxima</TH>
                  <TH>OS</TH>
                  <TH>Certificado</TH>
                </tr>
              </THead>
              <TBody>
                {ordensErpnext.length === 0 ? (
                  <tr>
                    <TD colSpan={4} className="py-8 text-center text-textSecondary">
                      Nenhuma ordem de servico sincronizada do ERPNext para este equipamento.
                    </TD>
                  </tr>
                ) : null}
                {ordensErpnext.map((ordem) => (
                  <tr key={ordem.id} className="transition-colors hover:bg-appBg/50">
                    <TD>{formatDate(ordem.data_cal)}</TD>
                    <TD>{formatDate(ordem.data_cal_recomendada)}</TD>
                    <TD className="whitespace-nowrap font-medium">{ordem.os_name}</TD>
                    <TD>
                      {ordem.anexo_certificado ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 gap-1.5 px-3 text-[11px]"
                          disabled={carregandoOs === ordem.os_name}
                          onClick={() => void handleAbrirCertificado(ordem.os_name)}
                        >
                          <Download className="h-4 w-4" />
                          {carregandoOs === ordem.os_name ? "Abrindo..." : "Ver certificado"}
                        </Button>
                      ) : (
                        <span className="text-xs text-textSecondary">Sem anexo</span>
                      )}
                    </TD>
                  </tr>
                ))}
              </TBody>
            </Table>
          </div>

          {historico.length > 0 ? (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-textSecondary">
                Registros anteriores (planilha)
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <tr>
                      <TH>Data de calibracao</TH>
                      <TH>Status</TH>
                      <TH>Criado em</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {historico.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-appBg/50">
                        <TD>{formatDate(item.data_calibracao)}</TD>
                        <TD>{item.realizado ? "Realizado" : "Agendado"}</TD>
                        <TD>{formatDate(item.created_at)}</TD>
                      </tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="bg-[linear-gradient(170deg,rgba(5,195,221,0.06),rgba(255,255,255,0.98))]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <CardTitle>Certificados e PDFs de revisao</CardTitle>
            {canManageDocuments ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) {
                      return;
                    }
                    await onUploadDocument(file);
                  }}
                />
                <Button type="button" className="h-9 gap-2 px-3 text-xs" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Anexar PDF
                </Button>
              </>
            ) : null}
          </div>

          <div className="space-y-3">
            {documentos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-marine/14 bg-white/70 px-4 py-8 text-center text-sm text-textSecondary">
                Nenhum PDF anexado para este equipamento.
              </div>
            ) : null}

            {documentos.map((documento) => (
              <div key={documento.id} className="rounded-2xl border border-marine/10 bg-white/85 px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-marine/8 text-marine">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-textPrimary">{documento.nome_arquivo}</p>
                        <p className="text-xs text-textSecondary">{`${formatBytes(documento.tamanho_bytes)} | ${formatDate(documento.created_at)}`}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 gap-1.5 px-3 text-[11px]"
                      onClick={() => void onOpenDocument(documento)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir
                    </Button>
                    {canManageDocuments ? (
                      <Button
                        type="button"
                        variant="danger"
                        className="h-8 gap-1.5 px-3 text-[11px]"
                        onClick={() => void onDeleteDocument(documento)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Dialog>
  );
}
