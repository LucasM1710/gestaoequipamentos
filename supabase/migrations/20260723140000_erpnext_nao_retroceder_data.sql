-- Ao passar a sincronizar o historico completo do ERPNext (e nao so 2026), uma OS antiga
-- poderia sobrescrever uma data de calibracao mais recente vinda da planilha, fazendo o
-- equipamento "voltar no tempo" e mudar de status indevidamente.
--
-- Regra: a OS so atualiza os campos do equipamento quando for igual ou mais recente que a
-- ultima calibracao ja registrada. O historico de OS (erpnext_ordens_servico) continua
-- recebendo todas as OS, entao o certificado fica disponivel mesmo nesses casos.
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
      and entrada.data_cal is not null
      and (e.ultima_calibracao is null or entrada.data_cal >= e.ultima_calibracao)
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
