-- TaskMatch roles, permissions and away status.
-- Run once in the Supabase SQL Editor, AFTER rls.sql (safe to re-run).
--
-- What it does:
--   1. Adds students.away_until (the last day someone is away).
--   2. Moves every account's role into app_metadata, which only the server can change.
--      Existing leaders become admins; everyone else becomes a member.
--   3. Replaces the "any signed-in user can change anything" rules from rls.sql with rules per role:
--        admin, lead : manage tasks, people, groups, skills and assignments; read the audit trail
--        member      : change only their own skills, photo and away date; comment
--        viewer      : read only
--   4. Stamps every audit-log row with the real signed-in user, so entries can't be forged.
--
-- Why: until now the role sat in user_metadata, which any signed-in user can edit about
-- themselves from the browser. That meant any student could make themselves a leader.
--
-- The same permission table lives in taskmatch/app/lib/permissions.json and taskmatch-api/main.py.

-- 1. Away status ------------------------------------------------------------------------------
alter table public.students add column if not exists away_until date;

-- 2. Roles in app_metadata -----------------------------------------------------------------------
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', case when raw_user_meta_data->>'role' = 'leader' then 'admin' else 'member' end)
where coalesce(raw_app_meta_data->>'role', '') not in ('admin', 'lead', 'member', 'viewer');

-- The role is read from auth.users on every check (not from the login token), so a role
-- change takes effect straight away instead of when the user's token next refreshes.
create or replace function public.tm_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.raw_app_meta_data->>'role' from auth.users u where u.id = auth.uid()),
    'member')
$$;

create or replace function public.tm_can(permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case permission
    when 'tasks.manage'  then public.tm_role() in ('admin', 'lead')
    when 'people.manage' then public.tm_role() in ('admin', 'lead')
    when 'assign.others' then public.tm_role() in ('admin', 'lead')
    when 'insights.view' then public.tm_role() in ('admin', 'lead')
    when 'audit.view'    then public.tm_role() in ('admin', 'lead')
    when 'team.manage'   then public.tm_role() = 'admin'
    when 'work.self'     then public.tm_role() in ('admin', 'lead', 'member')
    when 'comment'       then public.tm_role() in ('admin', 'lead', 'member')
    when 'away.self'     then public.tm_role() in ('admin', 'lead', 'member')
    else false
  end
$$;

-- The roster row that belongs to the signed-in user (matched by email), if any.
create or replace function public.tm_my_student_id() returns text
language sql stable security definer set search_path = '' as $$
  select s.id::text from public.students s where lower(s.email) = lower(auth.jwt()->>'email') limit 1
$$;

-- 3. Policies ----------------------------------------------------------------------------------
-- Drop the blanket policies from rls.sql.
do $$
declare t text;
begin
  foreach t in array array['students', 'tasks', 'assignments', 'skills', 'student_skills', 'task_skills', 'groups', 'task_comments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Tasks, their skills, groups and the skill list: leads and admins.
do $$
declare t text;
begin
  foreach t in array array['tasks', 'task_skills', 'groups', 'skills', 'assignments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_manage', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.tm_can(''tasks.manage'')) with check (public.tm_can(''tasks.manage''))',
      t || '_manage', t);
  end loop;
end $$;
-- (Assignments are normally written by the API with the service key, which skips these rules.)

-- People: leads and admins add, change and remove anyone; members change their own row.
drop policy if exists students_manage on public.students;
create policy students_manage on public.students for all to authenticated
  using (public.tm_can('people.manage')) with check (public.tm_can('people.manage'));
drop policy if exists students_self_update on public.students;
create policy students_self_update on public.students for update to authenticated
  using (id::text = public.tm_my_student_id() and public.tm_can('away.self'))
  with check (id::text = public.tm_my_student_id());

-- A member editing their own row may only change their photo and away date.
create or replace function public.tm_students_self_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.tm_can('people.manage') then return new; end if;
  if (to_jsonb(new) - 'avatar_url' - 'away_until') <> (to_jsonb(old) - 'avatar_url' - 'away_until') then
    raise exception 'You can only change your own photo and away date.';
  end if;
  return new;
end $$;
drop trigger if exists tm_students_self_guard on public.students;
create trigger tm_students_self_guard before update on public.students
  for each row execute function public.tm_students_self_guard();

-- Skills held: leads and admins for anyone; members for themselves.
drop policy if exists student_skills_manage on public.student_skills;
create policy student_skills_manage on public.student_skills for all to authenticated
  using (public.tm_can('people.manage') or (student_id::text = public.tm_my_student_id() and public.tm_can('work.self')))
  with check (public.tm_can('people.manage') or (student_id::text = public.tm_my_student_id() and public.tm_can('work.self')));

-- Comments: anyone who can comment, as themselves. No edits or deletes.
drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (public.tm_can('comment') and lower(author_email) = lower(auth.jwt()->>'email'));

-- 4. Audit trail --------------------------------------------------------------------------------
-- Only roles with audit.view can read it. Anyone signed in can add to it (every action logs),
-- but the actor is always stamped from the login, never taken from the browser.
drop policy if exists activity_logs_authenticated_select on public.activity_logs;
drop policy if exists activity_logs_audit_select on public.activity_logs;
create policy activity_logs_audit_select on public.activity_logs
  for select to authenticated using (public.tm_can('audit.view'));

create or replace function public.tm_stamp_actor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then          -- browser insert; the API (service key) has no auth.uid()
    new.actor_email := auth.jwt()->>'email';
    new.actor_role := public.tm_role();
  end if;
  return new;
end $$;
drop trigger if exists tm_stamp_actor on public.activity_logs;
create trigger tm_stamp_actor before insert on public.activity_logs
  for each row execute function public.tm_stamp_actor();

-- 5. Check -------------------------------------------------------------------------------------
-- Everyone's role after the move:
select email, raw_app_meta_data->>'role' as role from auth.users order by 2, 1;
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;
