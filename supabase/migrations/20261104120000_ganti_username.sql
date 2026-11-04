-- Ganti username: sekali per 7 hari, format dan keunikan sama seperti daftar. Email sintetis
-- (<username>@undercover.local) ikut diganti agar login memakai nama baru. Data lain terikat id.
alter table public.profil add column username_diganti timestamptz;

create function public.ganti_username(baru text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lama text;
  terakhir timestamptz;
  email_baru text;
begin
  if uid is null then raise exception 'Harus masuk dulu' using errcode = '42501'; end if;
  baru := btrim(coalesce(baru, ''));
  if baru !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Username 3 sampai 20 karakter: huruf, angka, atau underscore' using errcode = '22023';
  end if;
  select username, username_diganti into lama, terakhir from public.profil where id = uid for update;
  if lama is null then raise exception 'Profil tidak ditemukan' using errcode = 'P0002'; end if;
  if baru = lama then raise exception 'Username baru sama dengan yang sekarang' using errcode = '22023'; end if;
  if terakhir is not null and terakhir > now() - interval '7 days' then
    raise exception 'Username baru bisa diganti lagi pada %', to_char((terakhir + interval '7 days') at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB'
      using errcode = 'P0001', hint = 'tunggu';
  end if;
  email_baru := lower(baru) || '@undercover.local';
  if lower(baru) <> lower(lama) and (
       exists (select 1 from public.profil where lower(username) = lower(baru) and id <> uid)
       or exists (select 1 from auth.users where lower(email) = email_baru and id <> uid)) then
    raise exception 'Username sudah dipakai' using errcode = '23505';
  end if;
  update public.profil set username = baru, username_diganti = now() where id = uid;
  update auth.users set email = email_baru,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', baru),
         updated_at = now()
   where id = uid;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', email_baru), updated_at = now()
   where user_id = uid and provider = 'email';
  return now();
end $$;
revoke all on function public.ganti_username(text) from public, anon;
grant execute on function public.ganti_username(text) to authenticated;
