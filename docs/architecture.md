# Arquitetura

## Visao geral
- Frontend SPA React/Vite na raiz do repositorio.
- Backend versionado em `supabase/`, com migrations SQL, RLS e Edge Functions.
- Integracoes externas: Supabase Auth, Resend para e-mails e Vercel para deploy.

## Fluxos principais
- Auth carrega o perfil da tabela `public.users` e deriva permissoes no cliente.
- Equipamentos usam `equipamentos_visao` para status calculado em tempo real.
- CRM agrupa owners por card unico, com historico em `crm_interactions`.
- Rotinas automaticas usam `pg_cron` -> `pg_net` -> Edge Functions.
- Equipamentos sao vinculados ao ERPNext (Frappe) via `erpnext_equipment_id` (preenchido uma vez por `bootstrap-erpnext-link`); a Edge Function `sync-os-erpnext` roda a cada 30 min (pull incremental por `modified`, estado em `erpnext_sync_state`) e atualiza `ultima_calibracao`, `proxima_calibracao` e `certificado` a partir das Ordens de Servico Interna/Externa finalizadas no ERPNext.

## Decisoes
- `gestor` de escalonamento e definido por `district`.
- `status_calibracao` nao e persistido na tabela base.
- Convite de usuario usa link de redefinicao, sem senha em texto puro.

