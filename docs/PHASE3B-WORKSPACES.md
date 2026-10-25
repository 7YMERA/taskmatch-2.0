# TaskMatch 2.0: Phase 3b, workspaces and projects (before / after)

Until now TaskMatch held one team. Everyone who signed up landed in the same list of people and
tasks. Phase 3b makes it multi-team, the way Jira and Linear work:

- A **workspace** is one team or company. It has its own people, tasks, skills, groups, comments
  and audit trail. Other workspaces can't see any of it.
- You can belong to several workspaces and switch between them from the sidebar.
- Your **role is per workspace**. You can be an admin of your own team and a member of someone
  else's.
- **Projects** group a workspace's tasks, each with a short key (like `WEB`) that shows as a tag
  on its tasks.

## What's new

### Workspace switcher

The top of the sidebar shows the workspace you're in and your role there. Click it to switch,
create a new workspace or join one with an invite.

### Getting in: create or join

A new account lands on a setup page with two choices:

- **Start a new one.** Name it and you become its admin. It comes with a starter skill list you
  can change.
- **I have an invite.** Paste the link or code an admin sent you.

Opening an invite link (`/join/<code>`) shows which workspace and role it's for, then joins with
one click. If you're not signed in yet, it sends you to sign up and brings you straight back.

### Members & roles (was "Team & roles")

- **Rename** the workspace.
- **Invite links.** Pick the role people join with and how long the link works (1, 7 or 30
  days). The link is copied as soon as it's made. Each link shows how many people have used it
  and how long it has left. It stops working when it expires, after 25 joins, or when it's
  revoked.
- **Remove** a member, or **Leave** the workspace yourself. Their past work and the audit trail
  stay. The last admin can't leave or be removed.
- Members, leads and viewers see the workspace's name, their role, and a Leave button.

### Projects

- A **Projects** page with a card per project: progress, open tasks, anything overdue, and a
  link to its tasks.
- Leads and admins create, edit, archive and restore projects. A project has a name, a key (made
  from the name, and can be changed), a description and a colour.
