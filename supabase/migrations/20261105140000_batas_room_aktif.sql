-- Batas 5 room per host hanya menghitung room yang masih aktif (host belum keluar dan masih berdetak).
-- Sebelumnya room yang sudah ditinggalkan tetap dihitung sampai kedaluwarsa (6 jam), sehingga room ke-6
-- ditolak dan permainan berjalan tanpa room terdaftar: hasil tidak pernah dicatat ke riwayat.
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
  if (select count(*) from public.room_online where host_id = uid and topik <> p_topik and kedaluwarsa > now()
        and not host_keluar and host_detak > now() - privat.batas_detak()) >= 5 then
    raise exception 'terlalu banyak room' using errcode = 'P0001';
  end if;
  insert into public.room_online (topik, host_id) values (p_topik, uid)
  on conflict (topik) do update set host_id = uid, host_detak = now(), host_keluar = false, kedaluwarsa = now() + interval '6 hours';
  insert into public.anggota_room (topik, user_id) values (p_topik, uid) on conflict do nothing;
  return 'ok';
end $function$;
