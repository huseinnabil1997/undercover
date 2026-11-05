-- Matchmaking v2: room match terbuka yang terisi bertahap (menggantikan antrean_match).
-- - Ukuran 4 sampai 8 = kapasitas MAKSIMAL room. Pemain dengan ukuran N ditempatkan di room match terbuka tertua
--   dengan maks N yang masih di lobby dan belum penuh; bila tidak ada, room baru dibuat dan pemain itu host.
-- - Acak (null): room terbuka mana saja yang belum penuh, utamakan yang paling ramai lalu yang paling lama.
--   Bila tidak ada, dibuat room baru maks 8.
-- - Setelah game dimulai (mulai_match), room tidak menerima pemain matchmaking baru.
-- - Kursi = baris anggota_match. Baris tanpa detak 30 detik dihapus (kursi bebas). Room tanpa anggota dihapus.
--   Room lebih dari 6 jam dihapus. Host P2P yang pergi ditangani migrasi host room biasa.
-- - Semua perubahan diserialisasi advisory lock transaksi, jadi room tidak pernah terisi lebih dari maks.
-- - Tabel hanya bisa diakses lewat RPC SECURITY DEFINER (RLS aktif tanpa policy, tanpa grant).

alter publication supabase_realtime drop table public.antrean_match;
drop function public.masuk_antrean(integer);
drop function public.detak_antrean();
drop function public.keluar_antrean();
drop function privat.status_antrean(uuid);
drop function privat.bentuk_match();
drop function privat.tetapkan_match(uuid[]);
drop table public.antrean_match;

create table public.room_match (
  kode text primary key check (kode ~ '^[A-HJKMNP-Z2-9]{6}$'),
  maks smallint not null check (maks between 4 and 8),
  status text not null default 'lobby' check (status in ('lobby', 'dimulai')),
  dibuat timestamptz not null default now(),
  terakhir_gabung timestamptz not null default now()
);
create table public.anggota_match (
  user_id uuid primary key references public.profil (id) on delete cascade,
  kode text not null references public.room_match (kode) on delete cascade,
  masuk timestamptz not null default now(),
  detak timestamptz not null default now()
);
create index anggota_match_kode on public.anggota_match (kode);
create index room_match_lobby on public.room_match (maks, dibuat) where status = 'lobby';
alter table public.room_match enable row level security;
alter table public.anggota_match enable row level security;
revoke all on public.room_match, public.anggota_match from anon, authenticated;

create function privat.bersihkan_match() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('undercover:room_match'));
  delete from public.anggota_match where detak < now() - interval '30 seconds';
  delete from public.room_match r where r.dibuat < now() - interval '6 hours'
    or not exists (select 1 from public.anggota_match a where a.kode = r.kode);
end $$;
revoke all on function privat.bersihkan_match() from public, anon, authenticated;

create function privat.status_match(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kode', r.kode, 'maks', r.maks, 'status', r.status,
    'jumlah', (select count(*) from public.anggota_match x where x.kode = r.kode),
    'diam_ms', floor(extract(epoch from now() - r.terakhir_gabung) * 1000)::bigint)
  from public.anggota_match a join public.room_match r on r.kode = a.kode where a.user_id = p_uid
$$;
revoke all on function privat.status_match(uuid) from public, anon, authenticated;

create function public.cari_match(p_ukuran integer) returns jsonb
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
    order by case when p_ukuran is null then c.n end desc nulls last, r.dibuat, r.kode
    limit 1;
  if k is null then
    loop
      k := privat.kode_match();
      exit when not exists (select 1 from public.room_match where kode = k);
    end loop;
    insert into public.room_match (kode, maks) values (k, coalesce(p_ukuran, 8));
    h := true;
  else
    update public.room_match set terakhir_gabung = now() where kode = k;
  end if;
  insert into public.anggota_match (user_id, kode) values (uid, k);
  return privat.status_match(uid) || jsonb_build_object('host', h);
end $$;

create function public.detak_match() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'login diperlukan'; end if;
  perform privat.bersihkan_match();
  update public.anggota_match set detak = now() where user_id = uid;
  return privat.status_match(uid);
end $$;

create function public.mulai_match() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.room_match set status = 'dimulai'
  where kode = (select kode from public.anggota_match where user_id = auth.uid());
end $$;

create function public.keluar_match() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); k text;
begin
  perform pg_advisory_xact_lock(hashtext('undercover:room_match'));
  delete from public.anggota_match where user_id = uid returning kode into k;
  if k is not null then
    delete from public.room_match r where r.kode = k
      and not exists (select 1 from public.anggota_match a where a.kode = k);
  end if;
end $$;

revoke all on function public.cari_match(integer), public.detak_match(), public.mulai_match(), public.keluar_match() from public, anon;
grant execute on function public.cari_match(integer), public.detak_match(), public.mulai_match(), public.keluar_match() to authenticated;
