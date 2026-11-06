-- Peran Jester + pasangan Lovers: riwayat, statistik, peringkat musim, award, catat hasil.
-- Data lama tidak diubah (kolom baru default false; check peran/pemenang diperluas).

-- ---- riwayat_main / statistik: perluas peran & pemenang ----
alter table public.riwayat_main drop constraint if exists riwayat_main_peran_check;
alter table public.riwayat_main drop constraint if exists riwayat_main_pemenang_check;
alter table public.riwayat_main drop constraint if exists riwayat_main_menang_konsisten;

alter table public.riwayat_main
  add column if not exists adalah_lovers boolean not null default false,
  add column if not exists lovers_menang boolean not null default false;

alter table public.riwayat_main
  add constraint riwayat_main_peran_check
    check (peran in ('civilian', 'undercover', 'mrwhite', 'jester')),
  add constraint riwayat_main_pemenang_check
    check (pemenang in ('civilian', 'penyusup', 'mrwhite', 'jester', 'lovers')),
  add constraint riwayat_main_lovers_konsisten
    check (not lovers_menang or adalah_lovers),
  add constraint riwayat_main_menang_konsisten check (
    menang = (
      case pemenang
        when 'civilian' then peran = 'civilian'
        when 'mrwhite' then peran = 'mrwhite'
        when 'jester' then peran = 'jester'
        when 'lovers' then adalah_lovers and peran <> 'jester'
        when 'penyusup' then peran in ('undercover', 'mrwhite')
        else false
      end
      or (lovers_menang and adalah_lovers and peran <> 'jester')
    )
  );

alter table public.statistik drop constraint if exists statistik_peran_check;
alter table public.statistik
  add constraint statistik_peran_check
    check (peran in ('civilian', 'undercover', 'mrwhite', 'jester'));

-- ---- award_musim kategori ----
alter table public.award_musim drop constraint if exists award_musim_kategori_check;
alter table public.award_musim
  add constraint award_musim_kategori_check
    check (kategori in ('keseluruhan','civilian','undercover','mrwhite','jester','lovers','winrate','main'));

-- ---- catat_hasil_room: tulis kolom lovers ----
create or replace function public.catat_hasil_room(p_topik text, p_id_main uuid, p_baris jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); n integer;
begin
  perform privat.wajib_sesi_aktif();
  if not exists (select 1 from public.room_online where topik = p_topik and host_id = uid and kedaluwarsa > now()) then
    raise exception 'bukan host' using errcode = '42501';
  end if;
  if jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) < 3 or jsonb_array_length(p_baris) > 20 then
    raise exception 'baris tidak valid' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_baris) e
      where not exists (select 1 from public.anggota_room a where a.topik = p_topik and a.user_id = (e->>'user_id')::uuid)
  ) > 0 then
    raise exception 'pemain bukan anggota room' using errcode = '42501';
  end if;
  if (select count(distinct e->>'user_id') from jsonb_array_elements(p_baris) e) <> jsonb_array_length(p_baris) then
    raise exception 'pemain ganda' using errcode = '22023';
  end if;
  insert into public.riwayat_main (
    id_main, user_id, mode, peran, menang, pemenang,
    kata_civilian, kata_undercover, jumlah_pemain, adalah_lovers, lovers_menang
  )
  select p_id_main, (e->>'user_id')::uuid, 'online', e->>'peran', (e->>'menang')::boolean, e->>'pemenang',
    left(e->>'kata_civilian', 60), left(e->>'kata_undercover', 60), jsonb_array_length(p_baris),
    coalesce((e->>'adalah_lovers')::boolean, false),
    coalesce((e->>'lovers_menang')::boolean, false)
  from jsonb_array_elements(p_baris) e
  on conflict (id_main, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.catat_hasil_room(text, uuid, jsonb) from public, anon;
grant execute on function public.catat_hasil_room(text, uuid, jsonb) to authenticated;

-- ---- agregat musim + top3 ----
drop function if exists privat.agregat_musim(text);
create or replace function privat.agregat_musim(p_musim text)
returns table (
  user_id uuid,
  main int, menang int,
  civ_main int, civ_menang int,
  uc_main int, uc_menang int,
  mw_main int, mw_menang int,
  jes_main int, jes_menang int,
  lov_main int, lov_menang int
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
    count(*) filter (where r.peran = 'mrwhite' and r.menang)::int,
    count(*) filter (where r.peran = 'jester')::int,
    count(*) filter (where r.peran = 'jester' and r.menang)::int,
    count(*) filter (where r.adalah_lovers)::int,
    count(*) filter (where r.lovers_menang)::int
  from public.riwayat_main r, b
  where r.waktu >= b.awal and r.waktu < b.akhir and r.mode = 'online'
  group by r.user_id;
$$;
revoke all on function privat.agregat_musim(text) from public, anon, authenticated;

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
  elsif p_kategori in ('civilian','undercover','mrwhite','jester','lovers') then
    return query
    with a as (select * from privat.agregat_musim(p_musim)),
    s as (
      select a.user_id,
        case p_kategori
          when 'civilian' then a.civ_main when 'undercover' then a.uc_main
          when 'mrwhite' then a.mw_main when 'jester' then a.jes_main
          else a.lov_main end as pm,
        case p_kategori
          when 'civilian' then a.civ_menang when 'undercover' then a.uc_menang
          when 'mrwhite' then a.mw_menang when 'jester' then a.jes_menang
          else a.lov_menang end as pw
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
  foreach k in array array['keseluruhan','civilian','undercover','mrwhite','jester','lovers','winrate','main'] loop
    return query
    select t.user_id, p.username, p.avatar_versi, t.peringkat, t.kategori, t.main, t.menang, t.metrik, m
    from privat.top3_kategori(m, k) t
    join public.profil p on p.id = t.user_id;
  end loop;
end;
$$;
revoke all on function public.top_musim(text) from public, anon;
grant execute on function public.top_musim(text) to authenticated;

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
  foreach k in array array['keseluruhan','civilian','undercover','mrwhite','jester','lovers','winrate','main'] loop
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
            when 'undercover' then 3 when 'mrwhite' then 4
            when 'lovers' then 5 when 'jester' then 6 else 7 end)
        from (
          select * from privat.top3_kategori(m, 'keseluruhan')
          union all select * from privat.top3_kategori(m, 'civilian')
          union all select * from privat.top3_kategori(m, 'undercover')
          union all select * from privat.top3_kategori(m, 'mrwhite')
          union all select * from privat.top3_kategori(m, 'jester')
          union all select * from privat.top3_kategori(m, 'lovers')
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

comment on column public.riwayat_main.adalah_lovers is 'Pemain ini pasangan Lovers di game tersebut.';
comment on column public.riwayat_main.lovers_menang is 'Lovers menang tambahan: keduanya bertahan sampai akhir.';
