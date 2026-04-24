import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { AppUser, CrmCard, CrmColuna, EquipamentoVisao } from "@/types";
import { KanbanCard } from "./KanbanCard";
import { KanbanColuna } from "./KanbanColuna";

const labels: Record<CrmColuna, string> = {
  sem_contato: "Sem contato",
  aguardando_retorno: "Aguardando retorno",
  em_contato: "Em contato",
  agendado: "Agendado",
  calibrado: "Realizado",
  perdido: "Sem contato",
};

interface KanbanBoardProps {
  columns: Array<{ coluna: CrmColuna; cards: CrmCard[] }>;
  users: AppUser[];
  equipamentos: EquipamentoVisao[];
  onMove: (cardId: string, coluna: CrmColuna) => void;
  onOpen: (card: CrmCard) => void;
  canEdit: boolean;
}

function KanbanColumns({
  columns,
  users,
  equipamentos,
  onOpen,
  canEdit,
}: Omit<KanbanBoardProps, "onMove">) {
  function getOwnerData(card: CrmCard) {
    const owner = users.find((u) => u.id === card.owner_id);
    const lider = users.find((u) => u.id === owner?.lider_id);
    return {
      owner,
      lider,
      equipamentos: equipamentos.filter((item) => item.owner_id === card.owner_id),
    };
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-max auto-cols-[272px] grid-flow-col gap-4">
        {columns.filter((column) => column.coluna !== "perdido").map((column) => (
          <KanbanColuna
            key={column.coluna}
            coluna={column.coluna}
            label={labels[column.coluna]}
            cards={column.cards}
            onOpen={onOpen}
            canEdit={canEdit}
            getOwnerData={getOwnerData}
          />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({ columns, users, equipamentos, onMove, onOpen, canEdit }: KanbanBoardProps) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const activeCard = activeCardId
    ? (columns.flatMap((c) => c.cards).find((card) => card.id === activeCardId) ?? null)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveCardId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null);
    const cardId = String(event.active.id);
    const coluna = event.over?.id;
    if (!coluna) return;
    onMove(cardId, String(coluna) as CrmColuna);
  }

  if (!canEdit) {
    return <KanbanColumns columns={columns} users={users} equipamentos={equipamentos} onOpen={onOpen} canEdit={false} />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <KanbanColumns columns={columns} users={users} equipamentos={equipamentos} onOpen={onOpen} canEdit />

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
        {activeCard ? (
          <KanbanCard
            card={activeCard}
            owner={users.find((u) => u.id === activeCard.owner_id)}
            lider={users.find((u) => u.id === users.find((u) => u.id === activeCard.owner_id)?.lider_id)}
            equipamentos={equipamentos.filter((item) => item.owner_id === activeCard.owner_id)}
            onOpen={onOpen}
            isOverlay
            draggable={false}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
