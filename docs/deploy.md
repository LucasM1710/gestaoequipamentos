# Deploy

## Frontend
- Deploy em Vercel.
- Configurar `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_APP_URL`.

## Supabase
- Aplicar migrations em `supabase/migrations`.
- Registrar secrets com prefixo `SB_`:
  - `SB_PROJECT_URL`
  - `SB_SERVICE_ROLE_KEY`
  - `SB_ANON_KEY`
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `APP_URL`
  - `RESET_EQUIPAMENTOS_PASSWORD`
  - `ERPNEXT_BASE_URL`
  - `ERPNEXT_API_KEY`
  - `ERPNEXT_API_SECRET`
- Publicar Edge Functions:
  - `admin-create-user`
  - `dashboard-data`
  - `reset-equipamentos`
  - `resend-webhook`
  - `run-calibration-notifications`
  - `send-leader-weekly-summary`
  - `sync-equipamentos-sheet`
  - `sync-users-sheet`
  - `bootstrap-erpnext-link`
  - `sync-os-erpnext`

## Agendamentos
- Validar extensoes `pg_cron` e `pg_net`.
- Confirmar a execucao diaria e semanal apos o deploy.
- Apos aplicar as migrations, rodar manualmente `select public.schedule_automation_jobs('<SB_PROJECT_URL>', '<SB_ANON_KEY>');` no SQL editor do Supabase para (re)agendar os jobs, incluindo `er_sync_os_erpnext` (a cada 30 min).

## Integracao ERPNext
- `bootstrap-erpnext-link` e executada manualmente uma unica vez (ou mais, com seguranca) por um admin autenticado, para vincular os equipamentos existentes ao ERPNext via `erpnext_equipment_id`. Casos ambiguos ou sem correspondencia voltam na resposta da chamada para revisao manual.
- `sync-os-erpnext` roda a cada 30 min via `pg_cron`/`pg_net`, busca de forma incremental (`modified` desde a ultima execucao, guardado em `erpnext_sync_state`) as Ordens de Servico Interna/Externa finalizadas no ERPNext e atualiza `ultima_calibracao`, `proxima_calibracao` e `certificado` dos equipamentos ja vinculados. Equipamentos sem vinculo aparecem em `/logs` para revisao.
