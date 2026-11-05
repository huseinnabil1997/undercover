-- Peringkat musiman bulanan (Asia/Jakarta).
-- * Musim berjalan: top 3 dihitung realtime dari riwayat_main (view/RPC).
-- * Setelah bulan lewat: award teks permanen di award_musim, diisi lazy oleh
--   finalisasi_musim (idempotent), dipanggil saat buka profil/leaderboard.
-- * Frame/efek visual hanya untuk musim berjalan; award lama = gelar teks saja.
-- * Klien tidak menulis award; gelar_dipasang hanya boleh diisi pemilik profil.

alter table public.profil
  add column if not exists gelar_dipasang text;

comment on column public.profil.gelar_dipasang is
  'Gelar yang dipasang pemilik: "musim:<kode>:<kategori>:<peringkat>" atau "award:<id>". Null = otomatis.';

create table if not exists public.award_musim (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profil (id) on delete cascade,
  musim text not null check (musim ~ '^\d{4}-\d{2}$'),
  kategori text not null check (kategori in ('keseluruhan','civilian','undercover','mrwhite','winrate','main')),
  peringkat smallint not null check (peringkat between 1 and 3),
  main integer not null check (main >= 0),
  menang integer not null check (menang >= 0),
  metrik numeric not null,
  dibuat timestamptz not null default now(),
  constraint award_musim_slot unique (musim, kategori, peringkat),
  constraint award_musim_pemain unique (musim, kategori, user_id)
);
create index if not exists award_musim_user on public.award_musim (user_id, musim desc);
alter table public.award_musim enable row level security;
drop policy if exists "award dibaca login" on public.award_musim;
create policy "award dibaca login" on public.award_musim for select to authenticated using (true);
revoke all on public.award_musim from public, anon;
grant select on public.award_musim to authenticated;
-- Tidak ada grant insert/update/delete ke authenticated/anon: hanya security definer.

create or replace function privat.kode_musim(p_saat timestamptz default now())
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char((p_saat at time zone 'Asia/Jakarta'), 'YYYY-MM');
$$;
revoke all on function privat.kode_musim(timestamptz) from public, anon, authenticated;

create or replace function privat.batas_musim(p_musim text)
returns table (awal timestamptz, akhir timestamptz)
language plpgsql
immutable
set search_path = ''
as $$
declare y int; m int;
begin
  if p_musim is null or p_musim !~ '^\d{4}-\d{2}$' then
    raise exception 'musim tidak valid' using errcode = '22023';
  end if;
  y := substr(p_musim, 1, 4)::int;
  m := substr(p_musim, 6, 2)::int;
  if m < 1 or m > 12 then raise exception 'musim tidak valid' using errcode = '22023'; end if;
  awal := ((make_timestamp(y, m, 1, 0, 0, 0) at time zone 'Asia/Jakarta'));
  akhir := ((make_timestamp(y, m, 1, 0, 0, 0) + interval '1 month') at time zone 'Asia/Jakarta');
  return next;
end;
$$;
revoke all on function privat.batas_musim(text) from public, anon, authenticated;

-- Agregat per pemain untuk satu musim.
create or replace function privat.agregat_musim(p_musim text)
returns table (
  user_id uuid,
  main int, menang int,
  civ_main int, civ_menang int,
  uc_main int, uc_menang int,
  mw_main int, mw_menang int
)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (select * from privat.batas_musim(p_musim))
  select r.user_id,
    count(*)::int as main,
    count(*) filter (where r.menang)::int as menang,
    count(*) filter (where r.peran = 'civilian')::int,
    count(*) filter (where r.peran = 'civilian' and r.menang)::int,
    count(*) filter (where r.peran = 'undercover')::int,
    count(*) filter (where r.peran = 'undercover' and r.menang)::int,
    count(*) filter (where r.peran = 'mrwhite')::int,
    count(*) filter (where r.peran = 'mrwhite' and r.menang)::int
  from public.riwayat_main r, b
  where r.waktu >= b.awal and r.waktu < b.akhir and r.mode = 'online'
  group by r.user_id;
$$;
revoke all on function privat.agregat_musim(text) from public, anon, authenticated;

