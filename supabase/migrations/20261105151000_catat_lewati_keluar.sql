-- Pemain yang keluar sebelum game selesai kini melepas kursinya (tinggalkan_room), jadi catat_hasil_room
-- melewati baris pemain yang bukan anggota lagi alih-alih menolak seluruh hasil. Minimal 3 anggota tetap wajib.
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
  -- Pemain yang sudah keluar room (kursinya dilepas) dilewati, sisanya tetap dicatat.
  if (select count(*) from jsonb_array_elements(p_baris) e
      where exists (select 1 from public.anggota_room a where a.topik = p_topik and a.user_id = (e->>'user_id')::uuid)) < 3 then
    raise exception 'pemain bukan anggota room' using errcode = '42501';
  end if;
  if (select count(distinct e->>'user_id') from jsonb_array_elements(p_baris) e) <> jsonb_array_length(p_baris) then
    raise exception 'pemain ganda' using errcode = '22023';
  end if;
  insert into public.riwayat_main (id_main, user_id, mode, peran, menang, pemenang, kata_civilian, kata_undercover, jumlah_pemain)
  select p_id_main, (e->>'user_id')::uuid, 'online', e->>'peran', (e->>'menang')::boolean, e->>'pemenang',
    left(e->>'kata_civilian', 60), left(e->>'kata_undercover', 60), jsonb_array_length(p_baris)
  from jsonb_array_elements(p_baris) e
  where exists (select 1 from public.anggota_room a where a.topik = p_topik and a.user_id = (e->>'user_id')::uuid)
  on conflict (id_main, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $function$;
