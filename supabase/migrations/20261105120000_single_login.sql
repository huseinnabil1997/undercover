-- Single login: satu akun hanya aktif di satu perangkat (login terbaru menang).
-- Klien memanggil auth.signOut({ scope: 'others' }) setelah login/daftar, sehingga sesi lain dihapus dari auth.sessions.
-- Sesi yang sudah dihapus masih bisa membawa access token yang belum kedaluwarsa, jadi RPC penting dan penulisan
-- dicek di server: session_id di JWT harus masih ada di auth.sessions.

create or replace function privat.sesi_aktif()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
  );
$$;

create or replace function privat.wajib_sesi_aktif()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privat.sesi_aktif() then
    raise exception 'sesi_tidak_aktif' using errcode = '28000', hint = 'Akun ini masuk di perangkat lain.';
  end if;
end;
$$;

revoke all on function privat.sesi_aktif() from public, anon;
revoke all on function privat.wajib_sesi_aktif() from public, anon;
grant usage on schema privat to authenticated;
grant execute on function privat.sesi_aktif() to authenticated;
grant execute on function privat.wajib_sesi_aktif() to authenticated;

-- Dipanggil klien secara berkala untuk mendeteksi apakah sesinya sudah digantikan perangkat lain.
create or replace function public.cek_sesi_aktif()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privat.sesi_aktif();
$$;
revoke all on function public.cek_sesi_aktif() from public, anon;
grant execute on function public.cek_sesi_aktif() to authenticated;

-- Penulisan langsung lewat RLS juga butuh sesi aktif.
alter policy "kamus ditambah pemiliknya" on public.kamus_pemain
  with check (user_id = (select auth.uid()) and (select privat.sesi_aktif()));
alter policy "kamus diubah pemiliknya" on public.kamus_pemain
  using (user_id = (select auth.uid()) and (select privat.sesi_aktif()))
  with check (user_id = (select auth.uid()) and (select privat.sesi_aktif()));
alter policy "kamus dihapus pemiliknya" on public.kamus_pemain
  using (user_id = (select auth.uid()) and (select privat.sesi_aktif()));
alter policy "profil diubah pemiliknya" on public.profil
  using (id = (select auth.uid()) and (select privat.sesi_aktif()))
  with check (id = (select auth.uid()) and (select privat.sesi_aktif()));
alter policy "avatar diunggah pemiliknya" on storage.objects
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select privat.sesi_aktif()));
alter policy "avatar diganti pemiliknya" on storage.objects
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select privat.sesi_aktif()))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select privat.sesi_aktif()));
alter policy "avatar dihapus pemiliknya" on storage.objects
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select privat.sesi_aktif()));

-- RPC room, match, hasil, dan ganti username menolak sesi yang sudah digantikan.
-- tinggalkan_room dan keluar_match sengaja tidak dicek agar perangkat yang dikeluarkan bisa pergi dengan rapi.

CREATE OR REPLACE FUNCTION public.ambil_alih_host(p_topik text)
 RETURNS TABLE(snapshot text, host_keluar boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid()); r public.room_online;
begin
  perform privat.wajib_sesi_aktif();
  if not privat.anggota_topik(p_topik) then raise exception 'bukan anggota' using errcode = '42501'; end if;
  select * into r from public.room_online where topik = p_topik for update;
  if not found or r.snapshot is null then return; end if;
  if r.host_id <> uid and r.host_detak > now() - privat.batas_detak() and not r.host_keluar then return; end if;
  update public.room_online set host_id = uid, host_detak = now(), host_keluar = false where topik = p_topik;
  return query select r.snapshot, r.host_keluar;
end $function$;

CREATE OR REPLACE FUNCTION public.buat_room(p_topik text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid()); r public.room_online;
begin
  perform privat.wajib_sesi_aktif();
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  perform public.bersihkan_room();
  select * into r from public.room_online where topik = p_topik for update;
  if found and r.host_id <> uid and r.host_detak > now() - privat.batas_detak() and not r.host_keluar then
    return 'dipakai';
  end if;
  if (select count(*) from public.room_online where host_id = uid and topik <> p_topik and kedaluwarsa > now()) >= 5 then
    raise exception 'terlalu banyak room' using errcode = 'P0001';
  end if;
  insert into public.room_online (topik, host_id) values (p_topik, uid)
  on conflict (topik) do update set host_id = uid, host_detak = now(), host_keluar = false, kedaluwarsa = now() + interval '6 hours';
  insert into public.anggota_room (topik, user_id) values (p_topik, uid) on conflict do nothing;
  return 'ok';
end $function$;

