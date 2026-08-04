-- Vinculo manual (admin) de um equipamento ao codigo do ERP, a partir da tela de revisao.
-- Valida admin, impede duplicar um codigo ja usado, grava o vinculo e remove a linha de revisao.
create or replace function public.vincular_equipamento_manual(p_equipamento_id uuid, p_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := nullif(trim(p_codigo), '');
begin
  if public.current_role() <> 'admin' then
    raise exception 'Apenas admin pode vincular equipamentos.';
  end if;

  if v_codigo is null then
    raise exception 'Informe o codigo do equipamento no ERP.';
  end if;

  if exists (
    select 1 from public.equipamentos
    where erpnext_equipment_id = v_codigo and id <> p_equipamento_id
  ) then
    raise exception 'Este codigo ja esta vinculado a outro equipamento.';
  end if;

  update public.equipamentos
    set erpnext_equipment_id = v_codigo
    where id = p_equipamento_id;

  delete from public.erpnext_vinculo_revisao where equipamento_id = p_equipamento_id;
end;
$$;

grant execute on function public.vincular_equipamento_manual(uuid, text) to authenticated;
