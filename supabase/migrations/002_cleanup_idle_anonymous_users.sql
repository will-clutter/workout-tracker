-- Weekly cleanup of anonymous users nobody has used for a long time (180 days).
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run (idempotent).
--
-- Only anonymous users are ever touched: anyone who added an email is kept. Deleting a user
-- also deletes all of their rows (every table cascades from auth.users).
--
-- "Used" means signing in OR refreshing a session. Signing in alone is not enough, because
-- an app that is open every day only signs in once and then just refreshes. So a user is idle
-- only if their last sign-in AND every session refresh AND every refresh token is older than
-- the window. (Sessions are read as JSON so this still works if a column differs by version.)

-- Needs the pg_cron extension. If this line errors, switch it on in Dashboard > Database > Extensions.
create extension if not exists pg_cron with schema pg_catalog;

-- PREVIEW (read-only): how many users would be deleted right now? Run this first if you like.
--   select count(*) from auth.users u
--   where u.is_anonymous
--     and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '180 days'
--     and not exists (select 1 from auth.sessions s where s.user_id = u.id
--           and greatest(s.created_at, s.updated_at, (to_jsonb(s) ->> 'refreshed_at')::timestamptz) >= now() - interval '180 days')
--     and not exists (select 1 from auth.refresh_tokens t where t.user_id::text = u.id::text
--           and t.created_at >= now() - interval '180 days');

-- Runs Sundays at 03:17 UTC. Re-running this file replaces the job of the same name.
select cron.schedule(
  'delete-idle-anonymous-users',
  '17 3 * * 0',
  $cleanup$
  delete from auth.users
  where id in (
    select u.id from auth.users u
    where u.is_anonymous
      and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '180 days'
      and not exists (
        select 1 from auth.sessions s
        where s.user_id = u.id
          and greatest(s.created_at, s.updated_at, (to_jsonb(s) ->> 'refreshed_at')::timestamptz) >= now() - interval '180 days')
      and not exists (
        select 1 from auth.refresh_tokens t
        where t.user_id::text = u.id::text
          and t.created_at >= now() - interval '180 days')
    limit 500  -- a batch at a time; the next weekly run continues
  );
  $cleanup$
);
