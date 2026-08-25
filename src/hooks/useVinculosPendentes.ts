import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/services/emailService";
import type { RevisaoErpnext } from "@/types";

const VAZIO: RevisaoErpnext = {
  resumo: { duplicados: 0, naoEncontrados: 0, placeholders: 0 },
  duplicados: [],
  naoEncontrados: [],
  placeholders: [],
};

export function useVinculosPendentes() {
  const [dados, setDados] = useState<RevisaoErpnext>(VAZIO);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setDados(VAZIO);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Sessao expirada. Entre novamente.");
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revisao-erpnext`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao carregar a revisao.");
      }
      setDados({
        resumo: payload.resumo,
        duplicados: payload.duplicados ?? [],
        naoEncontrados: payload.naoEncontrados ?? [],
        placeholders: payload.placeholders ?? [],
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function vincularManual(equipamentoId: string, codigo: string) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase nao configurado.");
    }
    const { error } = await supabase.rpc("vincular_equipamento_manual", {
      p_equipamento_id: equipamentoId,
      p_codigo: codigo,
    });
    if (error) {
      throw new Error(error.message);
    }
    await load();
  }

  async function reprocessar() {
    await invokeEdgeFunction("auto-vincular-erpnext", {});
    await load();
  }

  return { dados, isLoading, refresh: load, vincularManual, reprocessar };
}
