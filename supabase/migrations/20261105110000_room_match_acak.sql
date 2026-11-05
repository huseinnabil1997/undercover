-- Room match yang dibuat pemain Acak (maks 8) tidak pernah mulai otomatis: hanya host yang memulai.
-- Mode room disimpan di server agar host pengganti tetap tahu modenya.
alter table public.room_match add column acak boolean not null default false;

create or replace function privat.status_match(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kode', r.kode, 'maks', r.maks, 'status', r.status, 'acak', r.acak,
    'jumlah', (select count(*) from public.anggota_match x where x.kode = r.kode),
    'diam_ms', floor(extract(epoch from now() - r.terakhir_gabung) * 1000)::bigint)
  from public.anggota_match a join public.room_match r on r.kode = a.kode where a.user_id = p_uid
$$;
revoke all on function privat.status_match(uuid) from public, anon, authenticated;

create or replace function public.cari_match(p_ukuran integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); k text; h boolean := false;
begin
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
end $$;

