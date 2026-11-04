-- public.rls_auto_enable() adalah fungsi event trigger bawaan project (ensure_rls, RLS otomatis untuk tabel baru).
-- Event trigger tidak memeriksa hak EXECUTE, jadi aman dicabut dari peran API (lint 0028/0029).
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
