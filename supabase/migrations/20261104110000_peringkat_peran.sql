-- Leaderboard per peran dan winrate. security_invoker agar RLS tabel asal berlaku; hanya authenticated.
-- peran 'semua' = gabungan semua peran. winrate = menang / main (0 sampai 1).
create view public.papan_peringkat_peran with (security_invoker = true) as
select p.id, p.username, p.avatar_versi, s.peran, s.main, s.menang,
       round(s.menang::numeric / nullif(s.main, 0), 4) as winrate
from public.profil p
join public.statistik s on s.user_id = p.id
union all
select p.id, p.username, p.avatar_versi, 'semua' as peran, sum(s.main)::integer, sum(s.menang)::integer,
       round(sum(s.menang)::numeric / nullif(sum(s.main), 0), 4)
from public.profil p
join public.statistik s on s.user_id = p.id
group by p.id, p.username, p.avatar_versi;
revoke all on public.papan_peringkat_peran from public, anon;
grant select on public.papan_peringkat_peran to authenticated;
