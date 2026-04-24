import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Link2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import type {
  AppUser,
  CrmCard,
  CrmInteraction,
  CrmInteractionAttachment,
  EmailLog,
  EquipamentoVisao,
} from "@/types";

interface ModalCardProps {
  open: boolean;
  card?: CrmCard | null;
  owner?: AppUser;
  lider?: AppUser;
  users: AppUser[];
  equipamentos: EquipamentoVisao[];
  interactions: CrmInteraction[];
  attachments: CrmInteractionAttachment[];
  emailLogs: EmailLog[];
  canEdit: boolean;
  onSaveNote: (cardId: string, ownerId: string, note: string, files: File[]) => Promise<void>;
  onOpenAttachment: (attachment: CrmInteractionAttachment) => Promise<void>;
  onClose: () => void;
}

export function ModalCard({
  open,
  card,
  owner,
  lider,
  users,
  equipamentos,
  interactions,
  attachments,
  emailLogs,
  canEdit,
  onSaveNote,
  onOpenAttachment,
  onClose,
}: ModalCardProps) {
  const [note, setNote] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setNote("");
      setPendingFiles([]);
    }
  }, [open, card?.id]);

  const attachmentsByInteractionId = useMemo(() => {
    const map = new Map<string, CrmInteractionAttachment[]>();
    for (const attachment of attachments) {
      const current = map.get(attachment.interaction_id) ?? [];
      current.push(attachment);
      map.set(attachment.interaction_id, current);
    }
    return map;
  }, [attachments]);

  async function handleSaveNote() {
    if (!card) {
      return;
    }

    await onSaveNote(card.id, card.owner_id, note, pendingFiles);
    setNote("");
    setPendingFiles([]);
  }

  function getActorName(createdBy: string | null) {
    if (!createdBy) {
      return "Nao identificado";
    }

    if (createdBy === "system") {
      return "Sistema";
    }

    return users.find((user) => user.id === createdBy)?.full_name ?? "Nao identificado";
  }

  function getEmailOpenLabel(item: EmailLog) {
    if (item.opened_at) {
      return `Aberto em ${formatDate(item.opened_at)}`;
    }

    return "Sem confirmacao de leitura";
  }

  return (
    <Dialog open={open} onClose={onClose} title="Historico do card" widthClassName="max-w-5xl">
      {!card ? null : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="space-y-3 bg-[linear-gradient(170deg,rgba(0,45,98,0.05),rgba(255,255,255,0.95))]">
            <div>
              <CardDescription>Owner</CardDescription>
              <CardTitle className="mt-1">{owner?.full_name ?? "-"}</CardTitle>
            </div>
            <div>
              <CardDescription>Lider</CardDescription>
              <p className="mt-1 text-sm text-textPrimary">{lider?.full_name ?? "-"}</p>
            </div>
            <div>
              <CardDescription>Coluna atual</CardDescription>
              <p className="mt-1 inline-flex rounded-full border border-marine/15 bg-white px-3 py-1 text-xs font-semibold uppercase text-marine">
                {card.coluna}
              </p>
            </div>
            <div>
              <CardDescription>Equipamentos vinculados</CardDescription>
              <ul className="mt-2 space-y-2 text-sm text-textPrimary">
                {equipamentos.length === 0 ? <li>Nenhum equipamento ativo vinculado.</li> : null}
                {equipamentos.map((item) => (
                  <li key={item.id}>
                    {item.serial_number} - {item.equipamento}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <div className="space-y-4">
            {canEdit ? (
              <Card className="bg-[linear-gradient(165deg,rgba(5,195,221,0.08),rgba(255,255,255,0.96))]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <CardTitle>Nova anotacao</CardTitle>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const nextFiles = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
                      event.currentTarget.value = "";
                      if (nextFiles.length === 0) {
                        return;
                      }
                      setPendingFiles((current) => [...current, ...nextFiles]);
                    }}
                  />
                  <Button variant="ghost" className="h-9 gap-2 px-3 text-xs" onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" />
                    Anexar imagem
                  </Button>
                </div>
                <div className="space-y-3">
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Registrar contato, contexto ou proximo passo."
                  />

                  {pendingFiles.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {pendingFiles.map((file, index) => (
                        <span
                          key={`${file.name}-${index}`}
                          className="inline-flex items-center gap-2 rounded-full border border-marine/12 bg-white px-3 py-1 text-xs font-medium text-textPrimary"
                        >
                          <Paperclip className="h-3.5 w-3.5 text-marine/60" />
                          {file.name}
                          <button
                            type="button"
                            className="text-textSecondary transition hover:text-veoliaRed"
                            onClick={() => setPendingFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <Button onClick={() => void handleSaveNote()} disabled={!note.trim() && pendingFiles.length === 0}>
                      Salvar anotacao
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}

            <Card className="bg-[linear-gradient(165deg,rgba(0,45,98,0.05),rgba(255,255,255,0.96))]">
              <CardTitle className="mb-3">Interacoes</CardTitle>
              <div className="space-y-3">
                {interactions.length === 0 ? (
                  <div className="rounded-2xl bg-appBg p-3 text-sm text-textSecondary">
                    Nenhuma interacao registrada.
                  </div>
                ) : null}
                {interactions.map((entry) => {
                  const interactionAttachments = attachmentsByInteractionId.get(entry.id) ?? [];

                  return (
                    <div key={entry.id} className="rounded-2xl border border-marine/10 bg-white/80 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold capitalize text-textPrimary">{entry.tipo}</p>
                        <p className="text-xs font-medium text-marine">Por: {getActorName(entry.created_by)}</p>
                      </div>
                      <p className="mt-1 text-sm text-textSecondary">{entry.descricao}</p>
                      <p className="mt-1 text-xs text-textSecondary">{formatDate(entry.created_at)}</p>

                      {interactionAttachments.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {interactionAttachments.map((attachment) => (
                            <Button
                              key={attachment.id}
                              type="button"
                              variant="ghost"
                              className="h-9 gap-2 rounded-xl border border-marine/10 bg-appBg px-3 py-0 text-xs"
                              onClick={() => void onOpenAttachment(attachment)}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              {attachment.nome_arquivo}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="bg-[linear-gradient(165deg,rgba(0,45,98,0.05),rgba(255,255,255,0.96))]">
              <CardTitle className="mb-3">E-mails enviados</CardTitle>
              <div className="space-y-3">
                {emailLogs.length === 0 ? (
                  <div className="rounded-2xl bg-appBg p-3 text-sm text-textSecondary">
                    Nenhum e-mail registrado.
                  </div>
                ) : null}
                {emailLogs.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-marine/10 bg-white/80 p-3">
                    <p className="text-sm font-semibold text-textPrimary">{entry.tipo}</p>
                    <p className="mt-1 text-sm text-textSecondary">{entry.enviado_para.join(", ")}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-textSecondary">
                      <span className="rounded-full bg-appBg px-2.5 py-1">{entry.status}</span>
                      <span className="rounded-full bg-appBg px-2.5 py-1">{getEmailOpenLabel(entry)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </Dialog>
  );
}
