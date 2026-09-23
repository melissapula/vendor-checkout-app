-- Free-tier Supabase projects auto-pause after 7 days with no activity.
-- Supabase's own docs count "API calls to your project" as activity but
-- are vague on whether an internal pg_cron query qualifies — so instead of
-- a bare `select 1` from inside the database, this schedules a real HTTP
-- request (via pg_net) to this project's own REST endpoint every 3 days,
-- which unambiguously counts. Cheap insurance while staying on the free
-- plan during beta; drop this (`select cron.unschedule('keepalive-ping');`)
-- if/when the project moves to a paid plan, where pausing doesn't apply.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Replace YOUR-PROJECT-REF and YOUR-ANON-KEY below with this project's
-- actual values (Settings -> API in the Supabase dashboard) before running
-- this in the SQL editor — not committed here since they're project-specific.
select cron.schedule(
  'keepalive-ping',
  '0 6 */3 * *', -- 06:00 UTC every 3rd day — well inside the 7-day window
  $$
  select net.http_get(
    url := 'https://YOUR-PROJECT-REF.supabase.co/rest/v1/',
    headers := jsonb_build_object('apikey', 'YOUR-ANON-KEY')
  );
  $$
);

-- To check it's running: select * from cron.job;
-- To see recent run results: select * from cron.job_run_details order by start_time desc limit 5;