CREATE OR REPLACE FUNCTION public.cari_match(p_ukuran integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := auth.uid(); k text; h boolean := false;
begin
  perform privat.wajib_sesi_aktif();
  if uid is null then raise exception 'login diperlukan'; end if;
  if p_ukuran is not null and p_ukuran not between 4 and 8 then raise exception 'ukuran tidak valid'; end if;
  perform privat.bersihkan_match();
  delete from public.anggota_match where user_id = uid;
  delete from public.room_match r where r.status = 'lobby'
    and not exists (select 1 from public.anggota_match a where a.kode = r.kode);
  select r.kode into k from public.room_match r
    cross join lateral (select count(*) n from public.anggota_match a where a.kode = r.kode) c
    where r.status = 'lobby' and c.n < r.maks and (p_ukuran is null or r.maks = p_ukuran)
      -- Hanya room yang masih hidup: ada anggota yang berdetak dalam 15 detik terakhir.
      and exists (select 1 from public.anggota_match a where a.kode = r.kode and a.detak > now() - interval '15 seconds')
    order by case when p_ukuran is null then c.n end desc nulls last, r.dibuat, r.kode
    limit 1;
  if k is null then
    loop
      k := privat.kode_match();
      exit when not exists (select 1 from public.room_match where kode = k);
    end loop;
    insert into public.room_match (kode, maks, acak) values (k, coalesce(p_ukuran, 8), p_ukuran is null);
    h := true;
  else
    update public.room_match set terakhir_gabung = now() where kode = k;
  end if;
  insert into public.anggota_match (user_id, kode) values (uid, k);
  return privat.status_match(uid) || jsonb_build_object('host', h);
end $function$;

CREATE OR REPLACE FUNCTION public.catat_hasil_room(p_topik text, p_id_main uuid, p_baris jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid()); n integer;
begin
  perform privat.wajib_sesi_aktif();
  if not exists (select 1 from public.room_online where topik = p_topik and host_id = uid and kedaluwarsa > now()) then
    raise exception 'bukan host' using errcode = '42501';
  end if;
  if jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) < 3 or jsonb_array_length(p_baris) > 20 then
    raise exception 'baris tidak valid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_baris) e
    where not exists (select 1 from public.anggota_room a where a.topik = p_topik and a.user_id = (e->>'user_id')::uuid)
  ) then
    raise exception 'pemain bukan anggota room' using errcode = '42501';
  end if;
  if (select count(distinct e->>'user_id') from jsonb_array_elements(p_baris) e) <> jsonb_array_length(p_baris) then
    raise exception 'pemain ganda' using errcode = '22023';
  end if;
  insert into public.riwayat_main (id_main, user_id, mode, peran, menang, pemenang, kata_civilian, kata_undercover, jumlah_pemain)
  select p_id_main, (e->>'user_id')::uuid, 'online', e->>'peran', (e->>'menang')::boolean, e->>'pemenang',
    left(e->>'kata_civilian', 60), left(e->>'kata_undercover', 60), jsonb_array_length(p_baris)
  from jsonb_array_elements(p_baris) e
  on conflict (id_main, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.detak_host(p_topik text, p_snapshot text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform privat.wajib_sesi_aktif();
  update public.room_online set host_detak = now(), snapshot = coalesce(p_snapshot, snapshot),
    kedaluwarsa = now() + interval '6 hours'
  where topik = p_topik and host_id = (select auth.uid());
  return found;
end $function$;

CREATE OR REPLACE FUNCTION public.detak_match()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := auth.uid();
begin
  perform privat.wajib_sesi_aktif();
  if uid is null then raise exception 'login diperlukan'; end if;
  perform privat.bersihkan_match();
  update public.anggota_match set detak = now() where user_id = uid;
  return privat.status_match(uid);
end $function$;

CREATE OR REPLACE FUNCTION public.gabung_room(p_topik text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid()); n text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  perform privat.wajib_sesi_aktif();
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  if not exists (select 1 from public.room_online where topik = p_topik and kedaluwarsa > now()) then return null; end if;
  if (select count(*) from public.anggota_room where topik = p_topik) >= 30 then raise exception 'room penuh' using errcode = 'P0001'; end if;
  insert into public.anggota_room (topik, user_id, nonce) values (p_topik, uid, n)
  on conflict (topik, user_id) do update set nonce = n;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.ganti_username(baru text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  lama text;
  terakhir timestamptz;
  email_baru text;
begin
  perform privat.wajib_sesi_aktif();
  if uid is null then raise exception 'Harus masuk dulu' using errcode = '42501'; end if;
  baru := btrim(coalesce(baru, ''));
  if baru !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Username 3 sampai 20 karakter: huruf, angka, atau underscore' using errcode = '22023';
  end if;
  select username, username_diganti into lama, terakhir from public.profil where id = uid for update;
  if lama is null then raise exception 'Profil tidak ditemukan' using errcode = 'P0002'; end if;
  if baru = lama then raise exception 'Username baru sama dengan yang sekarang' using errcode = '22023'; end if;
  if terakhir is not null and terakhir > now() - interval '7 days' then
    raise exception 'Username baru bisa diganti lagi pada %', to_char((terakhir + interval '7 days') at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB'
      using errcode = 'P0001', hint = 'tunggu';
  end if;
  email_baru := lower(baru) || '@undercover.local';
  if lower(baru) <> lower(lama) and (
       exists (select 1 from public.profil where lower(username) = lower(baru) and id <> uid)
       or exists (select 1 from auth.users where lower(email) = email_baru and id <> uid)) then
    raise exception 'Username sudah dipakai' using errcode = '23505';
  end if;
  update public.profil set username = baru, username_diganti = now() where id = uid;
  update auth.users set email = email_baru,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', baru),
         updated_at = now()
   where id = uid;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', email_baru), updated_at = now()
   where user_id = uid and provider = 'email';
  return now();
end $function$;

CREATE OR REPLACE FUNCTION public.mulai_match()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform privat.wajib_sesi_aktif();
  update public.room_match set status = 'dimulai'
  where kode = (select kode from public.anggota_match where user_id = auth.uid());
end $function$;

CREATE OR REPLACE FUNCTION public.verifikasi_pemain(p_topik text, p_nonce text)
 RETURNS TABLE(user_id uuid, username text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid());
begin
  perform privat.wajib_sesi_aktif();
  if not exists (select 1 from public.room_online r where r.topik = p_topik and r.host_id = uid) then
    raise exception 'bukan host' using errcode = '42501';
  end if;
  return query
    update public.anggota_room a set nonce = null
    from public.profil p
    where a.topik = p_topik and a.nonce = p_nonce and p_nonce is not null and p.id = a.user_id
    returning a.user_id, p.username;
end $function$;
