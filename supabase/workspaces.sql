-- TaskMatch workspaces and projects (multi-org).
-- Run once in the Supabase SQL Editor, AFTER rls.sql and roles.sql (safe to re-run).
--
-- What it does:
--   1. Adds workspaces (one per team or company), their members with a role in each, invite
--      codes, and projects inside a workspace.
--   2. Gives every table a workspace_id and moves all existing data into one first workspace.
--      Every existing account joins it with the role it has today.
--   3. Replaces the per-role rules from roles.sql with rules that also check the workspace:
--      you only ever see and change rows in the workspace you're working in, and your role
--      is your role in that workspace.
--
-- How "the workspace you're working in" works: the API stores it in the account's
-- app_metadata.workspace_id (only the server can write that) after checking you're a member.
-- Every rule below re-checks membership on each request, so removing someone from a
-- workspace takes effect straight away.

-- 1. Tables ----------------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  email text,
  role text not null default 'member' check (role in ('admin', 'lead', 'member', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user on public.workspace_members (user_id);

create table if not exists public.workspace_invites (
  code text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'lead', 'member', 'viewer')),
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 25,
  uses int not null default 0,
  revoked boolean not null default false
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  key text check (key ~ '^[A-Z][A-Z0-9]{1,5}$'),
  description text,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists projects_workspace on public.projects (workspace_id);

alter table public.tasks add column if not exists project_id uuid references public.projects(id) on delete set null;

-- 2. Helpers -----------------------------------------------------------------------------------
-- The workspace the signed-in user is working in, or null if they aren't a member of it.
create or replace function public.tm_current_ws() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.workspace_id
  from auth.users u
  join public.workspace_members m
    on m.user_id = u.id
   and m.workspace_id::text = u.raw_app_meta_data->>'workspace_id'
  where u.id = auth.uid()
$$;

-- Your role in that workspace. Not a member anywhere: 'none', which can do nothing.
create or replace function public.tm_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.role from public.workspace_members m
      where m.user_id = auth.uid() and m.workspace_id = public.tm_current_ws()),
    'none')
$$;

-- tm_can() from roles.sql is unchanged: it reads tm_role(), which is now per workspace.

alter table public.projects alter column workspace_id set default public.tm_current_ws();

-- 3. Move existing data into the first workspace -----------------------------------------------
do $$
declare
  t text;
  first_ws uuid;
begin
  select id into first_ws from public.workspaces order by created_at limit 1;
  if first_ws is null then
    insert into public.workspaces (name) values ('My team') returning id into first_ws;  -- rename it later in the app
  end if;

  foreach t in array array['students', 'tasks', 'assignments', 'skills', 'student_skills',
                           'task_skills', 'groups', 'task_comments', 'activity_logs'] loop
    execute format('alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade', t);
    execute format('update public.%I set workspace_id = %L where workspace_id is null', t, first_ws);
    execute format('alter table public.%I alter column workspace_id set default public.tm_current_ws()', t);
    execute format('alter table public.%I alter column workspace_id set not null', t);
    execute format('create index if not exists %I on public.%I (workspace_id)', t || '_workspace', t);
  end loop;

  -- Everyone who can sign in today joins with the role they have today.
  insert into public.workspace_members (workspace_id, user_id, email, role)
  select first_ws, u.id, u.email,
         case when u.raw_app_meta_data->>'role' in ('admin', 'lead', 'member', 'viewer')
              then u.raw_app_meta_data->>'role' else 'member' end
  from auth.users u
  on conflict do nothing;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('workspace_id', first_ws)
  where raw_app_meta_data->>'workspace_id' is null;
end $$;

-- Your roster row in the current workspace (matched by email), if any.
create or replace function public.tm_my_student_id() returns text
language sql stable security definer set search_path = '' as $$
  select s.id::text from public.students s
  where lower(s.email) = lower(auth.jwt()->>'email') and s.workspace_id = public.tm_current_ws()
  limit 1
$$;

-- 4. Rules -------------------------------------------------------------------------------------
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.projects          enable row level security;

-- Workspaces you belong to, and the members of the one you're in. Changes go through the API.
drop policy if exists workspaces_read on public.workspaces;
create policy workspaces_read on public.workspaces for select to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = auth.uid()));
drop policy if exists workspace_members_read on public.workspace_members;
create policy workspace_members_read on public.workspace_members for select to authenticated
  using (workspace_id = public.tm_current_ws() or user_id = auth.uid());
