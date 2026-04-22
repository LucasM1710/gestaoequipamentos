import { useEffect, useMemo, useState } from "react";
import type { UsuarioFormValues } from "@/components/usuarios/ModalUsuario";
import { useAuth } from "@/hooks/useAuth";
import { mockUsers } from "@/lib/mockData";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/services/emailService";
import { registerLog } from "@/services/logService";
import type { AppUser } from "@/types";

type SpreadsheetImportRow = Record<string, string>;

const spreadsheetTemplateRow = {
  "Nome Completo": "",
  "E-mail": "",
  Telefone: "",
  Distrito: "",
  Role: "usuario",
  Lider: "",
  "E-mail Lider": "",
  Status: "Ativo",
};

function toNullableText(value: string | undefined) {
  return value ? value : null;
}

async function parseSpreadsheetFile(file: File): Promise<SpreadsheetImportRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  if (!worksheet) {
    throw new Error("A planilha nao possui abas validas.");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

  return rows.map((row) =>
    Object.entries(row).reduce<SpreadsheetImportRow>((acc, [key, value]) => {
      acc[key] = value === null || value === undefined ? "" : String(value).trim();
      return acc;
    }, {}),
  );
}

export interface UserProvisionResult {
  success: boolean;
  userId: string;
  onboardingMode: "invite_email" | "manual_link";
  manualActionLink: string | null;
  onboardingWarning?: string | null;
}

export function useUsuarios() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<AppUser[]>(isSupabaseConfigured ? [] : mockUsers);
  const [isLoading, setIsLoading] = useState(true);

  async function loadData() {
    setIsLoading(true);

    if (!isSupabaseConfigured || !supabase) {
      setUsers(mockUsers);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    if (error) {
      setIsLoading(false);
      throw error;
    }

    setUsers((data as AppUser[] | null) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadData().catch(() => {
      setIsLoading(false);
    });
  }, []);

  const lideres = useMemo(() => users.filter((user) => user.role === "lider"), [users]);

  async function saveUsuario(values: UsuarioFormValues, current?: AppUser | null) {
    const payload = {
      full_name: values.full_name,
      email: values.email,
      phone: toNullableText(values.phone),
      district: toNullableText(values.district),
      role: values.role,
      lider_id: values.role === "usuario" ? toNullableText(values.lider_id) : null,
      active: values.active === "true",
    };

    if (!isSupabaseConfigured || !supabase) {
      const createdId = current?.id ?? crypto.randomUUID();

      if (current) {
        setUsers((currentUsers) =>
          currentUsers.map((user) => (user.id === current.id ? { ...user, ...payload } : user)),
        );
      } else {
        setUsers((currentUsers) => [
          {
            id: createdId,
            created_at: new Date().toISOString(),
            ...payload,
          },
          ...currentUsers,
        ]);
      }

      await registerLog({
        userId: profile?.id,
        action: current ? "Atualizou usuario" : "Criou usuario",
        table: "users",
        recordId: createdId,
        previousValue: current ? { ...current } : null,
        nextValue: payload,
      });

      return {
        success: true,
        userId: createdId,
        onboardingMode: "invite_email",
        manualActionLink: null,
        onboardingWarning: null,
      } satisfies UserProvisionResult;
    }

    if (current) {
      const { error } = await supabase.from("users").update(payload).eq("id", current.id);
      if (error) {
        throw error;
      }

      await registerLog({
        userId: profile?.id,
        action: "Atualizou usuario",
        table: "users",
        recordId: current.id,
        previousValue: {
          email: current.email,
          role: current.role,
          active: current.active,
        },
        nextValue: payload,
      });
    } else {
      const result = await invokeEdgeFunction("admin-create-user", {
        fullName: values.full_name,
        email: values.email,
        phone: toNullableText(values.phone),
        district: toNullableText(values.district),
        role: values.role,
        liderId: values.role === "usuario" ? toNullableText(values.lider_id) : null,
      });

      await loadData();
      return result as UserProvisionResult;
    }

    await loadData();

    return {
      success: true,
      userId: current.id,
      onboardingMode: "invite_email",
      manualActionLink: null,
      onboardingWarning: null,
    } satisfies UserProvisionResult;
  }

  async function toggleUserActive(user: AppUser) {
    const nextActive = !user.active;

    if (!isSupabaseConfigured || !supabase) {
      setUsers((currentUsers) =>
        currentUsers.map((entry) => (entry.id === user.id ? { ...entry, active: nextActive } : entry)),
      );
    } else {
      const { error } = await supabase.from("users").update({ active: nextActive }).eq("id", user.id);
      if (error) {
        throw error;
      }
    }

    await registerLog({
      userId: profile?.id,
      action: nextActive ? "Ativou usuario" : "Desativou usuario",
      table: "users",
      recordId: user.id,
      previousValue: { active: user.active },
      nextValue: { active: nextActive },
    });

    if (isSupabaseConfigured && supabase) {
      await loadData();
    }
  }

  async function uploadUsersSheet(file: File) {
    const rows = await parseSpreadsheetFile(file);

    if (rows.length === 0) {
      throw new Error("A planilha de usuarios esta vazia.");
    }

    if (!isSupabaseConfigured || !supabase) {
      return {
        success: true,
        imported: rows.length,
        message: "Upload de usuarios simulado em modo local.",
      };
    }

    const result = await invokeEdgeFunction("sync-users-sheet", { rows });
    await loadData();
    return result;
  }

  async function downloadModeloPlanilha() {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet([spreadsheetTemplateRow]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Usuarios");
    XLSX.writeFile(workbook, "modelo-usuarios-er-analitica.xlsx");
  }

  return {
    users,
    lideres,
    isLoading,
    refresh: loadData,
    saveUsuario,
    toggleUserActive,
    uploadUsersSheet,
    downloadModeloPlanilha,
  };
}
