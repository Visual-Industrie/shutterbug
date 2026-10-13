-- Close the Supabase Data API (PostgREST) path to the public schema.
-- All data access goes through /api, which connects via DATABASE_URL as the
-- postgres role and bypasses RLS.

-- Enable RLS on every table in public (no policies = deny all for anon/authenticated)
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Belt and braces: remove API role grants
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
