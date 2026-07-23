-- Historico de Ordens de Servico vindas do ERPNext.
--
-- Tabela SEPARADA de public.calibracoes de proposito: `calibracoes` alimenta o calculo de
-- `status_calibracao` e `executado` na view equipamentos_visao. Gravar dados do ERP la
-- alteraria silenciosamente o status de todos os equipamentos. Aqui o historico do ERP
-- fica isolado, sem efeito colateral no comportamento existente.
create table if not exists public.erpnext_ordens_servico (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos (id) on delete cascade,
  erpnext_equipment_id text not null,
  os_name text not null unique,
  doctype text not null,
  data_cal date,
  data_cal_recomendada date,
  anexo_certificado text,
  synced_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_erpnext_os_equipamento_id on public.erpnext_ordens_servico (equipamento_id);
create index if not exists idx_erpnext_os_data_cal on public.erpnext_ordens_servico (data_cal desc);

alter table public.erpnext_ordens_servico enable row level security;

-- Mesma regra de visibilidade dos equipamentos: admin/gestor veem tudo, lider ve do seu
-- grupo, usuario ve apenas os proprios. Reaproveita user_can_access_owner ja existente.
drop policy if exists "erpnext_os_select_scoped" on public.erpnext_ordens_servico;
create policy "erpnext_os_select_scoped"
on public.erpnext_ordens_servico
for select
using (
  exists (
    select 1
    from public.equipamentos e
    where e.id = erpnext_ordens_servico.equipamento_id
      and public.user_can_access_owner(e.owner_id)
  )
);

-- Escrita apenas pelas Edge Functions (service role). Sem policy de insert/update/delete.

grant select on public.erpnext_ordens_servico to authenticated;

-- Grava/atualiza em lote o historico de OS vindo do ERPNext, numa unica operacao.
-- p_registros: [{ "erpnext_equipment_id": "...", "os_name": "OS-1", "doctype": "...",
--                 "data_cal": "2026-07-20", "data_cal_recomendada": "2027-07-20",
--                 "anexo_certificado": "/files/x.pdf" }, ...]
create or replace function public.aplicar_os_erpnext(p_registros jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  with entrada as (
    select
      r->>'erpnext_equipment_id' as erpnext_equipment_id,
      r->>'os_name' as os_name,
      coalesce(nullif(r->>'doctype', ''), 'desconhecido') as doctype,
      nullif(r->>'data_cal', '')::date as data_cal,
      nullif(r->>'data_cal_recomendada', '')::date as data_cal_recomendada,
      nullif(r->>'anexo_certificado', '') as anexo_certificado
    from jsonb_array_elements(coalesce(p_registros, '[]'::jsonb)) as r
  ),
  resolvido as (
    select e.id as equipamento_id, entrada.*
    from entrada
    join public.equipamentos e on e.erpnext_equipment_id = entrada.erpnext_equipment_id
  ),
  gravado as (
    insert into public.erpnext_ordens_servico as alvo (
      equipamento_id, erpnext_equipment_id, os_name, doctype,
      data_cal, data_cal_recomendada, anexo_certificado, synced_at
    )
    select
      resolvido.equipamento_id, resolvido.erpnext_equipment_id, resolvido.os_name, resolvido.doctype,
      resolvido.data_cal, resolvido.data_cal_recomendada, resolvido.anexo_certificado,
      timezone('utc', now())
    from resolvido
    on conflict (os_name) do update
      set equipamento_id = excluded.equipamento_id,
          erpnext_equipment_id = excluded.erpnext_equipment_id,
          doctype = excluded.doctype,
          data_cal = excluded.data_cal,
          data_cal_recomendada = excluded.data_cal_recomendada,
          anexo_certificado = excluded.anexo_certificado,
          synced_at = timezone('utc', now())
    returning 1
  )
  select count(*)::integer into v_total from gravado;

  return v_total;
end;
$$;

revoke all on function public.aplicar_os_erpnext(jsonb) from public, anon, authenticated;
