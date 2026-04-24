import { getAdminClient, getUserClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function isRateLimitError(message: string) {
  const value = message.toLowerCase();
  return value.includes("rate limit") || value.includes("too many requests");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

    const { data: callerProfile } = await adminClient
      .from("users")
      .select("id, role")
      .eq("id", caller.id)
      .single();

    if (!callerProfile || !["admin", "gestor"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Apenas admin ou gestor podem provisionar usuarios." }, { status: 403 });
    }

    const body = (await request.json()) as {
      fullName: string;
      email: string;
      phone?: string | null;
      district?: string | null;
      role: "admin" | "gestor" | "lider" | "usuario";
      liderId?: string | null;
    };

    if (!body.fullName || !body.email || !body.role) {
      return jsonResponse({ error: "Payload invalido." }, { status: 400 });
    }

    if (!isValidEmail(body.email)) {
      return jsonResponse({ error: "E-mail invalido." }, { status: 400 });
    }

    const { data: existingProfile } = await adminClient
      .from("users")
      .select("id")
      .eq("email", body.email)
      .maybeSingle();

    if (existingProfile?.id) {
      return jsonResponse({ error: "Ja existe um usuario cadastrado com este e-mail." }, { status: 409 });
    }

    let onboardingMode: "invite_email" | "manual_link" = "invite_email";
    let manualActionLink: string | null = null;
    let onboardingWarning: string | null = null;
    let newUserId: string | null = null;

    const invite = await adminClient.auth.admin.inviteUserByEmail(body.email, {
      data: {
        full_name: body.fullName,
      },
      redirectTo: `${Deno.env.get("APP_URL") ?? ""}/redefinir-senha`,
    });

    if (!invite.error && invite.data.user) {
      newUserId = invite.data.user.id;
    } else if (isRateLimitError(invite.error?.message ?? "")) {
      const createUserResult = await adminClient.auth.admin.createUser({
        email: body.email,
        password: `${crypto.randomUUID()}Aa!`,
        email_confirm: true,
        user_metadata: {
          full_name: body.fullName,
        },
      });

      if (createUserResult.error || !createUserResult.data.user) {
        return jsonResponse(
          { error: createUserResult.error?.message ?? "Falha ao criar usuario apos rate limit." },
          { status: 400 },
        );
      }

      newUserId = createUserResult.data.user.id;
      onboardingMode = "manual_link";

      const recoveryLink = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: body.email,
        options: {
          redirectTo: `${Deno.env.get("APP_URL") ?? ""}/redefinir-senha`,
        },
      });

      if (recoveryLink.error) {
        onboardingWarning = `Usuario criado, mas falhou ao gerar link manual: ${recoveryLink.error.message}`;
      } else {
        manualActionLink = recoveryLink.data.properties?.action_link ?? null;
      }
    } else {
      return jsonResponse({ error: invite.error?.message ?? "Falha ao convidar usuario." }, { status: 400 });
    }

    if (!newUserId) {
      return jsonResponse({ error: "Nao foi possivel determinar o usuario criado." }, { status: 500 });
    }

    const { error: upsertError } = await adminClient.from("users").upsert({
      id: newUserId,
      full_name: body.fullName,
      email: body.email,
      phone: body.phone ?? null,
      district: body.district ?? null,
      role: body.role,
      lider_id: body.role === "usuario" ? body.liderId ?? null : null,
      active: true,
    });

    if (upsertError) {
      return jsonResponse({ error: upsertError.message }, { status: 400 });
    }

    await adminClient.rpc("registrar_log", {
      p_user_id: caller.id,
      p_acao: "Criou usuario",
      p_tabela: "users",
      p_registro_id: newUserId,
      p_valor_anterior: null,
      p_valor_novo: {
        email: body.email,
        role: body.role,
        onboarding_mode: onboardingMode,
      },
    });

    return jsonResponse({
      success: true,
      userId: newUserId,
      invitedAt: new Date().toISOString(),
      onboardingMode,
      manualActionLink,
      onboardingWarning,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Erro interno.",
      },
      { status: 500 },
    );
  }
});
