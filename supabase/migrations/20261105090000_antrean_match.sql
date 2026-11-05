-- Matchmaking mode Online: antrean FIFO tanpa skill/winrate.
-- - Pemain memilih ukuran match 4 sampai 8, atau Acak (ukuran null, minimal 4).
-- - Ukuran tetap N: match terbentuk begitu ada N pemain untuk N. Pemain yang memilih N didahulukan (FIFO),
--   sisa kursi diisi pemain Acak yang paling lama menunggu. Bucket dengan pemain tetap terlama diproses lebih dulu.
-- - Hanya Acak: bila ada minimal 4 pemain Acak dan yang terlama sudah menunggu 20 detik, terbentuk match berisi
--   sampai 8 pemain Acak terlama. Bila sudah ada 8 pemain Acak, match langsung terbentuk tanpa menunggu.
-- - Host = pemain yang paling dulu masuk antrean. Server membuat kode room acak 6 huruf; kode hanya terlihat
--   oleh pemain match itu (baris antrean miliknya sendiri). Room tetap dibuat lewat buat_room/gabung_room biasa.
-- - Tidak ada cron: pembentukan match dijalankan saat masuk antrean dan setiap detak (sekitar 4 detik).
--   Baris yang tidak berdetak 30 detik dihapus. Baris yang sudah cocok dihapus setelah 10 menit.
-- - Serialisasi lewat advisory lock transaksi, jadi satu pemain tidak pernah masuk dua match.

create table public.antrean_match (
  user_id uuid primary key references public.profil (id) on delete cascade,
  ukuran smallint check (ukuran is null or ukuran between 4 and 8),
  masuk timestamptz not null default now(),
  detak timestamptz not null default now(),
  -- Terisi saat match terbentuk.
  kode text check (kode is null or kode ~ '^[A-HJKMNP-Z2-9]{6}$'),
  host boolean not null default false,
  jumlah smallint,
  cocok timestamptz
);
create index antrean_match_menunggu on public.antrean_match (masuk) where kode is null;
alter table public.antrean_match enable row level security;
revoke all on public.antrean_match from anon, authenticated;
-- Hanya baris milik sendiri yang terlihat (dipakai notifikasi Realtime postgres_changes). Tulis hanya lewat RPC.
grant select on public.antrean_match to authenticated;
create policy "antrean milik sendiri" on public.antrean_match for select to authenticated
  using (user_id = (select auth.uid()));
alter publication supabase_realtime add table public.antrean_match;

create function privat.kode_match() returns text
language plpgsql volatile set search_path = '' as $$
declare abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; s text := ''; b bytea := extensions.gen_random_bytes(6);
begin
  for i in 0..5 loop s := s || substr(abc, 1 + get_byte(b, i) % 31, 1); end loop;
  return s;
end $$;
revoke all on function privat.kode_match() from public, anon, authenticated;

create function privat.tetapkan_match(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare k text := privat.kode_match(); h uuid;
begin
  select user_id into h from public.antrean_match where user_id = any (p_ids) order by masuk, user_id limit 1;
  update public.antrean_match set kode = k, host = (user_id = h), jumlah = cardinality(p_ids), cocok = now()
  where user_id = any (p_ids);
end $$;
revoke all on function privat.tetapkan_match(uuid[]) from public, anon, authenticated;

-- Bentuk semua match yang mungkin. Jumlah match yang terbentuk.
create function privat.bentuk_match() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; v_n smallint; ids uuid[]; ada boolean;
begin
  perform pg_advisory_xact_lock(hashtext('undercover:antrean_match'));
  delete from public.antrean_match where kode is null and detak < now() - interval '30 seconds';
  delete from public.antrean_match where kode is not null and cocok < now() - interval '10 minutes';
  loop
    ada := false;
    for v_n in select a.ukuran from public.antrean_match a where a.kode is null and a.ukuran is not null
               group by a.ukuran order by min(a.masuk) loop
      select array_agg(user_id) into ids from (
        select user_id from public.antrean_match where kode is null and (ukuran = v_n or ukuran is null)
        order by (ukuran is null), masuk, user_id limit v_n
      ) t;
      if cardinality(ids) = v_n then
        perform privat.tetapkan_match(ids);
        n := n + 1; ada := true;
        exit;
      end if;
    end loop;
    if not ada then
      select array_agg(user_id) into ids from (
        select user_id from public.antrean_match where kode is null and ukuran is null order by masuk, user_id limit 8
      ) t;
      if cardinality(ids) = 8 or (cardinality(ids) >= 4 and (
        select min(masuk) from public.antrean_match where kode is null and ukuran is null) <= now() - interval '20 seconds') then
        perform privat.tetapkan_match(ids);
        n := n + 1; ada := true;
      end if;
    end if;
    exit when not ada;
  end loop;
  return n;
end $$;
revoke all on function privat.bentuk_match() from public, anon, authenticated;

-- Status antrean pemanggil: null bila tidak sedang antre.
create function privat.status_antrean(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ukuran', a.ukuran, 'masuk', a.masuk, 'kode', a.kode, 'host', a.host, 'jumlah', a.jumlah,
    'menunggu', case when a.kode is null then (
      select count(*) from public.antrean_match b
      where b.kode is null and (a.ukuran is null or b.ukuran = a.ukuran or b.ukuran is null)
    ) end)
  from public.antrean_match a where a.user_id = p_uid
$$;
revoke all on function privat.status_antrean(uuid) from public, anon, authenticated;

create function public.masuk_antrean(p_ukuran integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  if p_ukuran is not null and (p_ukuran < 4 or p_ukuran > 8) then raise exception 'ukuran tidak valid' using errcode = '22023'; end if;
  if not exists (select 1 from public.profil where id = uid) then raise exception 'profil tidak ada' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('undercover:antrean_match'));
  insert into public.antrean_match (user_id, ukuran) values (uid, p_ukuran)
  on conflict (user_id) do update set ukuran = excluded.ukuran, masuk = now(), detak = now(),
    kode = null, host = false, jumlah = null, cocok = null;
  perform privat.bentuk_match();
  return privat.status_antrean(uid);
end $$;

create function public.detak_antrean() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  update public.antrean_match set detak = now() where user_id = uid and kode is null;
  perform privat.bentuk_match();
  return privat.status_antrean(uid);
end $$;

create function public.keluar_antrean() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.antrean_match where user_id = (select auth.uid());
end $$;

do $$
declare f text;
begin
  foreach f in array array['masuk_antrean(integer)', 'detak_antrean()', 'keluar_antrean()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