-- workspace_invites: no policies, so only the API (service key) can touch them.

-- Read: everything in your current workspace.
do $$
declare t text;
begin
  foreach t in array array['students', 'tasks', 'assignments', 'skills', 'student_skills',
                           'task_skills', 'groups', 'task_comments', 'projects'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (workspace_id = public.tm_current_ws())', t || '_read', t);
  end loop;
end $$;

-- Tasks, projects, groups, the skill list and assignments: leads and admins, in this workspace.
do $$
declare t text;
begin
  foreach t in array array['tasks', 'task_skills', 'groups', 'skills', 'assignments', 'projects'] loop
    execute format('drop policy if exists %I on public.%I', t || '_manage', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (workspace_id = public.tm_current_ws() and public.tm_can(''tasks.manage''))
         with check (workspace_id = public.tm_current_ws() and public.tm_can(''tasks.manage''))',
      t || '_manage', t);
  end loop;
end $$;

drop policy if exists students_manage on public.students;
create policy students_manage on public.students for all to authenticated
  using (workspace_id = public.tm_current_ws() and public.tm_can('people.manage'))
  with check (workspace_id = public.tm_current_ws() and public.tm_can('people.manage'));
drop policy if exists students_self_update on public.students;
create policy students_self_update on public.students for update to authenticated
  using (id::text = public.tm_my_student_id() and public.tm_can('away.self'))
  with check (id::text = public.tm_my_student_id());
-- (tm_students_self_guard from roles.sql still limits members to their photo and away date;
--  it now also stops a row being moved to another workspace.)
create or replace function public.tm_students_self_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.tm_can('people.manage') then return new; end if;
  if (to_jsonb(new) - 'avatar_url' - 'away_until') <> (to_jsonb(old) - 'avatar_url' - 'away_until') then
    raise exception 'You can only change your own photo and away date.';
  end if;
  return new;
end $$;

drop policy if exists student_skills_manage on public.student_skills;
create policy student_skills_manage on public.student_skills for all to authenticated
  using (workspace_id = public.tm_current_ws() and (public.tm_can('people.manage')
         or (student_id::text = public.tm_my_student_id() and public.tm_can('work.self'))))
  with check (workspace_id = public.tm_current_ws() and (public.tm_can('people.manage')
         or (student_id::text = public.tm_my_student_id() and public.tm_can('work.self'))));

drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (workspace_id = public.tm_current_ws() and public.tm_can('comment')
              and lower(author_email) = lower(auth.jwt()->>'email'));

drop policy if exists activity_logs_audit_select on public.activity_logs;
create policy activity_logs_audit_select on public.activity_logs for select to authenticated
  using (workspace_id = public.tm_current_ws() and public.tm_can('audit.view'));
-- Browser inserts into activity_logs are allowed by rls.sql; the trigger below pins them to
-- the real user and their current workspace.
create or replace function public.tm_stamp_actor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then          -- browser insert; the API (service key) has no auth.uid()
    new.actor_email := auth.jwt()->>'email';
    new.actor_role := public.tm_role();
    new.workspace_id := public.tm_current_ws();
  end if;
  return new;
end $$;

-- 5. Names unique per workspace, not across all of them -----------------------------------------
-- An older database may have a skill name, email or matric number unique across the whole table.
-- With workspaces, two teams can both have "Python" (and one person can be on two rosters), so
-- those become unique within a workspace instead.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'u' and array_length(c.conkey, 1) = 1
      and ((c.conrelid = 'public.skills'::regclass and a.attname = 'skill_name')
        or (c.conrelid = 'public.students'::regclass and a.attname in ('email', 'matric')))
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I unique (workspace_id, %I)', r.tbl, r.conname, r.attname);
  end loop;

  for r in
    select i.indexrelid::regclass as idx, ci.relname as idxname, i.indrelid::regclass as tbl, a.attname
    from pg_index i
    join pg_class ci on ci.oid = i.indexrelid
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indisunique and not i.indisprimary and i.indnatts = 1
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
      and ((i.indrelid = 'public.skills'::regclass and a.attname = 'skill_name')
        or (i.indrelid = 'public.students'::regclass and a.attname in ('email', 'matric')))
  loop
    execute format('drop index %s', r.idx);
    execute format('create unique index %I on %s (workspace_id, %I)', r.idxname, r.tbl, r.attname);
  end loop;
end $$;

-- 6. Check -------------------------------------------------------------------------------------
select w.name as workspace, m.email, m.role
from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
order by 1, 3, 2;
