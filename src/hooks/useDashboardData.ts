import { useEffect, useState } from "react";
import { mockCalibracoes, mockCrmCards, mockEquipamentos, mockReviewRequests, mockUsers } from "@/lib/mockData";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/services/emailService";
import { registerLog } from "@/services/logService";
import type { AppUser, Calibracao, CrmCard, EquipamentoVisao, ReviewRequest, ReviewRequestStatus, UserRole } from "@/types";

interface DashboardDataPayload {
  equipamentos?: EquipamentoVisao[];
  calibracoes?: Calibracao[];
  crmCards?: CrmCard[];
  reviewRequests?: ReviewRequest[];
  users?: AppUser[];
}

function canLoadConsolidatedDashboard(role: UserRole | null) {
  return role === "admin" || role === "gestor" || role === "lider";
}

export function useDashboardData(role: UserRole | null, actorUserId?: string | null) {
  const [equipamentos, setEquipamentos] = useState<EquipamentoVisao[]>(isSupabaseConfigured ? [] : mockEquipamentos);
  const [calibracoes, setCalibracoes] = useState<Calibracao[]>(isSupabaseConfigured ? [] : mockCalibracoes);
  const [crmCards, setCrmCards] = useState<CrmCard[]>(isSupabaseConfigured ? [] : mockCrmCards);
  const [reviewRequests, setReviewRequests] = useState<ReviewRequest[]>(isSupabaseConfigured ? [] : mockReviewRequests);
  const [users, setUsers] = useState<AppUser[]>(isSupabaseConfigured ? [] : mockUsers);
  const [isLoading, setIsLoading] = useState(true);

  async function loadData() {
    setIsLoading(true);

    if (!isSupabaseConfigured || !supabase) {
      setEquipamentos(mockEquipamentos);
      setCalibracoes(mockCalibracoes);
      setCrmCards(mockCrmCards);
      setReviewRequests(mockReviewRequests);
      setUsers(mockUsers);
      setIsLoading(false);
      return;
    }

    if (!role || !actorUserId) {
      return;
    }

    if (canLoadConsolidatedDashboard(role)) {
      const payload = (await invokeEdgeFunction("dashboard-data", {})) as DashboardDataPayload;

      setEquipamentos(payload.equipamentos ?? []);
      setCalibracoes(payload.calibracoes ?? []);
      setCrmCards(payload.crmCards ?? []);
      setReviewRequests(payload.reviewRequests ?? []);
      setUsers(payload.users ?? []);
      setIsLoading(false);
      return;
    }

    const [equipamentosResponse, calibracoesResponse, crmCardsResponse, usersResponse] = await Promise.all([
      supabase.from("equipamentos_visao").select("*"),
      supabase.from("calibracoes").select("*"),
      supabase.from("crm_cards").select("*"),
      supabase.from("users").select("*").eq("active", true),
    ]);

    if (equipamentosResponse.error) {
      setIsLoading(false);
      throw equipamentosResponse.error;
    }

    if (calibracoesResponse.error) {
      setIsLoading(false);
      throw calibracoesResponse.error;
    }

    if (crmCardsResponse.error) {
      setIsLoading(false);
      throw crmCardsResponse.error;
    }

    if (usersResponse.error) {
      setIsLoading(false);
      throw usersResponse.error;
    }

    setEquipamentos((equipamentosResponse.data as EquipamentoVisao[] | null) ?? []);
    setCalibracoes((calibracoesResponse.data as Calibracao[] | null) ?? []);
    setCrmCards((crmCardsResponse.data as CrmCard[] | null) ?? []);
    setUsers((usersResponse.data as AppUser[] | null) ?? []);

    setReviewRequests([]);

    setIsLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    void loadData().catch(() => {
      if (mounted) {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [actorUserId, role]);

  async function updateReviewRequestStatus(
    request: ReviewRequest,
    status: ReviewRequestStatus,
    observacao: string,
  ) {
    const nextObservacao = observacao.trim();

    if (!isSupabaseConfigured || !supabase) {
      setReviewRequests((current) =>
        current.map((entry) =>
          entry.id === request.id
            ? {
                ...entry,
                status,
                observacao: nextObservacao || null,
                updated_at: new Date().toISOString(),
              }
            : entry,
        ),
      );

      await registerLog({
        userId: actorUserId,
        action: "Atualizou solicitacao de revisao",
        table: "review_requests",
        recordId: request.id,
        previousValue: { status: request.status, observacao: request.observacao },
        nextValue: { status, observacao: nextObservacao || null },
      });
      return;
    }

    const { error } = await supabase
      .from("review_requests")
      .update({ status, observacao: nextObservacao || null })
      .eq("id", request.id);

    if (error) {
      throw error;
    }

    await registerLog({
      userId: actorUserId,
      action: "Atualizou solicitacao de revisao",
      table: "review_requests",
      recordId: request.id,
      previousValue: { status: request.status, observacao: request.observacao },
      nextValue: { status, observacao: nextObservacao || null },
    });

    await loadData();
  }

  return {
    equipamentos,
    calibracoes,
    crmCards,
    reviewRequests,
    users,
    isLoading,
    refresh: loadData,
    updateReviewRequestStatus,
  };
}
