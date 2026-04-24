drop policy if exists "crm_cards_admin_or_lider_select" on public.crm_cards;
drop policy if exists "crm_cards_admin_gestor_or_lider_select" on public.crm_cards;

create policy "crm_cards_admin_gestor_or_lider_select"
on public.crm_cards
for select
using (
  public.current_role() = 'admin'
  or public.current_role() = 'gestor'
  or (public.current_role() = 'lider' and public.user_can_access_owner(owner_id))
);

drop policy if exists "crm_interactions_admin_or_lider_select" on public.crm_interactions;
drop policy if exists "crm_interactions_admin_gestor_or_lider_select" on public.crm_interactions;

create policy "crm_interactions_admin_gestor_or_lider_select"
on public.crm_interactions
for select
using (
  public.current_role() = 'admin'
  or public.current_role() = 'gestor'
  or (public.current_role() = 'lider' and public.user_can_access_owner(owner_id))
);

drop policy if exists "crm_interaction_attachments_select_scoped" on public.crm_interaction_attachments;

create policy "crm_interaction_attachments_select_scoped"
on public.crm_interaction_attachments
for select
using (
  public.current_role() = 'admin'
  or public.current_role() = 'gestor'
  or (public.current_role() = 'lider' and public.user_can_access_owner(owner_id))
);

drop policy if exists "crm_imagens_select_scoped" on storage.objects;

create policy "crm_imagens_select_scoped"
on storage.objects
for select
using (
  bucket_id = 'crm-imagens'
  and exists (
    select 1
    from public.crm_interaction_attachments a
    where a.caminho_storage = storage.objects.name
      and (
        public.current_role() = 'admin'
        or public.current_role() = 'gestor'
        or (public.current_role() = 'lider' and public.user_can_access_owner(a.owner_id))
      )
  )
);
