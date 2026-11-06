-- Balasan Masukan + kehadiran room (presence/heartbeat, independen dari host).

-- ===================== Balasan masukan =====================
create table if not exists public.balasan_masukan (
  id bigint generated always as identity primary key,
  masukan_id bigint not null references public.masukan (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profil (id) on delete cascade,
  isi text not null,
  dibuat timestamptz not null default now(),
  constraint balasan_masukan_isi_panjang check (char_length(btrim(isi)) between 1 and 300)
);
create index if not exists balasan_masukan_masukan on public.balasan_masukan (masukan_id, dibuat);
create index if not exists balasan_masukan_user_hari on public.balasan_masukan (user_id, dibuat desc);
alter table public.balasan_masukan enable row level security;
revoke all on public.balasan_masukan from public, anon;
grant select, insert, delete on public.balasan_masukan to authenticated;
grant usage, select on sequence public.balasan_masukan_id_seq to authenticated;

drop policy if exists "balasan dibaca login" on public.balasan_masukan;
create policy "balasan dibaca login" on public.balasan_masukan
  for select to authenticated using (true);

drop policy if exists "balasan ditambah sendiri" on public.balasan_masukan;
create policy "balasan ditambah sendiri" on public.balasan_masukan
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "balasan dihapus sendiri" on public.balasan_masukan;
create policy "balasan dihapus sendiri" on public.balasan_masukan
  for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function privat.batas_balasan_masukan_harian()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  if new.user_id is distinct from (select auth.uid()) then
    raise exception 'user_id tidak cocok' using errcode = '42501';
  end if;
  new.isi := btrim(new.isi);
  if new.isi is null or char_length(new.isi) < 1 or char_length(new.isi) > 300 then
    raise exception 'isi balasan 1-300 karakter' using errcode = '22023';
  end if;
  if not exists (select 1 from public.masukan m where m.id = new.masukan_id) then
    raise exception 'masukan tidak ada' using errcode = 'P0002';
  end if;
  select count(*)::int into n
  from public.balasan_masukan b
  where b.user_id = new.user_id
    and (b.dibuat at time zone 'Asia/Jakarta')::date
        = ((now() at time zone 'Asia/Jakarta')::date);
  if n >= 20 then
    raise exception 'batas 20 balasan per hari' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function privat.batas_balasan_masukan_harian() from public, anon, authenticated;

drop trigger if exists balasan_masukan_batas_harian on public.balasan_masukan;
create trigger balasan_masukan_batas_harian
  before insert on public.balasan_masukan
  for each row execute function privat.batas_balasan_masukan_harian();

-- Tambah jumlah_balasan ke daftar_masukan (ganti return type).
drop function if exists public.daftar_masukan(text);
create function public.daftar_masukan(p_urut text default 'vote')
returns table (
  id bigint,
  user_id uuid,
  username text,
  isi text,
  kategori text,
  status text,
  dibuat timestamptz,
  jumlah_vote bigint,
  saya_vote boolean,
  jumlah_balasan bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id,
    m.user_id,
    p.username,
    m.isi,
    m.kategori,
    m.status,
    m.dibuat,
    (select count(*) from public.vote_masukan v where v.masukan_id = m.id) as jumlah_vote,
    exists (
      select 1 from public.vote_masukan v
      where v.masukan_id = m.id and v.user_id = (select auth.uid())
    ) as saya_vote,
    (select count(*) from public.balasan_masukan b where b.masukan_id = m.id) as jumlah_balasan
  from public.masukan m
  join public.profil p on p.id = m.user_id
  order by
    case when coalesce(p_urut, 'vote') = 'baru' then m.dibuat end desc nulls last,
    case when coalesce(p_urut, 'vote') <> 'baru' then
      (select count(*) from public.vote_masukan v where v.masukan_id = m.id)
    end desc nulls last,
    m.dibuat desc;
$$;
revoke all on function public.daftar_masukan(text) from public, anon;
grant execute on function public.daftar_masukan(text) to authenticated;

create or replace function public.daftar_balasan_masukan(p_masukan_id bigint)
returns table (
  id bigint,
  masukan_id bigint,
  user_id uuid,
  username text,
  isi text,
  dibuat timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.masukan_id, b.user_id, p.username, b.isi, b.dibuat
  from public.balasan_masukan b
  join public.profil p on p.id = b.user_id
  where b.masukan_id = p_masukan_id
  order by b.dibuat asc, b.id asc;
$$;
revoke all on function public.daftar_balasan_masukan(bigint) from public, anon;
grant execute on function public.daftar_balasan_masukan(bigint) to authenticated;

comment on table public.balasan_masukan is 'Balasan/thread di bawah masukan. Hapus hanya milik sendiri.';

-- ===================== Kehadiran room (heartbeat + presence) =====================
alter table public.anggota_room
  add column if not exists terlihat timestamptz;

create or replace function public.detak_anggota(p_topik text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  if p_topik is null or p_topik !~ '^[0-9a-f]{32}$' then return; end if;
  update public.anggota_room
    set terlihat = now()
  where topik = p_topik and user_id = uid;
  if not found then
    -- Belum anggota (jarang): abaikan, jangan error di UI.
    return;
  end if;
end;
$$;
revoke all on function public.detak_anggota(text) from public, anon;
grant execute on function public.detak_anggota(text) to authenticated;

create or replace function public.daftar_kehadiran(p_topik text)
returns table (user_id uuid, username text, online boolean, terlihat timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, p.username,
    (a.terlihat is not null and a.terlihat > now() - interval '45 seconds') as online,
    a.terlihat
  from public.anggota_room a
  join public.profil p on p.id = a.user_id
  join public.room_online r on r.topik = a.topik
  where a.topik = p_topik
    and r.kedaluwarsa > now()
    and (select privat.anggota_topik(p_topik));
$$;
revoke all on function public.daftar_kehadiran(text) from public, anon;
grant execute on function public.daftar_kehadiran(text) to authenticated;

-- Presence Realtime di kanal privat "uch:<hex>" (terpisah dari broadcast relay "uc:<hex>").
drop policy if exists "anggota room menerima presence" on realtime.messages;
create policy "anggota room menerima presence" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'presence'
    and realtime.topic() like 'uch:%'
    and (select privat.anggota_topik(substr(realtime.topic(), 5)))
  );
drop policy if exists "anggota room mengirim presence" on realtime.messages;
create policy "anggota room mengirim presence" on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and realtime.topic() like 'uch:%'
    and (select privat.anggota_topik(substr(realtime.topic(), 5)))
  );

comment on column public.anggota_room.terlihat is 'Detak kehadiran pemain (fallback bila presence belum sync). Offline setelah ~45 dtk.';
