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
- Publicar Edge Functions:
  - `admin-create-user`
  - `dashboard-data`
  - `reset-equipamentos`
  - `resend-webhook`
  - `run-calibration-notifications`
  - `send-leader-weekly-summary`
  - `sync-equipamentos-sheet`
  - `sync-users-sheet`

## Agendamentos
- Validar extensoes `pg_cron` e `pg_net`.
- Confirmar a execucao diaria e semanal apos o deploy.
