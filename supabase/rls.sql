-- TaskMatch row-level security.
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Before running: set SUPABASE_SERVICE_ROLE_KEY for taskmatch-api. The API's table
-- queries use that key, and it bypasses RLS. Without it the API's queries return nothing.
--
-- Effect: the publishable key alone (no login) can no longer read or write any table.
-- A signed-in user keeps the same access the app gives them today, because the
-- frontend still reads and writes these tables directly. Role-specific rules (for example,
-- only leaders create tasks) are a later step.

-- 1. Turn RLS on everywhere.
alter table public.students       enable row level security;
alter table public.tasks          enable row level security;
alter table public.assignments    enable row level security;
alter table public.skills         enable row level security;
alter table public.student_skills enable row level security;
alter table public.task_skills    enable row level security;
alter table public.groups         enable row level security;
alter table public.task_comments  enable row level security;
alter table public.activity_logs  enable row level security;

-- 2. Replace the old activity_logs policies, which let anyone read every log and add new ones.
drop policy if exists logs_select on public.activity_logs;
drop policy if exists logs_insert on public.activity_logs;

-- 3. Signed-in users only.
do $$
declare t text;
begin
  foreach t in array array[
    'students', 'tasks', 'assignments', 'skills', 'student_skills',
    'task_skills', 'groups', 'task_comments'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

-- Logs are append-only from the browser: read and insert, no edits or deletes.
drop policy if exists activity_logs_authenticated_select on public.activity_logs;
create policy activity_logs_authenticated_select on public.activity_logs
  for select to authenticated using (true);
drop policy if exists activity_logs_authenticated_insert on public.activity_logs;
create policy activity_logs_authenticated_insert on public.activity_logs
  for insert to authenticated with check (true);

-- 4. Check: every row should say true, and no policy should list anon or public.
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
-- select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by 1;
