-- TaskMatch avatars storage policies (Level 1 — last storage gap).
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- The `avatars` bucket holds profile pictures. The app uploads them client-side with the signed-in
-- user's session (profile/page.tsx for your own, students/page.tsx when a leader sets someone's),
-- and shows them with a PUBLIC url (<img src=getPublicUrl(...)>). So:
--   • reads  → PUBLIC (the image tags need it; nothing private lives here)
--   • writes → signed-in users only (insert / update / delete), scoped to THIS bucket
--
-- Why not tie writes to auth.uid()? The file name is "<studentId>-<timestamp>.<ext>", and a
-- student id is NOT the auth user id (a leader can upload for another person), so there is no
-- uid in the path to match on. Limiting writes to authenticated users on the avatars bucket is
-- the real tightening over today's "no policy at all" — it stops anonymous writes and writes to
-- other buckets, without breaking the leader-uploads-for-others flow.
--
-- Make sure the bucket is PUBLIC (Storage → avatars → Settings → Public), which it already is
-- because the app reads via getPublicUrl.

-- Storage objects already have RLS enabled by Supabase; these policies scope the `avatars` bucket.

-- Public read of avatars.
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select
  using (bucket_id = 'avatars');

-- Signed-in users may upload.
drop policy if exists "avatars authenticated insert" on storage.objects;
create policy "avatars authenticated insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars');

-- Signed-in users may replace (upsert) an avatar.
drop policy if exists "avatars authenticated update" on storage.objects;
create policy "avatars authenticated update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');

-- Signed-in users may delete an avatar (e.g. replacing an old file).
drop policy if exists "avatars authenticated delete" on storage.objects;
create policy "avatars authenticated delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars');

-- Verify:
--   select policyname, cmd, roles from pg_policies
--   where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars%';
