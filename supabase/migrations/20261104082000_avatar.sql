-- Foto profil: bucket publik `avatars`, objek `<user_id>/avatar.webp`. Versi di profil.avatar_versi untuk cache-busting
-- (null = tanpa foto, tampilkan inisial).
alter table public.profil add column if not exists avatar_versi integer check (avatar_versi is null or avatar_versi > 0);

create policy "profil diubah pemiliknya" on public.profil for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update (avatar_versi) on public.profil to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Baca publik lewat URL publik bucket (policy select hanya untuk folder sendiri, jadi isi bucket orang lain tidak bisa di-list lewat API).
create policy "avatar diunggah pemiliknya" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar diganti pemiliknya" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar dihapus pemiliknya" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Upsert (ganti foto) butuh select atas objek sendiri; hanya folder milik sendiri.
create policy "avatar dibaca pemiliknya" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
