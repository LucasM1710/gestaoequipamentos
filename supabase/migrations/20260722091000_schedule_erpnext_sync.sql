create or replace function public.schedule_automation_jobs(p_project_url text, p_anon_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.upsert_edge_job(
    'er_run_calibration_notifications',
    '0 8 * * *',
    'run-calibration-notifications',
    p_project_url,
    p_anon_key
  );

  perform public.upsert_edge_job(
    'er_send_leader_weekly_summary',
    '0 8 * * 1',
    'send-leader-weekly-summary',
    p_project_url,
    p_anon_key
  );

  perform public.upsert_edge_job(
    'er_sync_os_erpnext',
    '*/30 * * * *',
    'sync-os-erpnext',
    p_project_url,
    p_anon_key
  );
end;
$$;
