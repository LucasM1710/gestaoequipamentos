import { useMemo, useState } from "react";
import { toast } from "sonner";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { ModalCard } from "@/components/crm/ModalCard";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useCRM } from "@/hooks/useCRM";
import type { CrmCard } from "@/types";

export function CRM() {
  const { role, profile } = useAuth();
  const { columns, interactions, attachments, emailLogs, equipamentos, users, isLoading, moveCard, addNote, openAttachment } = useCRM();
  const [selectedCard, setSelectedCard] = useState<CrmCard | null>(null);
  const [leaderFilter, setLeaderFilter] = useState("todos");
  const [ownerFilter, setOwnerFilter] = useState("");

  const lideres = useMemo(() => users.filter((user) => user.role === "lider"), [users]);

  const filteredColumns = useMemo(() => {
    return columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => {
        const owner = users.find((user) => user.id === card.owner_id);
        const matchesLeader =
          role !== "admin" || leaderFilter === "todos" ? true : owner?.lider_id === leaderFilter;
        const matchesOwner =
          ownerFilter.trim() === ""
            ? true
            : owner?.full_name.toLowerCase().includes(ownerFilter.trim().toLowerCase());

        return matchesLeader && matchesOwner;
      }),
    }));
  }, [columns, leaderFilter, ownerFilter, role, users]);

  const selectedOwner = users.find((user) => user.id === selectedCard?.owner_id);
  const selectedLeader = users.find((user) => user.id === selectedOwner?.lider_id);
  const totalCards = filteredColumns.reduce((total, column) => total + column.cards.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borderSoft bg-appBg px-4 py-3">
        <p className="text-sm text-textSecondary">
          Arraste os cards entre as colunas. A movimentacao atualiza o CRM e registra a interacao automaticamente.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            placeholder="Buscar por owner"
            autoComplete="off"
            className="w-[220px]"
          />
          <Select
            disabled={role !== "admin"}
            value={role === "lider" ? profile?.id ?? "todos" : leaderFilter}
            onChange={(event) => setLeaderFilter(event.target.value)}
            className="w-[220px]"
          >
            <option value="todos">Todos os lideres</option>
            {lideres.map((lider) => (
              <option key={lider.id} value={lider.id}>
                {lider.full_name}
              </option>
            ))}
          </Select>
          <span className="text-xs font-medium text-textSecondary">{totalCards} cards monitorados</span>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-textSecondary">Carregando CRM...</p> : null}

      <KanbanBoard
        columns={filteredColumns}
        users={users}
        equipamentos={equipamentos}
        onMove={async (cardId, coluna) => {
          try {
            await moveCard(cardId, coluna);
            toast.success(`Card movido para ${coluna}.`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao mover card.");
          }
        }}
        onOpen={(card) => setSelectedCard(card)}
      />
      <ModalCard
        open={Boolean(selectedCard)}
        card={selectedCard}
        owner={selectedOwner}
        lider={selectedLeader}
        users={users}
        equipamentos={equipamentos.filter((item) => item.owner_id === selectedCard?.owner_id)}
        interactions={interactions.filter((item) => item.card_id === selectedCard?.id)}
        attachments={attachments.filter((item) => item.card_id === selectedCard?.id)}
        emailLogs={emailLogs.filter((item) => item.owner_id === selectedCard?.owner_id)}
        onSaveNote={async (cardId, ownerId, note, files) => {
          try {
            await addNote(cardId, ownerId, note, files);
            toast.success("Anotacao registrada no CRM.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao salvar anotacao.");
          }
        }}
        onOpenAttachment={async (attachment) => {
          try {
            const url = await openAttachment(attachment);
            window.open(url, "_blank", "noopener,noreferrer");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao abrir anexo.");
          }
        }}
        onClose={() => setSelectedCard(null)}
      />
    </div>
  );
}
