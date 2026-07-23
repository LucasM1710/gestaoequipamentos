-- Aplica em UMA unica operacao todas as calibracoes vindas do ERPNext, em vez de
-- um UPDATE por equipamento (que estourava o limite de CPU da Edge Function).
--
-- p_registros e um array JSON no formato:
-- [{ "erpnext_equipment_id": "EQUIPC-00033", "data_cal": "2026-07-01",
--    "data_cal_recomendada": "2027-07-01", "os_name": "OS-55049",
--    "anexo_certificado": "/files/cert.pdf" }, ...]
--
-- Retorna a lista de erpnext_equipment_id que NAO encontraram equipamento vinculado,
-- para que a Edge Function registre em log sem precisar de consultas extras.
create or replace function public.aplicar_sync_erpnext(p_registros jsonb)
returns table (atualizados integer, sem_vinculo text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atualizados integer;
  v_sem_vinculo text[];
begin
  with entrada as (
    select
      r->>'erpnext_equipment_id' as erpnext_equipment_id,
      nullif(r->>'data_cal', '')::date as data_cal,
      nullif(r->>'data_cal_recomendada', '')::date as data_cal_recomendada,
      nullif(r->>'os_name', '') as os_name,
      nullif(r->>'anexo_certificado', '') as anexo_certificado
    from jsonb_array_elements(coalesce(p_registros, '[]'::jsonb)) as r
  ),
  aplicado as (
    update public.equipamentos e
    set
      ultima_calibracao = entrada.data_cal,
      proxima_calibracao = entrada.data_cal_recomendada,
      certificado = entrada.os_name,
      erpnext_anexo_certificado = entrada.anexo_certificado
    from entrada
    where e.erpnext_equipment_id = entrada.erpnext_equipment_id
    returning entrada.erpnext_equipment_id
  )
  select
    (select count(*)::integer from aplicado),
    (
      select coalesce(array_agg(entrada.erpnext_equipment_id), '{}')
      from entrada
      where not exists (
        select 1
        from public.equipamentos e
        where e.erpnext_equipment_id = entrada.erpnext_equipment_id
      )
    )
  into v_atualizados, v_sem_vinculo;

  return query select v_atualizados, v_sem_vinculo;
end;
$$;

revoke all on function public.aplicar_sync_erpnext(jsonb) from public, anon, authenticated;
