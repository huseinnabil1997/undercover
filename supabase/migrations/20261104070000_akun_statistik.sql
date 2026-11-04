-- Tahap 1: akun (username unik), profil, riwayat main per pengguna, dan statistik per peran.
-- Semua tabel memakai RLS; hanya role authenticated yang diberi akses (anon tidak bisa baca/tulis).

create schema if not exists privat;
revoke all on schema privat from public, anon, authenticated;

-- Profil: satu baris per akun. Username 3 sampai 20 karakter (huruf, angka, underscore), unik tanpa beda besar kecil.
create table public.profil (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  dibuat timestamptz not null default now()
);
create unique index profil_username_unik on public.profil (lower(username));
alter table public.profil enable row level security;
create policy "profil dibaca pengguna login" on public.profil for select to authenticated using (true);
grant select on public.profil to authenticated;

-- Profil dibuat otomatis saat akun dibuat. Username diambil dari metadata pendaftaran dan harus sama
-- dengan bagian lokal email sintetis (username@...), sehingga keunikan juga dijaga oleh Supabase Auth.
create function privat.buat_profil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  u text := new.raw_user_meta_data ->> 'username';
begin
  if u is null or u !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'username tidak valid';
  end if;
  if lower(split_part(new.email, '@', 1)) <> lower(u) then
    raise exception 'username tidak cocok dengan akun';
  end if;
  insert into public.profil (id, username) values (new.id, u);
  return new;
end $$;
revoke all on function privat.buat_profil() from public, anon, authenticated;
create trigger buat_profil after insert on auth.users for each row execute function privat.buat_profil();

-- Riwayat main: satu baris per (pertandingan, pengguna). Pengguna hanya mencatat dan membaca miliknya sendiri.
create table public.riwayat_main (
  id bigint generated always as identity primary key,
  id_main uuid not null,
  user_id uuid not null default auth.uid() references public.profil (id) on delete cascade,
  mode text not null check (mode in ('online', 'lokal')),
  peran text not null check (peran in ('civilian', 'undercover', 'mrwhite')),
  menang boolean not null,
  pemenang text not null check (pemenang in ('civilian', 'penyusup', 'mrwhite')),
  kata_civilian text not null check (char_length(kata_civilian) between 1 and 60),
  kata_undercover text not null check (char_length(kata_undercover) between 1 and 60),
  jumlah_pemain smallint not null check (jumlah_pemain between 3 and 20),
  waktu timestamptz not null default now(),
  constraint riwayat_main_unik unique (id_main, user_id),
  -- Menang harus konsisten dengan peran dan pemenang.
  constraint riwayat_main_menang_konsisten check (
    menang = case pemenang
      when 'civilian' then peran = 'civilian'
      when 'mrwhite' then peran = 'mrwhite'
      else peran <> 'civilian'
    end
  )
);
create index riwayat_main_user_waktu on public.riwayat_main (user_id, waktu desc);
alter table public.riwayat_main enable row level security;
create policy "riwayat milik sendiri dibaca" on public.riwayat_main for select to authenticated
  using (user_id = (select auth.uid()));
create policy "riwayat milik sendiri dicatat" on public.riwayat_main for insert to authenticated
  with check (user_id = (select auth.uid()));
grant select on public.riwayat_main to authenticated;
-- user_id dan waktu tidak bisa diisi klien (selalu auth.uid() dan now()).
grant insert (id_main, mode, peran, menang, pemenang, kata_civilian, kata_undercover, jumlah_pemain)
  on public.riwayat_main to authenticated;

-- Statistik per peran, diperbarui otomatis dari riwayat. Publik untuk pengguna login (profil dan leaderboard).
create table public.statistik (
  user_id uuid not null references public.profil (id) on delete cascade,
  peran text not null check (peran in ('civilian', 'undercover', 'mrwhite')),
  main integer not null default 0,
  menang integer not null default 0,
  primary key (user_id, peran)
);
alter table public.statistik enable row level security;
create policy "statistik dibaca pengguna login" on public.statistik for select to authenticated using (true);
grant select on public.statistik to authenticated;

create function privat.tambah_statistik() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.statistik as s (user_id, peran, main, menang)
  values (new.user_id, new.peran, 1, case when new.menang then 1 else 0 end)
  on conflict (user_id, peran) do update
    set main = s.main + 1, menang = s.menang + excluded.menang;
  return new;
end $$;
revoke all on function privat.tambah_statistik() from public, anon, authenticated;
create trigger tambah_statistik after insert on public.riwayat_main for each row execute function privat.tambah_statistik();
