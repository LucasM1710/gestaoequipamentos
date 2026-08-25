import { useState } from "react";
import { AlertTriangle, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { useVinculosPendentes } from "@/hooks/useVinculosPendentes";
import type { RevisaoDuplicado } from "@/types";

function DuplicadoCard({
  item,
  onVincular,
}: {
  item: RevisaoDuplicado;
  onVincular: (equipamentoId: string, codigo: string) => Promise<void>;
}) {
  const [salvando, setSalvando] = useState<string | null>(null);

  async function escolher(codigo: string) {
    setSalvando(codigo);
    try {
      await onVincular(item.equipamento_id, codigo);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="rounded-2xl border border-marine/10 bg-white/85 px-4 py-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-textPrimary">Série {item.serial_number}</span>
        <span className="text-xs text-textSecondary">Cliente no portal: {item.customer ?? "-"}</span>
      </div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-textSecondary">
        Escolha o equipamento correto no ERP:
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {item.candidatos.map((c) => {
          const mesmoCliente =
            (c.customer ?? "").trim().toLowerCase() === (item.customer ?? "").trim().toLowerCase();
          return (
            <button
              key={c.codigo}
              type="button"
              disabled={salvando !== null}
              onClick={() => void escolher(c.codigo)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                mesmoCliente
                  ? "border-status-calibrado/40 bg-status-calibrado/5 hover:bg-status-calibrado/10"
                  : "border-marine/12 bg-appBg hover:bg-marine/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] font-semibold text-marine">{c.codigo}</span>
                {mesmoCliente ? (
                  <span className="rounded-full bg-status-calibrado/15 px-2 py-0.5 text-[10px] font-semibold text-status-calibrado">
                    mesmo cliente
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-[13px] text-textPrimary">{c.descricao ?? "Sem descrição"}</p>
              <p className="truncate text-[11px] text-textSecondary">{c.customer ?? "Sem cliente"}</p>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-marine">
                <Link2 className="h-3 w-3" />
                {salvando === c.codigo ? "Vinculando..." : "Vincular a este"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function VinculosPendentes() {
  const { dados, isLoading, vincularManual, reprocessar } = useVinculosPendentes();
  const [reprocessando, setReprocessando] = useState(false);
  const [codigoManual, setCodigoManual] = useState<Record<string, string>>({});
  const [salvandoManual, setSalvandoManual] = useState<string | null>(null);

  async function handleReprocessar() {
    setReprocessando(true);
    try {
      await reprocessar();
      toast.success("Auto-vínculo reprocessado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao reprocessar.");
    } finally {
      setReprocessando(false);
    }
  }

  async function handleVincular(equipamentoId: string, codigo: string) {
    try {
      await vincularManual(equipamentoId, codigo);
      toast.success("Equipamento vinculado ao ERPNext.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao vincular.");
    }
  }

  async function handleVincularManual(equipamentoId: string) {
    const codigo = (codigoManual[equipamentoId] ?? "").trim();
    if (!codigo) return;
    setSalvandoManual(equipamentoId);
    try {
      await vincularManual(equipamentoId, codigo);
      toast.success("Equipamento vinculado ao ERPNext.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao vincular.");
    } finally {
      setSalvandoManual(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[30px] border border-black/6 bg-white px-6 py-5 shadow-panel">
        <div className="absolute -left-8 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-veoliaRed/8" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="inline-flex rounded-full border border-marine/12 bg-appBg px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-marine">
              Integração ERPNext
            </span>
            <h1 className="mt-1.5 text-[32px] font-semibold tracking-[-0.06em] text-textPrimary">
              Conferência de vínculos
            </h1>
            <p className="mt-1.5 text-sm text-textSecondary">
              Equipamentos que o auto-vínculo não conseguiu casar sozinho com o ERPNext.
            </p>
          </div>
          <Button type="button" className="gap-2" disabled={reprocessando} onClick={() => void handleReprocessar()}>
            <RefreshCw className={`h-4 w-4 ${reprocessando ? "animate-spin" : ""}`} />
            {reprocessando ? "Reprocessando..." : "Reprocessar auto-vínculo"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="text-sm text-textSecondary">Carregando conferência...</Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-marine/12 bg-white/90">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-textSecondary">Duplicados</p>
              <p className="mt-1 text-3xl font-bold text-textPrimary">{dados.resumo.duplicados}</p>
              <p className="text-xs text-textSecondary">Série aponta para mais de um — escolha o certo</p>
            </Card>
            <Card className="border-marine/12 bg-white/90">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-textSecondary">Não encontrados no ERP</p>
              <p className="mt-1 text-3xl font-bold text-textPrimary">{dados.resumo.naoEncontrados}</p>
              <p className="text-xs text-textSecondary">Série real, mas sem cadastro no ERP</p>
            </Card>
            <Card className="border-marine/12 bg-white/90">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-textSecondary">Série inválida</p>
              <p className="mt-1 text-3xl font-bold text-textPrimary">{dados.resumo.placeholders}</p>
              <p className="text-xs text-textSecondary">Placeholder — corrigir a série primeiro</p>
            </Card>
          </div>

          {dados.duplicados.length > 0 ? (
            <Card className="space-y-3 border-marine/12 bg-white/90">
              <CardTitle>Duplicados — escolha o equipamento certo</CardTitle>
              <p className="text-xs text-textSecondary">
                A mesma série existe em mais de um equipamento no ERP. Compare o cliente e escolha o correto. Os
                candidatos do mesmo cliente do portal estão destacados.
              </p>
              <div className="space-y-3">
                {dados.duplicados.map((item) => (
                  <DuplicadoCard key={item.equipamento_id} item={item} onVincular={handleVincular} />
                ))}
              </div>
            </Card>
          ) : null}

          {dados.naoEncontrados.length > 0 ? (
            <Card className="space-y-3 border-marine/12 bg-white/90">
              <CardTitle>Não encontrados no cadastro do ERP</CardTitle>
              <p className="text-xs text-textSecondary">
                Esses equipamentos têm série real, mas ela não existe no cadastro de Equipamentos do ERP. Cadastre-os
                lá (o vínculo acontece sozinho em até 30 min) ou, se você já souber o código, informe abaixo.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <tr>
                      <TH>Série</TH>
                      <TH>Cliente</TH>
                      <TH>Código do ERP (opcional)</TH>
                      <TH>Ação</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {dados.naoEncontrados.map((item) => (
                      <tr key={item.equipamento_id} className="transition-colors hover:bg-appBg/50">
                        <TD className="whitespace-nowrap font-medium">{item.serial_number ?? "-"}</TD>
                        <TD>{item.customer ?? "-"}</TD>
                        <TD>
                          <Input
                            className="h-8 w-44 text-[13px]"
                            placeholder="EQUIPC-XXXXX"
                            value={codigoManual[item.equipamento_id] ?? ""}
                            onChange={(event) =>
                              setCodigoManual((atual) => ({ ...atual, [item.equipamento_id]: event.target.value }))
                            }
                          />
                        </TD>
                        <TD>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 gap-1.5 px-3 text-[11px]"
                            disabled={
                              salvandoManual === item.equipamento_id ||
                              !(codigoManual[item.equipamento_id] ?? "").trim()
                            }
                            onClick={() => void handleVincularManual(item.equipamento_id)}
                          >
                            <Link2 className="h-4 w-4" />
                            {salvandoManual === item.equipamento_id ? "Vinculando..." : "Vincular"}
                          </Button>
                        </TD>
                      </tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            </Card>
          ) : null}

          {dados.placeholders.length > 0 ? (
            <Card className="space-y-3 border-marine/12 bg-white/90">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-status-alerta" />
                Série inválida — corrigir no cadastro
              </CardTitle>
              <p className="text-xs text-textSecondary">
                A série destes equipamentos é um placeholder (ex.: "Não informado"). Não há como casar automaticamente
                até que uma série real seja informada.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <tr>
                      <TH>Série</TH>
                      <TH>Cliente</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {dados.placeholders.map((item) => (
                      <tr key={item.equipamento_id} className="transition-colors hover:bg-appBg/50">
                        <TD className="whitespace-nowrap font-medium">{item.serial_number ?? "-"}</TD>
                        <TD>{item.customer ?? "-"}</TD>
                      </tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            </Card>
          ) : null}

          {dados.resumo.duplicados + dados.resumo.naoEncontrados + dados.resumo.placeholders === 0 ? (
            <Card className="text-sm text-textSecondary">
              Nenhum equipamento pendente de vínculo. Tudo casado com o ERPNext.
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