- On **Tasks**: a Project filter (it's in the link, so `/tasks?project=…` can be shared), a
  Project field on New task, "Move to project" in the bulk actions, and the key as a tag on each
  task.
- The task side panel and the task page show the project and let you change it.
- Creating, archiving and moving tasks between projects all go in the audit trail.

## How the separation is enforced

Hiding other teams' data in the app isn't enough, so it is enforced in two places.

1. **The database** (`supabase/workspaces.sql`). Every table has a `workspace_id`. Each row
   rule requires `workspace_id` to match your current workspace **and** that you're a member of
   it. New rows are stamped with your current workspace automatically. Your role comes from
   `workspace_members`, so `tm_can()` from Phase 2 now answers per workspace. Invite codes have no
   rules at all, so only the API (with the service key) can read them.
2. **The API.** Every request works out your workspace and checks you're a member of it. Database
   queries then add `workspace_id` for you, through `ScopedClient` in `main.py`. A route can't
   forget the filter, because it's applied underneath it. A signed-in account with no workspace
   gets `409 no_workspace`, and the app sends it to setup.

Which workspace is open is stored in `app_metadata.workspace_id`. Only the server can write it,
and switching checks membership first. If someone is removed from a workspace, the database
stops showing them its rows straight away, even before their session refreshes.

## Upgrading an existing install

Run [`supabase/workspaces.sql`](../supabase/workspaces.sql) once in the Supabase SQL Editor, after
`rls.sql` and `roles.sql`. It is safe to run twice.

- Everything you already have moves into one workspace called **"My team"** (rename it on
  Members & roles).
- Every existing account joins it with the role it has today.

Then deploy the API and the frontend as usual. No new environment variables are needed.

**One change in behaviour:** a brand-new account no longer sees your team's data straight away.
It has to create its own workspace or be invited. Send new teammates an invite link from
**Members & roles**.

## What changed

| File | Change |
|---|---|
| `supabase/workspaces.sql` (new) | `workspaces`, `workspace_members`, `workspace_invites`, `projects`; `workspace_id` on every table, moved into "My team"; per-workspace row rules and role |
| `taskmatch-api/main.py` | Per-request workspace, `ScopedClient`, per-workspace roles, workspace / invite / member endpoints |
| `taskmatch/app/lib/workspace.ts` (new) | Fetch, switch, create, join and leave workspaces |
| `taskmatch/app/lib/projects.ts`, `components/ProjectChip.tsx` (new) | Projects and the key tag |
| `taskmatch/app/components/Sidebar.tsx` | Workspace switcher; Projects in the menu; "Members & roles" |
| `taskmatch/app/onboarding`, `taskmatch/app/join/[code]` (new) | Create or join a workspace; invite links |
| `taskmatch/app/team/page.tsx` | Members & roles: rename, invite links, remove and leave |
| `taskmatch/app/projects/page.tsx` (new) | Projects page |
| `taskmatch/app/tasks/…`, `components/TaskQuickView.tsx` | Project filter, field, bulk move and tag |
| `taskmatch/app/login`, `signup` | Keep `?next=` so an invite link survives sign-up |

## Tests

- `taskmatch-api/test_workspaces.py` (new, 16 tests):
  - each workspace sees only its own people
  - no workspace gets a 409
  - a stale workspace falls back to one you're in
  - logs are stamped with the workspace
  - creating a workspace makes you admin and seeds skills
  - you can only switch to your own workspaces
  - only admins rename and invite
  - invites: joining, re-joining keeps your role, and revoked, expired and used-up links fail
  - an admin can't revoke another workspace's invite
  - the member list is per workspace
  - members can leave but not remove others
  - the last admin can't leave
  - an admin can't touch members of another workspace
- The existing role and security tests now run inside a workspace. **125 API tests pass.**
- `workspaces.sql` was run twice against a local Postgres with stand-ins for Supabase's `auth`
  schema. As different users it checked that:
  - each workspace sees only its own rows
  - inserting, updating or moving a row into another workspace is refused
  - a forged audit entry is stamped with your own workspace
  - viewers can't write
  - pointing at a workspace you're not in shows nothing
  - a removed member sees nothing straight away
  - signed-out requests see nothing
  - admins can create projects
- `tsc` is clean and `next build` passes.

## Screens

All screenshots use the same seeded demo data at 1440×900.

### Members & roles

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/phase3b/before-members-dark.png) | ![](screenshots/phase3b/after-members-dark.png) |
| Light | ![](screenshots/phase3b/before-members-light.png) | ![](screenshots/phase3b/after-members-light.png) |

### Sidebar: workspace switcher

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/phase3b/before-switcher-dark.png) | ![](screenshots/phase3b/after-switcher-dark.png) |
| Light | ![](screenshots/phase3b/before-switcher-light.png) | ![](screenshots/phase3b/after-switcher-light.png) |

### Tasks: project tags and filter

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/phase3b/before-tasks-dark.png) | ![](screenshots/phase3b/after-tasks-dark.png) |
| Light | ![](screenshots/phase3b/before-tasks-light.png) | ![](screenshots/phase3b/after-tasks-light.png) |

Filtered to one project:

| Dark | Light |
|---|---|
| ![](screenshots/phase3b/after-tasks-project-dark.png) | ![](screenshots/phase3b/after-tasks-project-light.png) |

### Projects (new)

| Dark | Light |
|---|---|
| ![](screenshots/phase3b/after-projects-dark.png) | ![](screenshots/phase3b/after-projects-light.png) |
| ![](screenshots/phase3b/after-projects-new-dark.png) | ![](screenshots/phase3b/after-projects-new-light.png) |

### Setting up a workspace, and an invite link (new)

| Dark | Light |
|---|---|
| ![](screenshots/phase3b/after-onboarding-dark.png) | ![](screenshots/phase3b/after-onboarding-light.png) |
| ![](screenshots/phase3b/after-join-dark.png) | ![](screenshots/phase3b/after-join-light.png) |

## Next

Phase 3c: a notification centre (assigned to you, mentioned, due soon) and approvals, built per
workspace.
