# Phase 3c — Notification centre & approvals

Built on workspaces (Phase 3b): everything here is scoped to the workspace you're in, and
who can do what follows the same roles (admin / lead / member / viewer).

## What it adds

### 1. Notification centre
A bell in the sidebar (and the mobile top bar) with an unread count. Click it for a dropdown
of recent notifications; click one to jump to the task it's about. "Mark all read" clears the count.

You get a notification when:

| Event | Who is notified |
|---|---|
| A leader assigns you to a task | the assignee |
| Your whole task is completed | the workspace's leaders (not the person who finished it) |
| A request you made is approved / rejected | the requester |
| A member asks to take a critical task | the workspace's leaders |

Self-assigning raises no notification — you did it yourself.

### 2. Approvals
Some actions need a leader's sign-off first. Today that is: **a plain member taking a
Critical-priority task**. Instead of assigning them straight away, the server records a
*pending* request and notifies the leaders. A leader opens **Approvals** (sidebar, leaders only)
and clicks Approve or Reject:

- **Approve** → the assignment runs, and the member is notified.
- **Reject** → nothing happens, and the member is notified.

Leaders and admins bypass the gate — they can already assign anyone.

## How it works

```
  member self-assigns a Critical task
        │
        ▼
  /self-assign  ──►  records a pending approval  ──►  notifies leaders
                                                            │
                                            leader opens /approvals
                                                            │
                               approve ──► /approvals/decide ──► assignment runs ──► notify member
                               reject  ──► /approvals/decide ──► dropped          ──► notify member
```

Notification and approval rows are written server-side with the service-role key, so they
work under RLS. You only ever read your own notifications; leaders (and the requester) read
approvals in their workspace. All of that is enforced twice — once in the API, once in the
database rules.

## Setup

Run **`supabase/notifications.sql`** once in the Supabase SQL Editor, after the earlier
scripts (`rls.sql`, `roles.sql`, `workspaces.sql`). It is safe to re-run. It creates two
tables (`notifications`, `approvals`) with row-level security that reuses the existing
`tm_current_ws()` / `tm_role()` / `tm_can()` helpers.

No new environment variables. No new frontend dependencies. The bell polls every 60 seconds.

## API

| Method | Path | Who | Does |
|---|---|---|---|
| GET | `/notifications` | any member | your notifications + unread count |
| POST | `/notifications/read` | any member | mark one (`notification_id`) or all read |
| GET | `/approvals?status=pending` | leaders (+ own requester) | list requests |
| POST | `/approvals/request` | any member | file a request |
| POST | `/approvals/decide` | leaders | approve / reject a request |

## Tests

`test_security.py` covers the auth contract on all five endpoints (a login is required
before anything happens). Full suite: 154 passing.

## Not in this phase (possible later)
- Email delivery (in-app only for now).
- Realtime push (polling for now).
- More approval triggers (reassigning someone else's work, deleting a task).
