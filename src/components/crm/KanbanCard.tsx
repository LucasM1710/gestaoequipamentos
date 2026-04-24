import { useDraggable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Mail, MapPin, Package2, Phone, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppUser, CrmCard, EquipamentoVisao } from "@/types";

interface KanbanCardProps {
  card: CrmCard;
  owner?: AppUser;
  lider?: AppUser;
  equipamentos: EquipamentoVisao[];
  onOpen: (card: CrmCard) => void;
  isOverlay?: boolean;
  draggable?: boolean;
}

export function KanbanCard({ card, owner, lider, equipamentos, onOpen, isOverlay, draggable = true }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { cardId: card.id },
    disabled: !draggable,
  });

  const style =
    transform && !isOverlay
      ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
      : undefined;

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay || !draggable ? {} : { ...listeners, ...attributes })}
      className={cn(
        "rounded-xl border bg-white transition-all duration-150",
        isDragging && !isOverlay
          ? "border-marine/8 opacity-30 shadow-none"
          : "border-marine/10 shadow-[0_2px_8px_rgba(0,45,98,0.06)]",
        isOverlay
          ? "rotate-[1.5deg] cursor-grabbing shadow-[0_24px_48px_rgba(0,45,98,0.18)] ring-2 ring-turquoise/30"
          : draggable
            ? "cursor-grab hover:shadow-[0_6px_20px_rgba(0,45,98,0.1)] active:cursor-grabbing"
            : "cursor-default hover:shadow-[0_6px_20px_rgba(0,45,98,0.1)]",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-marine/8 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-marine/50">Owner</p>
          <button
            type="button"
            className="mt-0.5 text-left text-[15px] font-semibold leading-snug tracking-[-0.03em] text-marine hover:text-marine/75"
            onClick={() => onOpen(card)}
          >
            <span className="line-clamp-2">{owner?.full_name ?? "Owner nao encontrado"}</span>
          </button>
        </div>
        <button
          type="button"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-marine/10 bg-appBg text-marine/60 transition-colors hover:border-marine/20 hover:text-marine"
          onClick={() => onOpen(card)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="space-y-2.5 px-4 py-3 text-[13px]">
        <div className="flex items-start gap-2">
          <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marine/40" />
          <div className="min-w-0">
            <p className="text-[11px] text-textSecondary">Lider</p>
            <p className="truncate font-medium text-textPrimary">{lider?.full_name ?? "-"}</p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marine/40" />
          <div className="min-w-0">
            <p className="text-[11px] text-textSecondary">Distrito</p>
            <p className="truncate font-medium text-textPrimary">{owner?.district ?? "-"}</p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marine/40" />
          <div className="min-w-0">
            <p className="text-[11px] text-textSecondary">E-mail</p>
            <p className="truncate font-medium text-textPrimary">{owner?.email ?? "-"}</p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marine/40" />
          <div className="min-w-0">
            <p className="text-[11px] text-textSecondary">Cel</p>
            <p className="font-medium text-textPrimary">{owner?.phone ?? "-"}</p>
          </div>
        </div>
      </div>

      {/* Equipamentos accordion */}
      <details className="group border-t border-marine/8">
        <summary
          className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-medium text-marine/70 hover:text-marine"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="flex items-center gap-1.5">
            <Package2 className="h-3.5 w-3.5" />
            Equipamentos ({equipamentos.length})
          </span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-marine/8 bg-appBg/60 px-4 py-3">
          {equipamentos.length === 0 ? (
            <p className="text-xs text-textSecondary">Nenhum equipamento vinculado.</p>
          ) : (
            <div className="space-y-2">
              {equipamentos.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-marine/8 bg-white px-3 py-2"
                >
                  <p className="text-[13px] font-semibold tracking-[-0.02em] text-textPrimary">{item.equipamento}</p>
                  <p className="mt-0.5 text-xs text-textSecondary">Serial: {item.serial_number}</p>
                  <p className="text-xs text-textSecondary">Proxima: {item.proxima_calibracao ?? "-"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
