import { getAdminClient, getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type ParsedRow = Record<string, string>;

type SheetUser = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  district: string | null;
  role: "admin" | "gestor" | "lider" | "usuario";
  lider_id: string | null;
  active: boolean;
};

type NormalizedUserRow = {
  fullName: string;
  email: string;
  phone: string | null;
  district: string | null;
  role: "admin" | "gestor" | "lider" | "usuario";
  leaderName: string | null;
  leaderEmail: string | null;
  active: boolean;
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()#.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isValidEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getField(row: ParsedRow, aliases: string[]) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (row[key]) {
      return row[key];
    }
  }
  return "";
}

function normalizeIncomingRows(input: unknown): ParsedRow[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) =>
      Object.entries(row as Record<string, unknown>).reduce<ParsedRow>((acc, [key, value]) => {
        acc[normalizeHeader(key)] = value === null || value === undefined ? "" : String(value).trim();
        return acc;
      }, {}),
    )
    .filter((row) => Object.values(row).some((value) => value !== ""));
}

function parseRole(value: string) {
  const normalized = normalizeText(value);

  if (normalized === "admin" || normalized === "gestor" || normalized === "lider" || normalized === "usuario") {
    return normalized;
  }

  return "usuario";
}

function parseActive(value: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return true;
  }

  return !["inativo", "false", "nao", "não", "0"].includes(normalized);
}

async function loadAuthUsers(adminClient: ReturnType<typeof getAdminClient>) {
  const usersByEmail = new Map<string, { id: string; email: string | null }>();
  let page = 1;

  while (true) {
    const listed = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (listed.error) {
      throw listed.error;
    }

    const authUsers = listed.data.users ?? [];
    for (const user of authUsers) {
      if (user.email) {
        usersByEmail.set(user.email.toLowerCase(), { id: user.id, email: user.email });
      }
    }

    if (authUsers.length < 200) {
      break;
    }

    page += 1;
  }

  return usersByEmail;
}

