-- Tahap 2: leaderboard dan kamus pemain.

-- Leaderboard: ringkasan statistik per pemain. security_invoker agar RLS tabel asal tetap berlaku
-- (hanya pengguna login yang bisa membaca).
create view public.papan_peringkat with (security_invoker = true) as
select p.id, p.username, p.avatar_versi, sum(s.main)::integer as main, sum(s.menang)::integer as menang
from public.profil p
join public.statistik s on s.user_id = p.id
group by p.id, p.username, p.avatar_versi;
revoke all on public.papan_peringkat from public, anon;
grant select on public.papan_peringkat to authenticated;

-- Kamus pemain: pasangan kata buatan pemain. Publik dibaca (termasuk tanpa login), ditulis hanya
-- oleh pemiliknya. Kata 2 sampai 30 karakter, tanpa spasi ganda atau spasi di tepi, kedua kata beda.
-- Duplikat dicegah lintas pemain lewat kunci pasangan (urutan dan besar kecil huruf diabaikan).
create table public.kamus_pemain (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profil (id) on delete cascade,
  kata_a text not null,
  kata_b text not null,
  kategori text not null default 'Umum',
  kunci text generated always as (
    least(lower(kata_a), lower(kata_b)) || '|' || greatest(lower(kata_a), lower(kata_b))
  ) stored,
  dibuat timestamptz not null default now(),
  diubah timestamptz not null default now(),
  constraint kamus_pemain_kata_a check (char_length(kata_a) between 2 and 30 and kata_a ~ '^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9''.&-]*( [A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9''.&-]*)*$'),
  constraint kamus_pemain_kata_b check (char_length(kata_b) between 2 and 30 and kata_b ~ '^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9''.&-]*( [A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9''.&-]*)*$'),
  constraint kamus_pemain_beda check (lower(kata_a) <> lower(kata_b)),
  constraint kamus_pemain_kategori check (char_length(kategori) between 2 and 24 and kategori ~ '^[A-Za-zÀ-ÿ0-9]+( [A-Za-zÀ-ÿ0-9&-]+)*$'),
  constraint kamus_pemain_unik unique (kunci)
);
create index kamus_pemain_user on public.kamus_pemain (user_id, dibuat desc);
alter table public.kamus_pemain enable row level security;
create policy "kamus dibaca semua" on public.kamus_pemain for select to anon, authenticated using (true);
create policy "kamus ditambah pemiliknya" on public.kamus_pemain for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "kamus diubah pemiliknya" on public.kamus_pemain for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "kamus dihapus pemiliknya" on public.kamus_pemain for delete to authenticated
  using (user_id = (select auth.uid()));
grant select on public.kamus_pemain to anon, authenticated;
grant insert (kata_a, kata_b, kategori), update (kata_a, kata_b, kategori), delete on public.kamus_pemain to authenticated;

-- Batas 300 pasangan per pemain dan cap waktu ubah.
create function privat.jaga_kamus() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.kamus_pemain where user_id = new.user_id) >= 300 then
      raise exception 'batas kamus tercapai' using errcode = 'P0001';
    end if;
  else
    new.diubah := now();
  end if;
  return new;
end $$;
revoke all on function privat.jaga_kamus() from public, anon, authenticated;
create trigger jaga_kamus before insert or update on public.kamus_pemain for each row execute function privat.jaga_kamus();
