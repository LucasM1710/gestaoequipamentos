-- Vínculo com o ERPNext (formato "EQUIPC-00033"), único quando preenchido
alter table public.equipamentos
  add column if not exists erpnext_equipment_id text unique,
  add column if not exists erpnext_anexo_certificado text;

-- Estado da última sincronização periódica com o ERPNext (linha única / singleton)
create table if not exists public.erpnext_sync_state (
  id boolean primary key default true check (id),
  last_synced_at timestamptz,
  last_run_started_at timestamptz,
  last_run_status text,
  last_error text
);

insert into public.erpnext_sync_state (id, last_synced_at, last_run_status)
values (true, null, 'never_run')
on conflict (id) do nothing;

alter table public.erpnext_sync_state enable row level security;
-- Sem policies para authenticated/anon: apenas as Edge Functions (service role) acessam esta tabela.

-- Recriar a view incluindo as duas colunas novas (mesmo padrão das migrations anteriores)
drop view if exists public.equipamentos_visao;

create view public.equipamentos_visao
with (security_invoker = true) as
select
  e.id,
  e.serial_number,
  e.equipamento,
  e.brand,
  e.model,
  e.owner_id,
  e.ultima_calibracao,
  e.proxima_calibracao,
  e.certificado,
  e.erpnext_equipment_id,
  e.erpnext_anexo_certificado,
  e.active,
  e.created_at,
  e.updated_at,
  e.district,
  e.region_state,
  e.city,
  e.customer,
  e.vendor,
  e.observacao,
  e.status_contato_importado,
  e.executado_importado,
  owner.full_name as owner_name,
  owner.email as owner_email,
  owner.phone as owner_phone,
  owner.district as owner_district,
  lider.full_name as lider_name,
  lider.email as lider_email,
  case
    when e.proxima_calibracao is null then null
    else (e.proxima_calibracao - current_date)
  end as dias_para_vencer,
  case
    when exists (
      select 1
      from public.calibracoes c
      where c.equipamento_id = e.id
        and c.realizado = false
        and c.data_calibracao >= current_date
    ) then 'agendado'
    when e.proxima_calibracao is null then 'calibrado'
    when e.proxima_calibracao < current_date then 'vencido'
    when (e.proxima_calibracao - current_date) <= 45 then 'critico'
    when (e.proxima_calibracao - current_date) <= 60 then 'alerta_60'
    else 'calibrado'
  end as status_calibracao,
  coalesce(
    nullif(e.status_contato_importado, ''),
    case crm.coluna
      when 'sem_contato' then 'Sem contato'
      when 'aguardando_retorno' then 'Aguardando retorno'
      when 'em_contato' then 'Em contato'
      when 'agendado' then 'Agendado'
      when 'calibrado' then 'Realizado'
      when 'perdido' then 'Perdido'
      else 'Sem contato'
    end
  ) as status_contato,
  coalesce(nullif(e.executado_importado, ''), cal.executado::text, '0') as executado
from public.equipamentos e
join public.users owner on owner.id = e.owner_id
left join public.users lider on lider.id = owner.lider_id
left join public.crm_cards crm on crm.owner_id = e.owner_id
left join lateral (
  select count(*)::int as executado
  from public.calibracoes c
  where c.equipamento_id = e.id
    and c.realizado = true
) cal on true;

grant select on public.equipamentos_visao to authenticated;