-- Top 3 satu kategori (logika sama dengan lib/peringkatMusim.ts).
create or replace function privat.top3_kategori(p_musim text, p_kategori text)
returns table (
  user_id uuid, peringkat int, kategori text,
  main int, menang int, metrik numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_kategori = 'keseluruhan' then
    return query
    with a as (select * from privat.agregat_musim(p_musim) x where x.menang > 0),
    r as (
      select a.user_id, a.main, a.menang,
        row_number() over (order by a.menang desc, a.main asc, a.user_id asc) as peringkat
      from a
    )
    select r.user_id, r.peringkat::int, p_kategori, r.main, r.menang, r.menang::numeric
    from r where r.peringkat <= 3 order by r.peringkat;
  elsif p_kategori in ('civilian','undercover','mrwhite') then
    return query
    with a as (
      select * from privat.agregat_musim(p_musim)
    ), s as (
      select a.user_id,
        case p_kategori when 'civilian' then a.civ_main when 'undercover' then a.uc_main else a.mw_main end as pm,
        case p_kategori when 'civilian' then a.civ_menang when 'undercover' then a.uc_menang else a.mw_menang end as pw
      from a
    ), r as (
      select s.user_id, s.pm, s.pw,
        row_number() over (
          order by s.pw desc, (s.pw::numeric / nullif(s.pm,0)) desc nulls last, s.pm asc, s.user_id asc
        ) as peringkat
      from s where s.pm >= 5 and s.pw > 0
    )
    select r.user_id, r.peringkat::int, p_kategori, r.pm, r.pw, r.pw::numeric
    from r where r.peringkat <= 3 order by r.peringkat;
  elsif p_kategori = 'winrate' then
    return query
    with a as (select * from privat.agregat_musim(p_musim) x where x.main >= 10),
    r as (
      select a.user_id, a.main, a.menang,
        (a.menang::numeric / a.main) as wr,
        row_number() over (order by (a.menang::numeric / a.main) desc, a.menang desc, a.main desc, a.user_id asc) as peringkat
      from a
    )
    select r.user_id, r.peringkat::int, p_kategori, r.main, r.menang, r.wr
    from r where r.peringkat <= 3 order by r.peringkat;
  elsif p_kategori = 'main' then
    return query
    with a as (select * from privat.agregat_musim(p_musim) x where x.main > 0),
    r as (
      select a.user_id, a.main, a.menang,
        row_number() over (order by a.main desc, a.menang desc, a.user_id asc) as peringkat
      from a
    )
    select r.user_id, r.peringkat::int, p_kategori, r.main, r.menang, r.main::numeric
    from r where r.peringkat <= 3 order by r.peringkat;
  else
    raise exception 'kategori tidak valid' using errcode = '22023';
  end if;
end;
$$;
revoke all on function privat.top3_kategori(text, text) from public, anon, authenticated;

create or replace function public.top_musim(p_musim text default null)
returns table (
  user_id uuid, username text, avatar_versi int,
  peringkat int, kategori text, main int, menang int, metrik numeric, musim text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare m text := coalesce(p_musim, privat.kode_musim());
declare k text;
begin
  perform privat.wajib_sesi_aktif();
  foreach k in array array['keseluruhan','civilian','undercover','mrwhite','winrate','main'] loop
    return query
    select t.user_id, p.username, p.avatar_versi, t.peringkat, t.kategori, t.main, t.menang, t.metrik, m
    from privat.top3_kategori(m, k) t
    join public.profil p on p.id = t.user_id;
  end loop;
end;
$$;
revoke all on function public.top_musim(text) from public, anon;
grant execute on function public.top_musim(text) to authenticated;

-- Finalisasi lazy: isi award untuk musim yang sudah lewat. Idempotent.
create or replace function public.finalisasi_musim(p_musim text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare m text := p_musim;
declare n int := 0;
declare k text;
declare c int;
begin
  perform privat.wajib_sesi_aktif();
  if m is null then
    m := to_char(((now() at time zone 'Asia/Jakarta') - interval '1 month'), 'YYYY-MM');
  end if;
  if m >= privat.kode_musim() then
    return 0;
  end if;
  foreach k in array array['keseluruhan','civilian','undercover','mrwhite','winrate','main'] loop
    insert into public.award_musim (user_id, musim, kategori, peringkat, main, menang, metrik)
    select t.user_id, m, t.kategori, t.peringkat, t.main, t.menang, t.metrik
    from privat.top3_kategori(m, k) t
    on conflict (musim, kategori, peringkat) do nothing;
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end;
$$;
revoke all on function public.finalisasi_musim(text) from public, anon;
grant execute on function public.finalisasi_musim(text) to authenticated;

-- Gelar terpasang + slot musim berjalan + award untuk sekumpulan user (room / profil).
create or replace function public.gelar_pemain(p_user_id uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare m text := privat.kode_musim();
declare ids uuid[];
declare hasil jsonb := '[]'::jsonb;
begin
  perform privat.wajib_sesi_aktif();
  perform public.finalisasi_musim(null);
  if p_user_id is null then
    ids := array[auth.uid()];
  else
    ids := p_user_id;
  end if;
  select coalesce(jsonb_agg(q.obj order by q.user_id), '[]'::jsonb) into hasil
  from (
    select p.id as user_id, jsonb_build_object(
      'user_id', p.id,
      'username', p.username,
      'avatar_versi', p.avatar_versi,
      'gelar_dipasang', p.gelar_dipasang,
      'musim', m,
      'slot', coalesce((
        select jsonb_agg(jsonb_build_object(
          'kategori', t.kategori, 'peringkat', t.peringkat,
          'main', t.main, 'menang', t.menang, 'metrik', t.metrik
        ) order by t.peringkat,
          case t.kategori
            when 'keseluruhan' then 0 when 'winrate' then 1 when 'civilian' then 2
            when 'undercover' then 3 when 'mrwhite' then 4 else 5 end)
        from (
          select * from privat.top3_kategori(m, 'keseluruhan')
          union all select * from privat.top3_kategori(m, 'civilian')
          union all select * from privat.top3_kategori(m, 'undercover')
          union all select * from privat.top3_kategori(m, 'mrwhite')
          union all select * from privat.top3_kategori(m, 'winrate')
          union all select * from privat.top3_kategori(m, 'main')
        ) t where t.user_id = p.id
      ), '[]'::jsonb),
      'award', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'kategori', a.kategori, 'peringkat', a.peringkat,
          'musim', a.musim, 'main', a.main, 'menang', a.menang, 'metrik', a.metrik
        ) order by a.musim desc, a.peringkat, a.kategori)
        from public.award_musim a where a.user_id = p.id
      ), '[]'::jsonb)
    ) as obj
    from public.profil p
    where p.id = any(ids)
  ) q;
  return hasil;
