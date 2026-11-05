-- Room dihapus begitu tidak ada yang memakainya, tidak menunggu kedaluwarsa 6 jam.
-- * Anggota terakhir keluar (tinggalkan_room): room dihapus bila tidak ada anggota lain selain host dan host sudah
--   keluar atau tidak berdetak. Host yang keluar sementara pemain lain masih ada: room tetap untuk migrasi host.
-- * Room basi: tidak ada detak host (termasuk host pengganti) selama 2 menit dihapus. Migrasi host
--   (keluar sengaja sekitar 2 detik, putus sekitar 30 detik) selesai jauh sebelum batas ini.
-- Pembersihan berjalan malas di buat_room, gabung_room, cari_match, dan tinggalkan_room (pg_cron tidak aktif).

create or replace function privat.batas_room_basi() returns interval language sql immutable set search_path = '' as $$ select interval '2 minutes' $$;

create or replace function privat.hapus_room_kosong(p_topik text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.room_online r
  where r.topik = p_topik
    and (r.host_keluar or r.host_detak < now() - privat.batas_detak())
    and not exists (select 1 from public.anggota_room a where a.topik = r.topik and a.user_id <> r.host_id);
$$;
revoke all on function privat.hapus_room_kosong(text) from public, anon, authenticated;
revoke all on function privat.batas_room_basi() from public, anon;
grant execute on function privat.batas_room_basi() to authenticated;

CREATE OR REPLACE FUNCTION public.bersihkan_room()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  delete from public.room_online r
  where r.kedaluwarsa < now()
    or r.host_detak < now() - privat.batas_room_basi()
    or (r.host_keluar and not exists (select 1 from public.anggota_room a where a.topik = r.topik and a.user_id <> r.host_id));
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.tinggalkan_room(p_topik text, p_snapshot text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid());
begin
  update public.room_online set host_keluar = true, snapshot = coalesce(p_snapshot, snapshot)
  where topik = p_topik and host_id = uid;
  delete from public.anggota_room where topik = p_topik and user_id = uid
    and not exists (select 1 from public.room_online where topik = p_topik and host_id = uid);
  perform privat.hapus_room_kosong(p_topik);
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
  perform public.bersihkan_room();
  if not exists (select 1 from public.room_online where topik = p_topik and kedaluwarsa > now()) then return null; end if;
  if (select count(*) from public.anggota_room where topik = p_topik) >= 30 then raise exception 'room penuh' using errcode = 'P0001'; end if;
  insert into public.anggota_room (topik, user_id, nonce) values (p_topik, uid, n)
  on conflict (topik, user_id) do update set nonce = n;
  return n;
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
  perform public.bersihkan_room();
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

-- Sekali jalan: hapus room yang sudah ditinggalkan atau basi.
select public.bersihkan_room();
