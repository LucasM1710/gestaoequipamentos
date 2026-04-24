import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { CrmCard, CrmColuna } from "@/types";
import { KanbanCard } from "./KanbanCard";

interface KanbanColunaProps {
  coluna: CrmColuna;
  label: string;
  cards: CrmCard[];
  onOpen: (card: CrmCard) => void;
  canEdit: boolean;
  getOwnerData: (card: CrmCard) => {
    owner?: import("@/types").AppUser;
    lider?: import("@/types").AppUser;
    equipamentos: import("@/types").EquipamentoVisao[];
  };
}

const toneStyles: Record<CrmColuna, { dot: string; label: string; isOverBg: string }> = {
  sem_contato:      { dot: "bg-[#8BADCd]",          label: "text-[#5A7A9A]",         isOverBg: "bg-[#8BADCd]/8 border-[#8BADCd]/40" },
  aguardando_retorno:{ dot: "bg-status-alerta",      label: "text-status-alerta",      isOverBg: "bg-status-alerta/8 border-status-alerta/40" },
  em_contato:       { dot: "bg-status-critico",      label: "text-status-critico",     isOverBg: "bg-status-critico/8 border-status-critico/40" },
  agendado:         { dot: "bg-status-agendado",     label: "text-status-agendado",    isOverBg: "bg-status-agendado/8 border-status-agendado/40" },
  calibrado:        { dot: "bg-status-calibrado",    label: "text-status-calibrado",   isOverBg: "bg-status-calibrado/8 border-status-calibrado/40" },
  perdido:          { dot: "bg-[#8BADCd]",            label: "text-[#5A7A9A]",         isOverBg: "bg-[#8BADCd]/8 border-[#8BADCd]/40" },
};

export function KanbanColuna({ coluna, label, cards, onOpen, canEdit, getOwnerData }: KanbanColunaProps) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna });
  const tone = toneStyles[coluna];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-2xl border transition-all duration-200",
        isOver
          ? cn("shadow-lg", tone.isOverBg)
          : "border-marine/10 bg-white/80",
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className={cn("h-2 w-2 rounded-full shrink-0", tone.dot)} />
          <p className="text-[13px] font-semibold text-textPrimary">{label}</p>
        </div>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-marine/8 px-1.5 text-[11px] font-semibold text-marine">
          {cards.length}
        </span>
      </div>

      <div className="mx-4 border-t border-marine/8" />

      {/* Cards */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3 max-h-[calc(100vh-260px)]">
        {cards.length === 0 ? (
          <div
            className={cn(
              "flex min-h-[160px] items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm leading-6 text-textSecondary transition-all duration-200",
              isOver ? "border-current bg-white/60" : "border-marine/12 bg-appBg/40",
            )}
          >
            {isOver ? "Soltar aqui" : "Nenhum owner nesta etapa."}
          </div>
        ) : (
          cards.map((card) => {
            const data = getOwnerData(card);
            return (
              <KanbanCard
                key={card.id}
                card={card}
                owner={data.owner}
                lider={data.lider}
                equipamentos={data.equipamentos}
                onOpen={onOpen}
                draggable={canEdit}
              />
            );
          })
        )}

        {/* Drop indicator when column has cards */}
        {cards.length > 0 && isOver ? (
          <div className="h-1.5 rounded-full bg-turquoise/40 transition-all" />
        ) : null}
      </div>
    </div>
  );
}
