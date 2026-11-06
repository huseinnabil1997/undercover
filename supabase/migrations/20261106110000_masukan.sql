-- Fitur Masukan (saran/feedback) + upvote.
-- Status hanya diubah admin lewat SQL (tidak ada policy UPDATE untuk authenticated).

create table if not exists public.masukan (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profil (id) on delete cascade,
  isi text not null,
  kategori text not null default 'lainnya'
    check (kategori in ('bug', 'fitur', 'lainnya')),
  status text not null default 'baru'
    check (status in ('baru', 'diterima', 'dikerjakan', 'selesai', 'ditolak')),
  dibuat timestamptz not null default now(),
  constraint masukan_isi_panjang check (char_length(btrim(isi)) between 1 and 500)
);
create index if not exists masukan_dibuat on public.masukan (dibuat desc);
create index if not exists masukan_user_hari on public.masukan (user_id, dibuat desc);
alter table public.masukan enable row level security;
revoke all on public.masukan from public, anon;
grant select, insert on public.masukan to authenticated;
grant usage, select on sequence public.masukan_id_seq to authenticated;

drop policy if exists "masukan dibaca login" on public.masukan;
create policy "masukan dibaca login" on public.masukan
  for select to authenticated using (true);

drop policy if exists "masukan ditambah sendiri" on public.masukan;
create policy "masukan ditambah sendiri" on public.masukan
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'baru'
  );

-- Tidak ada policy update/delete: status & isi tidak bisa diubah klien.

create table if not exists public.vote_masukan (
  masukan_id bigint not null references public.masukan (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profil (id) on delete cascade,
  dibuat timestamptz not null default now(),
  primary key (masukan_id, user_id)
);
create index if not exists vote_masukan_user on public.vote_masukan (user_id);
alter table public.vote_masukan enable row level security;
revoke all on public.vote_masukan from public, anon;
grant select, insert, delete on public.vote_masukan to authenticated;

drop policy if exists "vote dibaca login" on public.vote_masukan;
create policy "vote dibaca login" on public.vote_masukan
  for select to authenticated using (true);

drop policy if exists "vote ditambah sendiri" on public.vote_masukan;
create policy "vote ditambah sendiri" on public.vote_masukan
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "vote dihapus sendiri" on public.vote_masukan;
create policy "vote dihapus sendiri" on public.vote_masukan
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Anti-spam: maksimal 5 masukan per user per hari (Asia/Jakarta).
create or replace function privat.batas_masukan_harian()
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
  if new.isi is null or char_length(new.isi) < 1 or char_length(new.isi) > 500 then
    raise exception 'isi masukan 1-500 karakter' using errcode = '22023';
  end if;
  new.status := 'baru';
  select count(*)::int into n
  from public.masukan m
  where m.user_id = new.user_id
    and (m.dibuat at time zone 'Asia/Jakarta')::date
        = ((now() at time zone 'Asia/Jakarta')::date);
  if n >= 5 then
    raise exception 'batas 5 masukan per hari' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function privat.batas_masukan_harian() from public, anon, authenticated;

drop trigger if exists masukan_batas_harian on public.masukan;
create trigger masukan_batas_harian
  before insert on public.masukan
  for each row execute function privat.batas_masukan_harian();

-- Daftar masukan + jumlah vote + apakah saya sudah vote.
create or replace function public.daftar_masukan(p_urut text default 'vote')
returns table (
  id bigint,
  user_id uuid,
  username text,
  isi text,
  kategori text,
  status text,
  dibuat timestamptz,
  jumlah_vote bigint,
  saya_vote boolean
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
    ) as saya_vote
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

-- Toggle upvote: true = sekarang vote, false = batal.
create or replace function public.toggle_vote_masukan(p_id bigint)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'harus masuk' using errcode = '42501';
  end if;
  if not exists (select 1 from public.masukan m where m.id = p_id) then
    raise exception 'masukan tidak ada' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.vote_masukan v where v.masukan_id = p_id and v.user_id = uid) then
    delete from public.vote_masukan where masukan_id = p_id and user_id = uid;
    return false;
  end if;
  insert into public.vote_masukan (masukan_id, user_id) values (p_id, uid);
  return true;
end;
$$;
revoke all on function public.toggle_vote_masukan(bigint) from public, anon;
grant execute on function public.toggle_vote_masukan(bigint) to authenticated;

comment on table public.masukan is 'Saran/feedback pemain. Status diubah admin lewat SQL.';
comment on table public.vote_masukan is 'Upvote masukan: 1 vote per user per masukan.';
comment on column public.masukan.status is 'baru|diterima|dikerjakan|selesai|ditolak';
