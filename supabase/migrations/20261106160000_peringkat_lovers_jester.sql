-- Papan peringkat semua waktu: filter Lovers (+ Jester sudah dari statistik).
-- Lovers dihitung dari riwayat (adalah_lovers / lovers_menang), bukan baris statistik terpisah.
-- Data lama tidak diubah; hanya recreate view.

create or replace view public.papan_peringkat_peran with (security_invoker = true) as
select p.id, p.username, p.avatar_versi, s.peran, s.main, s.menang,
       round(s.menang::numeric / nullif(s.main, 0), 4) as winrate
from public.profil p
join public.statistik s on s.user_id = p.id
union all
select p.id, p.username, p.avatar_versi, 'semua' as peran,
       sum(s.main)::integer, sum(s.menang)::integer,
       round(sum(s.menang)::numeric / nullif(sum(s.main), 0), 4)
from public.profil p
join public.statistik s on s.user_id = p.id
group by p.id, p.username, p.avatar_versi
union all
select p.id, p.username, p.avatar_versi, 'lovers' as peran,
       count(*)::integer as main,
       count(*) filter (where r.lovers_menang)::integer as menang,
       round(
         (count(*) filter (where r.lovers_menang))::numeric / nullif(count(*), 0),
         4
       ) as winrate
from public.profil p
join public.riwayat_main r on r.user_id = p.id and r.adalah_lovers
group by p.id, p.username, p.avatar_versi;

revoke all on public.papan_peringkat_peran from public, anon;
grant select on public.papan_peringkat_peran to authenticated;
