-- Casos de auto-vinculo (equipamento -> ERPNext) que NAO foram vinculados automaticamente
-- porque a verificacao de seguranca nao confirmou (serie divergente, OS nao encontrada,
-- ID ja em uso). Ficam aqui para revisao manual — a rotina nunca decide sozinha nesses casos.
create table if not exists public.erpnext_vinculo_revisao (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos (id) on delete cascade,
  serial_number text,
  customer text,
  certificado text,
  os_consultada text,
  serie_number_erp text,
  equipamento_id_erp text,
  motivo text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_erpnext_revisao_equipamento on public.erpnext_vinculo_revisao (equipamento_id);

alter table public.erpnext_vinculo_revisao enable row level security;

-- Leitura para admin/gestor (mesma politica de visibilidade dos relatorios de gestao).
drop policy if exists "erpnext_revisao_select" on public.erpnext_vinculo_revisao;
create policy "erpnext_revisao_select"
on public.erpnext_vinculo_revisao
for select
using (public.current_role() in ('admin', 'gestor'));

-- Escrita apenas pelas Edge Functions (service role). Sem policy de insert/update/delete.

grant select on public.erpnext_vinculo_revisao to authenticated;