async function ensureSheetUser(
  adminClient: ReturnType<typeof getAdminClient>,
  usersByEmail: Map<string, SheetUser>,
  usersByName: Map<string, SheetUser>,
  authUsersByEmail: Map<string, { id: string; email: string | null }>,
  row: NormalizedUserRow,
  liderId: string | null,
) {
  const normalizedEmail = row.email.toLowerCase();
  const normalizedName = normalizeText(row.fullName);

  let existing = usersByEmail.get(normalizedEmail);
  if (!existing && normalizedName) {
    existing = usersByName.get(normalizedName);
  }

  let userId = existing?.id ?? null;

  if (!userId) {
    const authUser = authUsersByEmail.get(normalizedEmail);
    if (authUser) {
      userId = authUser.id;
    } else {
      const createResult = await adminClient.auth.admin.createUser({
        email: row.email,
        password: `${crypto.randomUUID()}Aa!`,
        email_confirm: true,
        user_metadata: {
          full_name: row.fullName,
        },
      });

      if (createResult.error || !createResult.data.user) {
        throw new Error(createResult.error?.message ?? `Falha ao criar usuario ${row.email}.`);
      }

      userId = createResult.data.user.id;
      authUsersByEmail.set(normalizedEmail, { id: userId, email: row.email });
    }
  }

  const payload = {
    id: userId,
    full_name: row.fullName,
    email: row.email,
    phone: row.phone,
    district: row.district,
    role: row.role,
    lider_id: row.role === "usuario" ? liderId : null,
    active: row.active,
  };

  const { error } = await adminClient.from("users").upsert(payload, { onConflict: "id" });
  if (error) {
    throw new Error(error.message);
  }

  const nextUser = payload satisfies SheetUser;
  usersByEmail.set(normalizedEmail, nextUser);
  usersByName.set(normalizedName, nextUser);
  return { user: nextUser, wasNew: !existing };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Token ausente." }, { status: 401 });
    }

    const userClient = getUserClient(authHeader);
    const adminClient = getAdminClient();

    const {
      data: { user: caller },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !caller) {
      return jsonResponse({ error: "Nao autenticado." }, { status: 401 });
    }

    const { data: callerProfile } = await adminClient.from("users").select("id, role").eq("id", caller.id).single();
    if (!callerProfile || !["admin", "gestor"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Apenas admin ou gestor podem sincronizar usuarios." }, { status: 403 });
    }

    const body = (await request.json()) as { rows?: unknown };
    const rows = normalizeIncomingRows(body.rows ?? []);

    if (rows.length === 0) {
      return jsonResponse({ error: "Nenhuma linha valida foi enviada na planilha." }, { status: 400 });
    }

    const normalizedRows = rows
      .map<NormalizedUserRow | null>((row) => {
        const fullName = getField(row, ["Nome Completo", "Nome"]).trim();
        const email = getField(row, ["E-mail", "Email"]).trim().toLowerCase();

        if (!fullName || !isValidEmail(email)) {
          return null;
        }

        return {
          fullName,
          email,
          phone: toNullable(getField(row, ["Telefone", "Cel", "Celular"])),
          district: toNullable(getField(row, ["Distrito", "District"])),
          role: parseRole(getField(row, ["Role", "Perfil"])),
          leaderName: toNullable(getField(row, ["Lider", "Lider responsavel", "Leader"])),
          leaderEmail: toNullable(getField(row, ["E-mail Lider", "Email Lider", "Leader Email"])),
          active: parseActive(getField(row, ["Status", "Ativo"])),
        };
      })
      .filter((row): row is NormalizedUserRow => Boolean(row));

    if (normalizedRows.length === 0) {
      return jsonResponse({ error: "Nenhum usuario valido encontrado na planilha." }, { status: 400 });
    }

    const { data: existingUsers, error: existingUsersError } = await adminClient.from("users").select("*");
    if (existingUsersError) {
      return jsonResponse({ error: existingUsersError.message }, { status: 400 });
    }

    const users = (existingUsers as SheetUser[] | null) ?? [];
    const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
    const usersByName = new Map(users.map((user) => [normalizeText(user.full_name), user]));
    const authUsersByEmail = await loadAuthUsers(adminClient);

    let created = 0;
    let updated = 0;

    const orderedRows = [
      ...normalizedRows.filter((row) => row.role !== "usuario"),
      ...normalizedRows.filter((row) => row.role === "usuario"),
    ];

    for (const row of orderedRows) {
      let liderId: string | null = null;

      if (row.role === "usuario") {
        const leader =
          (row.leaderEmail ? usersByEmail.get(row.leaderEmail.toLowerCase()) : undefined) ??
          (row.leaderName ? usersByName.get(normalizeText(row.leaderName)) : undefined);

        liderId = leader?.id ?? null;
      }

      const { wasNew } = await ensureSheetUser(adminClient, usersByEmail, usersByName, authUsersByEmail, row, liderId);
      if (wasNew) {
        created += 1;
      } else {
        updated += 1;
      }
    }

    const importedUsers = orderedRows.map((row) => {
      const byEmail = usersByEmail.get(row.email.toLowerCase());
      return byEmail ?? usersByName.get(normalizeText(row.fullName));
    }).filter((item): item is SheetUser => Boolean(item));

    const importedByEmail = new Map(importedUsers.map((user) => [user.email.toLowerCase(), user]));
    const importedByName = new Map(importedUsers.map((user) => [normalizeText(user.full_name), user]));

    const { data: equipamentosView, error: equipamentosViewError } = await adminClient
      .from("equipamentos_visao")
      .select("id, owner_id, owner_name, owner_email");

    if (equipamentosViewError) {
      return jsonResponse({ error: equipamentosViewError.message }, { status: 400 });
    }

    let equipamentosRelinkados = 0;
    for (const equipamento of (equipamentosView ?? []) as Array<{
      id: string;
      owner_id: string;
      owner_name: string;
      owner_email: string;
    }>) {
      const matchingUser =
        (equipamento.owner_email ? importedByEmail.get(equipamento.owner_email.toLowerCase()) : undefined) ??
        (equipamento.owner_name ? importedByName.get(normalizeText(equipamento.owner_name)) : undefined);

      if (!matchingUser || matchingUser.id === equipamento.owner_id) {
        continue;
      }

      const { error } = await adminClient.from("equipamentos").update({ owner_id: matchingUser.id }).eq("id", equipamento.id);
      if (error) {
        throw new Error(error.message);
      }

      equipamentosRelinkados += 1;
    }

    await adminClient.rpc("registrar_log", {
      p_user_id: caller.id,
      p_acao: "Sincronizou usuarios por planilha",
      p_tabela: "users",
      p_registro_id: null,
      p_valor_anterior: null,
      p_valor_novo: {
        total_rows: normalizedRows.length,
        created,
        updated,
        equipamentos_relinkados: equipamentosRelinkados,
      },
    });

    return jsonResponse({
      success: true,
      created,
      updated,
      equipamentosRelinkados,
      message: `${created} usuario(s) criados, ${updated} atualizado(s) e ${equipamentosRelinkados} equipamento(s) relinkado(s). Para definir a senha, os usuarios novos devem usar "Esqueci minha senha".`,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Erro interno na sincronizacao de usuarios.",
      },
      { status: 500 },
    );
  }
});
