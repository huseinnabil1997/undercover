-- Urutan prioritas default gelar: Keseluruhan, Winrate, Civilian, Undercover, Mr. White, Match.
-- Hanya memengaruhi urutan slot di gelar_pemain (tampil/default di klien sudah pakai URUT_KATEGORI_DEFAULT).
create or replace function public.gelar_pemain(p_user_id uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m text := privat.kode_musim();
  ids uuid[];
  hasil jsonb;
begin
  perform privat.wajib_sesi_aktif();
  perform public.finalisasi_musim(null);
  if p_user_id is null or array_length(p_user_id, 1) is null then
    ids := array[auth.uid()];
  else
    ids := p_user_id;
  end if;
  select coalesce(jsonb_agg(q.obj order by q.user_id), '[]'::jsonb) into hasil
  from (
    select p.id as user_id, jsonb_build_object(
      'user_id', p.id,
      'username', p.username,
      'avatar_versi', p.avatar_versi,
      'gelar_dipasang', p.gelar_dipasang,
      'musim', m,
      'slot', coalesce((
        select jsonb_agg(jsonb_build_object(
          'kategori', t.kategori, 'peringkat', t.peringkat,
          'main', t.main, 'menang', t.menang, 'metrik', t.metrik
        ) order by t.peringkat,
          case t.kategori
            when 'keseluruhan' then 0 when 'winrate' then 1 when 'civilian' then 2
            when 'undercover' then 3 when 'mrwhite' then 4 else 5 end)
        from (
          select * from privat.top3_kategori(m, 'keseluruhan')
          union all select * from privat.top3_kategori(m, 'civilian')
          union all select * from privat.top3_kategori(m, 'undercover')
          union all select * from privat.top3_kategori(m, 'mrwhite')
          union all select * from privat.top3_kategori(m, 'winrate')
          union all select * from privat.top3_kategori(m, 'main')
        ) t where t.user_id = p.id
      ), '[]'::jsonb),
      'award', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'kategori', a.kategori, 'peringkat', a.peringkat,
          'musim', a.musim, 'main', a.main, 'menang', a.menang, 'metrik', a.metrik
        ) order by a.musim desc, a.peringkat, a.kategori)
        from public.award_musim a where a.user_id = p.id
      ), '[]'::jsonb)
    ) as obj
    from public.profil p
    where p.id = any(ids)
  ) q;
  return hasil;
end;
$$;
