-- Daftar room publik di menu Online: host memublikasikan kode + meta aman lewat detak.
-- Hapus penolakan "room penuh" di gabung_room (batas komposisi hanya saat Mulai di klien).

alter table public.room_online
  add column if not exists publik boolean not null default false,
  add column if not exists kode text,
  add column if not exists meta jsonb;

comment on column public.room_online.publik is 'True = tampil di daftar room publik (kode ikut diekspos).';
comment on column public.room_online.kode is 'Kode join (hanya diisi saat publik). Privat: null.';
comment on column public.room_online.meta is 'Meta aman: host, jumlah, status lobby|main, sumber, kategori. Bukan kata/peran.';

create index if not exists room_online_publik_detak_idx
  on public.room_online (publik, host_detak desc)
  where publik and kode is not null;

-- Hapus overload lama sebelum menambah parameter opsional.
drop function if exists public.detak_host(text, text);

create or replace function public.detak_host(
  p_topik text,
  p_snapshot text,
  p_publik boolean default null,
  p_kode text default null,
  p_meta jsonb default null
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  kode_bersih text;
  meta_aman jsonb;
begin
  perform privat.wajib_sesi_aktif();
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;

  kode_bersih := upper(btrim(coalesce(p_kode, '')));
  if p_publik is true then
    if kode_bersih !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4,6}$' then
      raise exception 'kode publik tidak valid' using errcode = '22023';
    end if;
    meta_aman := jsonb_strip_nulls(jsonb_build_object(
      'host', left(btrim(coalesce(p_meta->>'host', '')), 20),
      'jumlah', greatest(0, least(100, coalesce((p_meta->>'jumlah')::int, 0))),
      'status', case when p_meta->>'status' in ('lobby', 'main') then p_meta->>'status' else 'lobby' end,
      'sumber', left(btrim(coalesce(p_meta->>'sumber', '')), 40),
      'kategori', left(btrim(coalesce(p_meta->>'kategori', '')), 80)
    ));
  end if;

  update public.room_online set
    host_detak = now(),
    snapshot = coalesce(p_snapshot, snapshot),
    kedaluwarsa = now() + interval '6 hours',
    publik = case when p_publik is null then publik else p_publik end,
    kode = case
      when p_publik is null then kode
      when p_publik is true then kode_bersih
      else null
    end,
    meta = case
      when p_publik is null then meta
      when p_publik is true then meta_aman
      else null
    end
  where topik = p_topik and host_id = uid;
  return found;
end $function$;

create or replace function public.gabung_room(p_topik text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare uid uuid := (select auth.uid()); n text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  perform privat.wajib_sesi_aktif();
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  perform public.bersihkan_room();
  if not exists (select 1 from public.room_online where topik = p_topik and kedaluwarsa > now()) then return null; end if;
  -- Tidak ada batas "penuh" di join: pemain mid-game masuk sebagai penonton; komposisi dicek saat Mulai.
  insert into public.anggota_room (topik, user_id, nonce) values (p_topik, uid, n)
  on conflict (topik, user_id) do update set nonce = n;
  return n;
end $function$;

create or replace function public.daftar_room_publik()
returns table (
  kode text,
  host text,
  jumlah integer,
  status text,
  sumber text,
  kategori text
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform privat.wajib_sesi_aktif();
  return query
  select
    r.kode,
    coalesce(r.meta->>'host', '')::text,
    greatest(0, coalesce((r.meta->>'jumlah')::int, 0))::integer,
    case when r.meta->>'status' = 'main' then 'main' else 'lobby' end::text,
    coalesce(r.meta->>'sumber', '')::text,
    coalesce(r.meta->>'kategori', '')::text
  from public.room_online r
  where r.publik
    and r.kode is not null
    and r.kedaluwarsa > now()
    and not r.host_keluar
    and r.host_detak > now() - interval '15 seconds'
    and coalesce((r.meta->>'jumlah')::int, 0) >= 1
  order by r.host_detak desc
  limit 40;
end $function$;

revoke all on function public.detak_host(text, text, boolean, text, jsonb) from public, anon;
grant execute on function public.detak_host(text, text, boolean, text, jsonb) to authenticated;
revoke all on function public.gabung_room(text) from public, anon;
grant execute on function public.gabung_room(text) to authenticated;
revoke all on function public.daftar_room_publik() from public, anon;
grant execute on function public.daftar_room_publik() to authenticated;
