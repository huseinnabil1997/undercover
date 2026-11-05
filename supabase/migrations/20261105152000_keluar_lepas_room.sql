-- Pemain yang keluar dengan sengaja tidak lagi memiliki room itu dalam bentuk apa pun.
-- * Barisnya di anggota_room selalu dihapus, termasuk host. Tanpa baris itu ambil_alih_host, detak_host,
--   dan catat_hasil_room ditolak; masuk lagi harus lewat gabung_room seperti pemain baru.
-- * Host yang keluar: host_id langsung pindah ke anggota tersisa paling awal (host_keluar = true agar
--   klien pengganti mengambil alih snapshot). Room tidak lagi dihitung dalam batas 5 room milik host lama.
-- * Tidak ada anggota tersisa: room dihapus.

create or replace function privat.hapus_room_kosong(p_topik text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.room_online r
  where r.topik = p_topik
    and not exists (select 1 from public.anggota_room a where a.topik = r.topik);
$$;
revoke all on function privat.hapus_room_kosong(text) from public, anon, authenticated;

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
    or not exists (select 1 from public.anggota_room a where a.topik = r.topik);
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.tinggalkan_room(p_topik text, p_snapshot text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid()); r public.room_online; pengganti uuid;
begin
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  delete from public.anggota_room where topik = p_topik and user_id = uid;
  select * into r from public.room_online where topik = p_topik for update;
  if not found then return; end if;
  if r.host_id = uid then
    select a.user_id into pengganti from public.anggota_room a where a.topik = p_topik order by a.gabung, a.user_id limit 1;
    if pengganti is null then
      delete from public.room_online where topik = p_topik;
      return;
    end if;
    update public.room_online
      set host_id = pengganti, host_keluar = true, host_detak = now(), snapshot = coalesce(p_snapshot, snapshot)
      where topik = p_topik;
  end if;
  perform privat.hapus_room_kosong(p_topik);
end $function$;
