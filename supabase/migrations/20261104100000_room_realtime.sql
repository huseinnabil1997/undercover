-- Tahap 3: room online persisten di Supabase.
-- - Realtime broadcast privat per room (topik "uc:<hex>"), hanya untuk anggota room yang login.
--   Hex topik diturunkan dari kode room (PBKDF2), jadi server tidak menyimpan kode room. Isi pesan tetap AES-GCM.
-- - Verifikasi identitas: anggota mendapat nonce sekali pakai; host menukarnya lewat RPC dan mendapat username asli.
-- - Host pindah otomatis: host mengirim detak + snapshot terenkripsi; bila detak berhenti, anggota lain bisa mengambil alih.
-- - Hasil game dicatat host untuk anggota room yang terverifikasi (pemain tidak lagi mencatat sendiri).
-- Semua tabel hanya diakses lewat fungsi security definer di bawah; peran API tidak punya hak langsung.

create table public.room_online (
  topik text primary key check (topik ~ '^[0-9a-f]{32}$'),
  host_id uuid not null references public.profil (id) on delete cascade,
  host_detak timestamptz not null default now(),
  host_keluar boolean not null default false,
  -- Snapshot state host, terenkripsi AES-GCM dengan kunci room (base64). Hanya dikembalikan ke host baru.
  snapshot text check (snapshot is null or char_length(snapshot) <= 400000),
  dibuat timestamptz not null default now(),
  kedaluwarsa timestamptz not null default now() + interval '6 hours'
);
alter table public.room_online enable row level security;
revoke all on public.room_online from anon, authenticated;

create table public.anggota_room (
  topik text not null references public.room_online (topik) on delete cascade,
  user_id uuid not null references public.profil (id) on delete cascade,
  nonce text,
  gabung timestamptz not null default now(),
  primary key (topik, user_id)
);
create index anggota_room_user on public.anggota_room (user_id);
alter table public.anggota_room enable row level security;
revoke all on public.anggota_room from anon, authenticated;

-- Batas waktu detak host sebelum anggota lain boleh mengambil alih.
create function privat.batas_detak() returns interval language sql immutable as $$ select interval '15 seconds' $$;

create function privat.anggota_topik(p_topik text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.anggota_room a join public.room_online r using (topik)
    where a.topik = p_topik and a.user_id = (select auth.uid()) and r.kedaluwarsa > now()
  )
$$;
revoke all on function privat.anggota_topik(text) from public, anon;
grant usage on schema privat to authenticated;
grant execute on function privat.anggota_topik(text) to authenticated;

-- Realtime: hanya anggota room yang bisa menerima dan mengirim broadcast di topik "uc:<hex>".
create policy "anggota room menerima broadcast" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and realtime.topic() like 'uc:%' and (select privat.anggota_topik(substr(realtime.topic(), 4))));
create policy "anggota room mengirim broadcast" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and realtime.topic() like 'uc:%' and (select privat.anggota_topik(substr(realtime.topic(), 4))));

create function public.bersihkan_room() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.room_online where kedaluwarsa < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.bersihkan_room() from public, anon, authenticated;

-- Host membuat atau mengklaim kembali room. 'ok' | 'dipakai' (host lain masih hidup).
create function public.buat_room(p_topik text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); r public.room_online;
begin
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  perform public.bersihkan_room();
  select * into r from public.room_online where topik = p_topik for update;
  if found and r.host_id <> uid and r.host_detak > now() - privat.batas_detak() and not r.host_keluar then
    return 'dipakai';
  end if;
  if (select count(*) from public.room_online where host_id = uid and topik <> p_topik and kedaluwarsa > now()) >= 5 then
    raise exception 'terlalu banyak room' using errcode = 'P0001';
  end if;
  insert into public.room_online (topik, host_id) values (p_topik, uid)
  on conflict (topik) do update set host_id = uid, host_detak = now(), host_keluar = false, kedaluwarsa = now() + interval '6 hours';
  insert into public.anggota_room (topik, user_id) values (p_topik, uid) on conflict do nothing;
  return 'ok';
end $$;

-- Pemain gabung: jadi anggota (boleh memakai Realtime) dan mendapat nonce identitas sekali pakai.
create function public.gabung_room(p_topik text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); n text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if uid is null then raise exception 'perlu login' using errcode = '42501'; end if;
  if not exists (select 1 from public.room_online where topik = p_topik and kedaluwarsa > now()) then return null; end if;
  if (select count(*) from public.anggota_room where topik = p_topik) >= 30 then raise exception 'room penuh' using errcode = 'P0001'; end if;
  insert into public.anggota_room (topik, user_id, nonce) values (p_topik, uid, n)
  on conflict (topik, user_id) do update set nonce = n;
  return n;
