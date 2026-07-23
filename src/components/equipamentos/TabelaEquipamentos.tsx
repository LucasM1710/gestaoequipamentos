import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Download, Pencil, ShieldAlert, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { formatCertificado, formatDate } from "@/lib/utils";
import type { EquipamentoVisao, UserRole } from "@/types";
import { BadgeStatus } from "./BadgeStatus";

interface TabelaEquipamentosProps {
  items: EquipamentoVisao[];
  role: UserRole | null;
  onEdit: (item: EquipamentoVisao) => void;
  onDeactivate: (item: EquipamentoVisao) => void;
  onViewHistory: (item: EquipamentoVisao) => void;
  onRequestReview: (item: EquipamentoVisao) => void;
  onManageDocuments: (item: EquipamentoVisao) => void;
  onOpenOwner: (item: EquipamentoVisao) => void;
  onUploadSpreadsheet: () => void;
  onDownloadTemplate: () => void;
  onReset: () => void;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function TabelaEquipamentos({
  items,
  role,
  onEdit,
  onDeactivate,
  onViewHistory,
  onRequestReview,
  onManageDocuments,
  onOpenOwner,
  onUploadSpreadsheet,
  onDownloadTemplate,
  onReset,
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: TabelaEquipamentosProps) {
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const [topScrollContentWidth, setTopScrollContentWidth] = useState(1880);

  function getContactStatusClass(status: string) {
    const normalized = status.toLowerCase();

    if (normalized.includes("realizado")) {
      return "bg-status-calibrado/18 text-status-calibrado";
    }

    if (normalized.includes("aguardando")) {
      return "bg-status-vencido/14 text-status-vencido";
    }

    if (normalized.includes("contato")) {
      return "bg-status-alerta/22 text-status-critico";
    }

    if (normalized.includes("agendado")) {
      return "bg-status-agendado/14 text-status-agendado";
    }

    return "bg-marine/8 text-marine";
  }

  function syncHorizontalScroll(source: "top" | "bottom") {
    if (syncingRef.current) {
      return;
    }

    const sourceElement = source === "top" ? topScrollRef.current : bottomScrollRef.current;
    const targetElement = source === "top" ? bottomScrollRef.current : topScrollRef.current;

    if (!sourceElement || !targetElement) {
      return;
    }

    syncingRef.current = true;
    targetElement.scrollLeft = sourceElement.scrollLeft;

    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }

  useEffect(() => {
    function updateTopScrollWidth() {
      if (!bottomScrollRef.current) {
        return;
      }

      setTopScrollContentWidth(bottomScrollRef.current.scrollWidth);
    }

    updateTopScrollWidth();
    window.addEventListener("resize", updateTopScrollWidth);

    return () => {
      window.removeEventListener("resize", updateTopScrollWidth);
    };
  }, [items.length, pageSize, totalItems]);

  return (
    <Card className="rounded-[28px] bg-[linear-gradient(180deg,rgba(0,45,98,0.04),rgba(255,255,255,0.95))] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-[16px] tracking-[-0.04em]">Gestao de Equipamentos</CardTitle>
        {role === "admin" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="danger" className="h-9 gap-2 px-4 text-xs" onClick={onReset}>
              <Trash2 className="h-4 w-4" />
              Resetar equipamentos
            </Button>
            <Button variant="ghost" className="h-9 gap-2 px-4 text-xs" onClick={onDownloadTemplate}>
              <Download className="h-4 w-4" />
              Baixar modelo
            </Button>
            <Button variant="secondary" className="h-9 gap-2 px-4 text-xs" onClick={onUploadSpreadsheet}>
              <Upload className="h-4 w-4" />
              Upload de planilha
            </Button>
          </div>
        ) : null}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-marine/8 bg-white/70 px-3 py-2">
        <div className="text-xs text-textSecondary">
          Exibindo <span className="font-semibold text-textPrimary">{items.length}</span> de{" "}
          <span className="font-semibold text-textPrimary">{totalItems}</span> equipamento(s)
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-textSecondary">
            <span>Por pagina</span>
            <Select
              className="h-9 min-w-[92px] rounded-xl px-3 py-0 text-xs"
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="h-8 rounded-xl px-3 py-0 text-[11px]"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Anterior
            </Button>
            <span className="text-xs font-semibold text-textPrimary">
              Pagina {currentPage} de {totalPages}
            </span>
            <Button
              variant="ghost"
              className="h-8 rounded-xl px-3 py-0 text-[11px]"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Proxima
            </Button>
          </div>
        </div>
      </div>
      <div
        ref={topScrollRef}
        className="mb-2 overflow-x-auto"
        onScroll={() => syncHorizontalScroll("top")}
      >
        <div className="h-3" style={{ width: `${topScrollContentWidth}px` }} />
      </div>
      <div
        ref={bottomScrollRef}
        className="overflow-x-auto"
        onScroll={() => syncHorizontalScroll("bottom")}
      >
        <Table className="min-w-[1880px]">
          <THead>
            <tr>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Status</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Situacao</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Serial</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Equipamento</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Brand</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Model</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Ult. cal.</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Prox. cal.</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Certificate</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Owner</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">District</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">UF</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">City</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Customer</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Vendor</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Obs.</TH>
              <TH className="sticky top-0 z-20 whitespace-nowrap bg-marine px-3 py-2 text-[11px]">Status contato</TH>
              <TH className="sticky right-0 top-0 z-30 whitespace-nowrap bg-marine px-3 py-2 text-[11px] shadow-[-10px_0_18px_rgba(0,45,98,0.22)]">
                Acoes
              </TH>
            </tr>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <tr>
                <TD colSpan={17} className="px-3 py-6 text-center text-sm text-textSecondary">
                  Nenhum equipamento encontrado para os filtros selecionados.
                </TD>
              </tr>
            ) : null}
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-appBg/60">
                <TD className="whitespace-nowrap px-3 py-2 align-middle">
                  <BadgeStatus status={item.status_calibracao} className="px-2.5 py-0.5 text-[11px] leading-none" />
                </TD>
                <TD className="whitespace-nowrap px-3 py-2 align-middle">
                  <span className="inline-flex rounded-full bg-marine/8 px-2.5 py-0.5 text-[11px] font-semibold text-marine">
                    {item.active ? "Ativo" : "Descontinuado"}
                  </span>
                </TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{item.serial_number}</TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] font-semibold align-middle">{item.equipamento}</TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{item.brand ?? "-"}</TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{item.model ?? "-"}</TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{formatDate(item.ultima_calibracao)}</TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{formatDate(item.proxima_calibracao)}</TD>
                <TD className="whitespace-nowrap px-3 py-2 align-middle">
                  <Button
                    variant="ghost"
                    className="h-8 rounded-xl px-2.5 py-0 text-[11px] font-semibold"
                    onClick={() => onManageDocuments(item)}
                  >
                    {item.certificado ? `Cert. ${formatCertificado(item.certificado)}` : "Anexar revisao"}
                  </Button>
                </TD>
                <TD className="whitespace-nowrap px-3 py-2 align-middle">
                  {role === "admin" ? (
                    <Button
                      variant="ghost"
                      className="h-8 rounded-xl px-2.5 py-0 text-[12px] font-semibold text-marine"
                      onClick={() => onOpenOwner(item)}
                    >
                      {item.owner_name}
                    </Button>
                  ) : (
                    <span className="text-[13px]">{item.owner_name}</span>
                  )}
                </TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{item.district ?? item.owner_district ?? "-"}</TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{item.region_state ?? "-"}</TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{item.city ?? "-"}</TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{item.customer ?? "-"}</TD>
                <TD className="whitespace-nowrap px-3 py-2 text-[13px] align-middle">{item.vendor ?? "-"}</TD>
                <TD className="min-w-[220px] px-3 py-2 text-[13px] align-middle">{item.observacao ?? "-"}</TD>
                <TD className="whitespace-nowrap px-3 py-2 align-middle">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getContactStatusClass(item.status_contato)}`}>
                    {item.status_contato}
                  </span>
                </TD>
                <TD className="sticky right-0 z-10 whitespace-nowrap bg-white px-3 py-2 align-middle shadow-[-10px_0_18px_rgba(15,23,42,0.08)]">
                  <div className="flex flex-nowrap gap-1.5">
                    {role === "admin" ? (
                      <>
                        <Button variant="ghost" className="h-8 gap-1.5 rounded-xl px-2.5 py-0 text-[11px]" onClick={() => onEdit(item)}>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button variant="ghost" className="h-8 gap-1.5 rounded-xl px-2.5 py-0 text-[11px]" onClick={() => onViewHistory(item)}>
                          <ClipboardCheck className="h-4 w-4" />
                          Historico
                        </Button>
                        <Button variant="danger" className="h-8 gap-1.5 rounded-xl px-2.5 py-0 text-[11px]" onClick={() => onDeactivate(item)}>
                          Descontinuar
                        </Button>
                      </>
                    ) : null}
                    {role === "gestor" ? (
                      <Button variant="ghost" className="h-8 gap-1.5 rounded-xl px-2.5 py-0 text-[11px]" onClick={() => onRequestReview(item)}>
                        <ShieldAlert className="h-4 w-4" />
                        Solicitar revisao
                      </Button>
                    ) : null}
                  </div>
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}
