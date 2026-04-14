import { getAdminClient, getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type SheetUser = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  district: string | null;
  role: "admin" | "gestor" | "lider" | "usuario";
  lider_id: string | null;
};

type ParsedRow = Record<string, string>;

type SyncStats = {
  totalRows: number;
  imported: number;
  skipped: number;
  ownersNotFound: number;
  leadersLinked: number;
  crmUpdated: number;
  usersCreated: number;
};

type EnsureUserInput = {
  fullName: string;
  email: string;
  phone?: string | null;
  district?: string | null;
  role: "lider" | "usuario";
  liderId?: string | null;
};

function isAlreadyRegisteredError(message: string | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("already been registered") || normalized.includes("already registered");
}

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

function parseCsv(input: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function parseSheetRows(csvText: string): ParsedRow[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => normalizeHeader(header));

  return rows.slice(1).map((row) =>
    headers.reduce<ParsedRow>((acc, header, index) => {
      acc[header] = row[index]?.trim() ?? "";
      return acc;
    }, {}),
  );
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

function getField(row: ParsedRow, aliases: string[]) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (row[key]) {
      return row[key];
    }
  }
  return "";
}

function parsePtDate(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{5,6}$/.test(trimmed)) {
    const excelSerial = Number(trimmed);
    if (!Number.isNaN(excelSerial)) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      excelEpoch.setUTCDate(excelEpoch.getUTCDate() + excelSerial);
      return excelEpoch.toISOString().slice(0, 10);
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthMap: Record<string, string> = {
    jan: "01",
    fev: "02",
    mar: "03",
    abr: "04",
    mai: "05",
    jun: "06",
    jul: "07",
    ago: "08",
    set: "09",
    sep: "09",
    out: "10",
    nov: "11",
    dez: "12",
  };

  const normalized = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toLowerCase();

  const textMatch = normalized.match(/^(\d{1,2})-([a-z]{3})-(\d{2,4})$/);
  if (textMatch) {
    const [, day, monthText, year] = textMatch;
    const month = monthMap[monthText];
    if (!month) {
      return null;
    }
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear}-${month}-${day.padStart(2, "0")}`;
  }

  return null;
}

function addDays(dateString: string, days: number) {
  const baseDate = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return baseDate.toISOString().slice(0, 10);
}

function resolveCsvUrl() {
  const directCsvUrl = Deno.env.get("GOOGLE_SHEET_CSV_URL");
  if (directCsvUrl) {
    return directCsvUrl;
  }

  const sheetUrl = Deno.env.get("GOOGLE_SHEET_URL");
  if (!sheetUrl) {
    return null;
  }

  if (sheetUrl.includes("/export?format=csv")) {
    return sheetUrl;
  }

  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    return null;
  }

  const gidFromEnv = Deno.env.get("GOOGLE_SHEET_GID");
  const gidFromUrl = new URL(sheetUrl).searchParams.get("gid");
  const gid = gidFromEnv ?? gidFromUrl;

  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

function mapContactStatusToColumn(status: string) {
  const normalized = normalizeText(status);

  if (!normalized) {
    return "sem_contato";
  }
  if (normalized.includes("realizado") || normalized.includes("calibrado")) {
    return "calibrado";
  }
  if (normalized.includes("aguardando")) {
    return "aguardando_retorno";
  }
  if (normalized.includes("em contato")) {
    return "em_contato";
  }
  if (normalized.includes("agendado")) {
    return "agendado";
  }
  if (normalized.includes("perdido")) {
    return "sem_contato";
  }

  return "sem_contato";
}

function isInactiveStatus(value: string) {
  const normalized = normalizeText(value);
  return normalized.includes("descontinuado") || normalized.includes("inativo");
}

async function ensureSheetUser(
  adminClient: ReturnType<typeof getAdminClient>,
  usersByEmail: Map<string, SheetUser>,
  usersByName: Map<string, SheetUser>,
  input: EnsureUserInput,
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = normalizeText(input.fullName);

  const existingByEmail = usersByEmail.get(normalizedEmail);
  if (existingByEmail) {
    return existingByEmail;
  }

  const existingByName = usersByName.get(normalizedName);
  if (existingByName) {
    return existingByName;
  }

  const createUserResult = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: `${crypto.randomUUID()}Aa!`,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
    },
  });

  let authUser = createUserResult.data.user ?? null;

  if ((createUserResult.error || !authUser) && isAlreadyRegisteredError(createUserResult.error?.message)) {
    let page = 1;
    while (!authUser) {
      const listed = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
      if (listed.error) {
        throw new Error(listed.error.message);
      }

      authUser =
        listed.data.users.find((user) => user.email?.toLowerCase() === normalizedEmail) ?? null;

      if (authUser || listed.data.users.length < 200) {
        break;
      }

      page += 1;
    }
  }

  if (!authUser) {
    throw new Error(createUserResult.error?.message ?? `Falha ao criar usuario ${input.email}.`);
  }

  const createdUser: SheetUser = {
    id: authUser.id,
    full_name: input.fullName,
    email: normalizedEmail,
    phone: input.phone ?? null,
    district: input.district ?? null,
    role: input.role,
    lider_id: input.liderId ?? null,
  };

  const { error: profileError } = await adminClient.from("users").upsert({
    id: createdUser.id,
    full_name: createdUser.full_name,
    email: createdUser.email,
    phone: createdUser.phone,
    district: createdUser.district,
    role: createdUser.role,
    lider_id: createdUser.lider_id,
    active: true,
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  usersByEmail.set(normalizedEmail, createdUser);
  usersByName.set(normalizedName, createdUser);

  return createdUser;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestBody = request.method === "POST" ? await request.json().catch(() => ({})) : {};
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
    if (!callerProfile || callerProfile.role !== "admin") {
      return jsonResponse({ error: "Apenas admin pode sincronizar equipamentos." }, { status: 403 });
    }

    const uploadedRows = normalizeIncomingRows((requestBody as { rows?: unknown }).rows);
    let csvUrl: string | null = null;
    let rows = uploadedRows;

    if (rows.length === 0) {
      csvUrl = resolveCsvUrl();
      if (!csvUrl) {
        return jsonResponse(
          { error: "Secret GOOGLE_SHEET_CSV_URL ou GOOGLE_SHEET_URL nao configurada e nenhuma planilha foi enviada." },
          { status: 400 },
        );
      }

      const csvResponse = await fetch(csvUrl);
      if (!csvResponse.ok) {
        return jsonResponse(
          { error: `Falha ao baixar planilha: HTTP ${csvResponse.status}.` },
          { status: 400 },
        );
      }

      const csvText = await csvResponse.text();
      rows = parseSheetRows(csvText);
    }

    if (rows.length === 0) {
      return jsonResponse({ error: "Planilha vazia ou sem linhas validas." }, { status: 400 });
    }

    const { data: users, error: usersError } = await adminClient
      .from("users")
      .select("id, full_name, email, phone, district, role, lider_id");

    if (usersError) {
      return jsonResponse({ error: usersError.message }, { status: 400 });
    }

    const allUsers = ((users ?? []) as SheetUser[]);
    const usersByEmail = new Map(allUsers.map((user) => [user.email.toLowerCase(), user]));
    const usersByName = new Map(allUsers.map((user) => [normalizeText(user.full_name), user]));

    const equipmentPayloads: Array<Record<string, unknown>> = [];
    const importedUltimasBySerial = new Map<string, string>();
    const ownerUpdates = new Map<string, Partial<SheetUser>>();
    const crmUpdates = new Map<string, { owner_id: string; coluna: string }>();
    const stats: SyncStats = {
      totalRows: rows.length,
      imported: 0,
      skipped: 0,
      ownersNotFound: 0,
      leadersLinked: 0,
      crmUpdated: 0,
      usersCreated: 0,
    };

    for (const row of rows) {
      const serialNumber = getField(row, ["Serial Number", "Serial"]);
      if (!serialNumber) {
        stats.skipped += 1;
        continue;
      }

      const ownerEmail = getField(row, ["e-mail", "email"]).toLowerCase();
      const ownerName = getField(row, ["Owner"]);
      let owner =
        usersByEmail.get(ownerEmail) ??
        (ownerName ? usersByName.get(normalizeText(ownerName)) : undefined);

      const districtFromSheet = toNullable(getField(row, ["District"]));
      const ownerPhone = toNullable(getField(row, ["Cel #", "Cel", "Phone"]));

      const leaderEmail = getField(row, ["email (leader)", "email leader"]).toLowerCase();
      const leaderName = getField(row, ["Leader"]);
      let leader =
        usersByEmail.get(leaderEmail) ??
        (leaderName ? usersByName.get(normalizeText(leaderName)) : undefined);

      if (!leader && leaderName && isValidEmail(leaderEmail)) {
        leader = await ensureSheetUser(adminClient, usersByEmail, usersByName, {
          fullName: leaderName,
          email: leaderEmail,
          district: districtFromSheet,
          role: "lider",
        });
        stats.usersCreated += 1;
      }

      if (!owner && ownerName && isValidEmail(ownerEmail)) {
        owner = await ensureSheetUser(adminClient, usersByEmail, usersByName, {
          fullName: ownerName,
          email: ownerEmail,
          phone: ownerPhone,
          district: districtFromSheet,
          role: leader && normalizeText(leader.full_name) === normalizeText(ownerName) ? "lider" : "usuario",
          liderId: leader?.id ?? null,
        });
        stats.usersCreated += 1;
      }

      if (!owner) {
        stats.skipped += 1;
        stats.ownersNotFound += 1;
        continue;
      }

      const district = districtFromSheet ?? owner.district ?? null;

      ownerUpdates.set(owner.id, {
        id: owner.id,
        full_name: ownerName || owner.full_name,
        email: owner.email,
        phone: ownerPhone ?? owner.phone,
        district,
        role: owner.role === "admin" || owner.role === "gestor" ? owner.role : leader && normalizeText(owner.full_name) === normalizeText(leader.full_name) ? "lider" : owner.role,
        lider_id: leader?.id ?? owner.lider_id,
      });

      if (leader?.id && owner.lider_id !== leader.id) {
        stats.leadersLinked += 1;
      }

      const statusContato = getField(row, ["STATUS Contato", "Status Contato"]);
      crmUpdates.set(owner.id, {
        owner_id: owner.id,
        coluna: mapContactStatusToColumn(statusContato),
      });

      const ultimaCalibracao = parsePtDate(
        toNullable(getField(row, ["Ultima Calibracao", "Ultima calibração", "Ult. Cal.", "Ult Cal"])),
      );
      const proximaCalibracaoPlanilha = parsePtDate(
        toNullable(getField(row, ["Proxima calibracao", "Próxima calibração", "Prox. Cal.", "Prox Cal"])),
      );
      const proximaCalibracao = proximaCalibracaoPlanilha ?? (ultimaCalibracao ? addDays(ultimaCalibracao, 365) : null);

      if (ultimaCalibracao) {
        importedUltimasBySerial.set(serialNumber, ultimaCalibracao);
      }

      equipmentPayloads.push({
        serial_number: serialNumber,
        equipamento: getField(row, ["Equipamento"]) || "Nao informado",
        brand: toNullable(getField(row, ["Brand"])),
        model: toNullable(getField(row, ["Model"])),
        owner_id: owner.id,
        ultima_calibracao: ultimaCalibracao,
        proxima_calibracao: proximaCalibracao,
        certificado: toNullable(getField(row, ["Certificate", "Certificado"])),
        district,
        region_state: toNullable(getField(row, ["Region/State", "Region State", "UF"])),
        city: toNullable(getField(row, ["City"])),
        customer: toNullable(getField(row, ["Customer"])),
        vendor: toNullable(getField(row, ["Vendor"])),
        observacao: toNullable(getField(row, ["Obs.", "Obs"])),
        status_contato_importado: toNullable(statusContato),
        executado_importado: toNullable(getField(row, ["Executado"])),
        active: !isInactiveStatus(getField(row, ["Status Do equipamento", "Status do equipamento", "Status eqp.", "Status eqp"])),
      });
    }

    if (equipmentPayloads.length === 0) {
      return jsonResponse(
        {
          error: "Nenhuma linha pode ser importada. Verifique se os owners da planilha existem na tabela de usuarios.",
          stats,
        },
        { status: 400 },
      );
    }

    const ownerUpdatePayload = Array.from(ownerUpdates.values()).map((owner) => ({
      id: owner.id,
      full_name: owner.full_name,
      email: owner.email,
      phone: owner.phone ?? null,
      district: owner.district ?? null,
      role: owner.role ?? "usuario",
      lider_id: owner.lider_id ?? null,
      active: true,
    }));

    const { error: ownerUpsertError } = await adminClient.from("users").upsert(ownerUpdatePayload, { onConflict: "id" });
    if (ownerUpsertError) {
      return jsonResponse({ error: ownerUpsertError.message }, { status: 400 });
    }

    const { error: equipamentoUpsertError } = await adminClient
      .from("equipamentos")
      .upsert(equipmentPayloads, { onConflict: "serial_number" });

    if (equipamentoUpsertError) {
      return jsonResponse({ error: equipamentoUpsertError.message }, { status: 400 });
    }

    const importedSerials = equipmentPayloads.map((item) => String(item.serial_number));
    const { data: importedEquipamentos, error: importedEquipamentosError } = await adminClient
      .from("equipamentos")
      .select("id, serial_number")
      .in("serial_number", importedSerials);

    if (importedEquipamentosError) {
      return jsonResponse({ error: importedEquipamentosError.message }, { status: 400 });
    }

    const importedEquipmentList = (importedEquipamentos ?? []) as Array<{ id: string; serial_number: string }>;

    if (importedEquipmentList.length > 0) {
      const { data: existingCalibracoes, error: calibracoesError } = await adminClient
        .from("calibracoes")
        .select("equipamento_id, data_calibracao, realizado")
        .in(
          "equipamento_id",
          importedEquipmentList.map((item) => item.id),
        );

      if (calibracoesError) {
        return jsonResponse({ error: calibracoesError.message }, { status: 400 });
      }

      const existingKeys = new Set(
        ((existingCalibracoes ?? []) as Array<{ equipamento_id: string; data_calibracao: string; realizado: boolean }>).map(
          (item) => `${item.equipamento_id}::${item.data_calibracao}::${item.realizado ? "1" : "0"}`,
        ),
      );

      const calibracaoPayload = importedEquipmentList.flatMap((item) => {
        const ultimaCalibracao = importedUltimasBySerial.get(item.serial_number);
        if (!ultimaCalibracao) {
          return [];
        }

        const key = `${item.id}::${ultimaCalibracao}::1`;
        if (existingKeys.has(key)) {
          return [];
        }

        return [
          {
            equipamento_id: item.id,
            data_calibracao: ultimaCalibracao,
            realizado: true,
          },
        ];
      });

      if (calibracaoPayload.length > 0) {
        const { error: insertCalibracoesError } = await adminClient.from("calibracoes").insert(calibracaoPayload);
        if (insertCalibracoesError) {
          return jsonResponse({ error: insertCalibracoesError.message }, { status: 400 });
        }
      }
    }

    const crmPayload = Array.from(crmUpdates.values()).map((item) => ({
      owner_id: item.owner_id,
      coluna: item.coluna,
    }));

    if (crmPayload.length > 0) {
      const { error: crmError } = await adminClient.from("crm_cards").upsert(crmPayload, { onConflict: "owner_id" });
      if (crmError) {
        return jsonResponse({ error: crmError.message }, { status: 400 });
      }
      stats.crmUpdated = crmPayload.length;
    }

    stats.imported = equipmentPayloads.length;

    await adminClient.rpc("registrar_log", {
      p_user_id: caller.id,
      p_acao: "Sincronizou equipamentos da planilha",
      p_tabela: "equipamentos",
      p_registro_id: null,
      p_valor_anterior: null,
      p_valor_novo: stats,
    });

    return jsonResponse({
      success: true,
      message: `${stats.imported} equipamento(s) sincronizado(s) com sucesso.`,
      stats,
      csvUrlUsed: csvUrl,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro interno na sincronizacao." },
      { status: 500 },
    );
  }
});

