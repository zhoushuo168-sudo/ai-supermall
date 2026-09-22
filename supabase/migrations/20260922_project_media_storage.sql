-- AI SuperMall private project media. Run once in Supabase Dashboard → SQL Editor.
-- This does not modify public.projects or its existing RLS policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read their own project media" on storage.objects;
create policy "members read their own project media"
on storage.objects for select to authenticated
using (
  bucket_id = 'project-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "members upload their own project media" on storage.objects;
create policy "members upload their own project media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "members update their own project media" on storage.objects;
create policy "members update their own project media"
on storage.objects for update to authenticated
using (
  bucket_id = 'project-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'project-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "members delete their own project media" on storage.objects;
create policy "members delete their own project media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'project-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
