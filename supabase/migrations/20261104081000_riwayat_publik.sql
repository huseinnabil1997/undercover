-- Profil pemain lain bisa dilihat (read-only) oleh pemain yang login: riwayat permainan dibuka untuk dibaca.
-- Isinya hanya peran, menang/kalah, kata (sudah terbuka di akhir game), jumlah pemain, dan waktu.
-- Menulis tetap hanya baris milik sendiri (kebijakan insert tidak berubah); tidak ada update/delete.
drop policy if exists "riwayat milik sendiri dibaca" on public.riwayat_main;
create policy "riwayat dibaca pengguna login" on public.riwayat_main for select to authenticated using (true);