end $$;

-- Host menukar nonce pemain dengan identitas asli (sekali pakai).
create function public.verifikasi_pemain(p_topik text, p_nonce text)
returns table (user_id uuid, username text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.room_online r where r.topik = p_topik and r.host_id = uid) then
    raise exception 'bukan host' using errcode = '42501';
  end if;
  return query
    update public.anggota_room a set nonce = null
    from public.profil p
    where a.topik = p_topik and a.nonce = p_nonce and p_nonce is not null and p.id = a.user_id
    returning a.user_id, p.username;
end $$;

-- Detak host plus snapshot terenkripsi. false bila pemanggil bukan host lagi.
create function public.detak_host(p_topik text, p_snapshot text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.room_online set host_detak = now(), snapshot = coalesce(p_snapshot, snapshot),
    kedaluwarsa = now() + interval '6 hours'
  where topik = p_topik and host_id = (select auth.uid());
  return found;
end $$;

-- Host keluar dengan sengaja: anggota lain bisa langsung mengambil alih.
create function public.tinggalkan_room(p_topik text, p_snapshot text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  update public.room_online set host_keluar = true, snapshot = coalesce(p_snapshot, snapshot)
  where topik = p_topik and host_id = uid;
  delete from public.anggota_room where topik = p_topik and user_id = uid
    and not exists (select 1 from public.room_online where topik = p_topik and host_id = uid);
end $$;

-- Anggota mengambil alih host bila host lama diam atau keluar. Mengembalikan snapshot (null = tidak berhasil).
create function public.ambil_alih_host(p_topik text)
returns table (snapshot text, host_keluar boolean)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); r public.room_online;
begin
  if not privat.anggota_topik(p_topik) then raise exception 'bukan anggota' using errcode = '42501'; end if;
  select * into r from public.room_online where topik = p_topik for update;
  if not found or r.snapshot is null then return; end if;
  if r.host_id <> uid and r.host_detak > now() - privat.batas_detak() and not r.host_keluar then return; end if;
  update public.room_online set host_id = uid, host_detak = now(), host_keluar = false where topik = p_topik;
  return query select r.snapshot, r.host_keluar;
end $$;

-- Host mencatat hasil untuk semua pemain terverifikasi. Tiap baris harus milik anggota room, minimal 3 anggota.
create function public.catat_hasil_room(p_topik text, p_id_main uuid, p_baris jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); n integer;
begin
  if not exists (select 1 from public.room_online where topik = p_topik and host_id = uid and kedaluwarsa > now()) then
    raise exception 'bukan host' using errcode = '42501';
  end if;
  if jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) < 3 or jsonb_array_length(p_baris) > 20 then
    raise exception 'baris tidak valid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_baris) e
    where not exists (select 1 from public.anggota_room a where a.topik = p_topik and a.user_id = (e->>'user_id')::uuid)
  ) then
    raise exception 'pemain bukan anggota room' using errcode = '42501';
  end if;
  if (select count(distinct e->>'user_id') from jsonb_array_elements(p_baris) e) <> jsonb_array_length(p_baris) then
    raise exception 'pemain ganda' using errcode = '22023';
  end if;
  insert into public.riwayat_main (id_main, user_id, mode, peran, menang, pemenang, kata_civilian, kata_undercover, jumlah_pemain)
  select p_id_main, (e->>'user_id')::uuid, 'online', e->>'peran', (e->>'menang')::boolean, e->>'pemenang',
    left(e->>'kata_civilian', 60), left(e->>'kata_undercover', 60), jsonb_array_length(p_baris)
  from jsonb_array_elements(p_baris) e
  on conflict (id_main, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Pemain tidak lagi mencatat hasilnya sendiri.
drop policy if exists "riwayat milik sendiri dicatat" on public.riwayat_main;
revoke insert on public.riwayat_main from authenticated;

do $$
declare f text;
begin
  foreach f in array array['buat_room(text)', 'gabung_room(text)', 'verifikasi_pemain(text,text)', 'detak_host(text,text)',
    'tinggalkan_room(text,text)', 'ambil_alih_host(text)', 'catat_hasil_room(text,uuid,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
