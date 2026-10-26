-- TaskMatch notifications and approvals (Phase 3c).
-- Run once in the Supabase SQL Editor, AFTER rls.sql, roles.sql and workspaces.sql (safe to re-run).
--
-- What it does:
--   1. notifications: one row per person per event (assigned to you, your task approved,
--      a task completed, something due soon). Workspace-scoped; you only ever see your own.
--   2. approvals: a request that waits for a leader's yes/no before an action runs
--      (for example a member self-assigning a Critical task). Workspace-scoped.
--
-- Both reuse the helpers from workspaces.sql / roles.sql:
--   tm_current_ws()  -> the workspace you're working in
--   tm_role()        -> your role in that workspace
--   tm_can(perm)     -> whether your role has a permission
-- The API writes these rows with the service-role key; RLS below guards direct reads.

-- 1. Tables ----------------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade
    default public.tm_current_ws(),
  user_id uuid not null,                       -- the recipient
  type text not null check (type in (
    'task_assigned', 'task_unassigned', 'task_completed',
    'task_due_soon', 'approval_requested', 'approval_approved', 'approval_rejected')),
  title text not null check (length(trim(title)) between 1 and 160),
  body text,
  link text,                                   -- in-app path, e.g. /tasks/123
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread
  on public.notifications (user_id) where read_at is null;

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade
    default public.tm_current_ws(),
  requested_by uuid not null,
  kind text not null check (kind in ('self_assign_critical', 'reassign', 'other')),
  target_id text,                              -- the task (or other object) the request is about
  payload jsonb,                               -- what to do if approved (e.g. {"task_id":..,"student_id":..})
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,                                   -- optional reason from the requester or decider
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists approvals_workspace_status
  on public.approvals (workspace_id, status, created_at desc);

-- 2. Row-level security ----------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.approvals enable row level security;

-- Notifications: you only ever read your own, in your current workspace.
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid() and workspace_id = public.tm_current_ws());

-- You may mark your own notifications read (the only column the client should change is read_at;
-- the API uses the service-role key for everything else).
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid() and workspace_id = public.tm_current_ws())
  with check (user_id = auth.uid() and workspace_id = public.tm_current_ws());

-- Approvals: anyone in the workspace who can manage tasks (leaders/admins) sees pending ones;
-- the requester always sees their own.
drop policy if exists approvals_read on public.approvals;
create policy approvals_read on public.approvals for select to authenticated
  using (
    workspace_id = public.tm_current_ws()
    and (requested_by = auth.uid() or public.tm_can('tasks.manage'))
  );

-- All writes (create request, decide) go through the API's service-role key, which bypasses RLS.
-- No INSERT/DELETE policy is granted to authenticated clients on purpose.

-- 3. Verify ----------------------------------------------------------------------------------
-- Tables exist and RLS is on:
--   select relname, relrowsecurity from pg_class
--   where relname in ('notifications', 'approvals');
-- Policies:
--   select tablename, policyname, cmd from pg_policies
--   where tablename in ('notifications', 'approvals') order by 1, 2;
