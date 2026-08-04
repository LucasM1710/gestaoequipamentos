-- Grava em UMA operacao os vinculos equipamento -> codigo do ERP (erpnext_equipment_id),
-- em vez de um UPDATE por equipamento (evita estourar CPU quando ha muitos para vincular,
-- ex. logo apos um reset + reimport de planilha).
--
-- Seguranca: so preenche onde erpnext_equipment_id esta NULL — nunca sobrescreve um vinculo
-- ja existente.
--
-- p_vinculos: [{ "equipamento_id": "<uuid>", "erpnext_equipment_id": "EQUIPC-00033" }, ...]
create or replace function public.aplicar_vinculos_erpnext(p_vinculos jsonb)
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
      (r->>'equipamento_id')::uuid as equipamento_id,
      nullif(r->>'erpnext_equipment_id', '') as erpnext_equipment_id
    from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) as r
  ),
  aplicado as (
    update public.equipamentos e
    set erpnext_equipment_id = entrada.erpnext_equipment_id
    from entrada
    where e.id = entrada.equipamento_id
      and e.erpnext_equipment_id is null
      and entrada.erpnext_equipment_id is not null
    returning 1
  )
  select count(*)::integer into v_total from aplicado;

  return v_total;
end;
$$;

revoke all on function public.aplicar_vinculos_erpnext(jsonb) from public, anon, authenticated;