end;
$$;
revoke all on function public.gelar_pemain(uuid[]) from public, anon;
grant execute on function public.gelar_pemain(uuid[]) to authenticated;

create or replace function public.pasang_gelar(p_nilai text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
declare m text := privat.kode_musim();
declare bagian text[];
declare kat text;
declare per int;
declare aid bigint;
begin
  perform privat.wajib_sesi_aktif();
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  if p_nilai is null or p_nilai = '' or p_nilai = 'otomatis' then
    update public.profil set gelar_dipasang = null where id = uid;
    return;
  end if;
  if p_nilai like 'musim:%' then
    bagian := string_to_array(p_nilai, ':');
    -- musim:YYYY-MM:kategori:peringkat
    if array_length(bagian, 1) <> 4 or bagian[2] <> m then
      raise exception 'gelar musim tidak valid' using errcode = '22023';
    end if;
    kat := bagian[3]; per := bagian[4]::int;
    if not exists (
      select 1 from privat.top3_kategori(m, kat) t where t.user_id = uid and t.peringkat = per
    ) then
      raise exception 'bukan peringkatmu' using errcode = '42501';
    end if;
    update public.profil set gelar_dipasang = p_nilai where id = uid;
    return;
  end if;
  if p_nilai like 'award:%' then
    begin aid := substr(p_nilai, 7)::bigint; exception when others then
      raise exception 'gelar award tidak valid' using errcode = '22023';
    end;
    if not exists (select 1 from public.award_musim a where a.id = aid and a.user_id = uid) then
      raise exception 'bukan awardmu' using errcode = '42501';
    end if;
    update public.profil set gelar_dipasang = p_nilai where id = uid;
    return;
  end if;
  raise exception 'gelar tidak valid' using errcode = '22023';
end;
$$;
revoke all on function public.pasang_gelar(text) from public, anon;
grant execute on function public.pasang_gelar(text) to authenticated;

-- Jangan biarkan klien menulis gelar_dipasang langsung; hanya lewat RPC.
-- Pastikan grant update profil tidak mencakup kolom ini bila ada.
do $$
begin
  -- Revoke update all lalu grant ulang kolom yang boleh (avatar_versi saja seperti semula).
  revoke update on public.profil from authenticated;
  grant update (avatar_versi) on public.profil to authenticated;
exception when undefined_object then null;
end $$;
