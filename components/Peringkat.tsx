'use client';

// Leaderboard pemain Online: menang terbanyak, dengan avatar. Nama membuka profil (read-only).
import { useEffect, useState } from 'react';
import { persen } from '@/lib/akun';
import { KUNCI, simpan } from '@/lib/storage';
import { ambilPeringkat, MIN_MAIN_WINRATE, PERAN_PERINGKAT as PERAN, pilihanPeringkat, URUT_PERINGKAT as URUT, type BarisPeringkat } from '@/lib/supabase/kamus';
import { Kepala, useLihatProfil } from './Akun';
import { Avatar } from './Avatar';

export function LayarPeringkat({ akun, onBeranda }: { akun: { id: string; username: string }; onBeranda: () => void }) {
  const lihat = useLihatProfil();
  const [data, setData] = useState<BarisPeringkat[] | 'galat' | null>(null);
  const [muat, setMuat] = useState(0);
  const [pilih, setPilih] = useState(pilihanPeringkat);
  useEffect(() => {
    let hidup = true;
    ambilPeringkat(pilih.urut, pilih.peran).then((d) => hidup && setData(d), () => hidup && setData('galat'));
    return () => {
      hidup = false;
    };
  }, [muat, pilih]);
  const ubah = (p: Partial<typeof pilih>) => {
    const n = { ...pilih, ...p };
    simpan(KUNCI.peringkatUrut, n.urut);
    simpan(KUNCI.peringkatPeran, n.peran);
    setData(null);
    setPilih(n);
  };
  const namaPeran = PERAN.find((x) => x.id === pilih.peran)!.nama;
  return (
    <main className="wadah">
      <Kepala onBeranda={onBeranda} />
      <section className="tumpuk masuk">
        <div className="kepala-fase"><h2>Peringkat</h2></div>
        <div className="kartu">
          <span className="label">Urutkan</span>
          <div className="chip-grup" role="group" aria-label="Urutkan">
            {URUT.map((x) => <button key={x.id} type="button" className={`chip${pilih.urut === x.id ? ' pilih' : ''}`} aria-pressed={pilih.urut === x.id} onClick={() => ubah({ urut: x.id })}>{x.nama}</button>)}
          </div>
          <span className="label">Peran</span>
          <div className="chip-grup" role="group" aria-label="Peran">
            {PERAN.map((x) => <button key={x.id} type="button" className={`chip${pilih.peran === x.id ? ' pilih' : ''}`} aria-pressed={pilih.peran === x.id} onClick={() => ubah({ peran: x.id })}>{x.nama}</button>)}
          </div>
        </div>
        <p className="catatan tengah-teks nol">
          {pilih.urut === 'menang'
            ? `50 pemain dengan kemenangan Online terbanyak (${namaPeran}). Seri: main lebih sedikit di atas.`
            : `50 pemain dengan winrate Online tertinggi (${namaPeran}), minimal ${MIN_MAIN_WINRATE} kali main. Seri: menang lebih banyak di atas.`}
        </p>
        {data === null && <p className="catatan tengah-teks" role="status">Memuat...</p>}
        {data === 'galat' && (
          <>
            <p className="galat" role="alert">Gagal memuat peringkat. Periksa internet.</p>
            <button className="kedua" onClick={() => { setData(null); setMuat((n) => n + 1); }}>Coba lagi</button>
          </>
        )}
        {Array.isArray(data) && data.length === 0 && <p className="catatan tengah-teks">{pilih.urut === 'winrate' ? `Belum ada pemain dengan minimal ${MIN_MAIN_WINRATE} kali main.` : 'Belum ada permainan tercatat.'}</p>}
        {Array.isArray(data) && data.length > 0 && (
          <ol className="kartu daftar-peringkat">
            {data.map((r, i) => (
              <li key={r.id} className={r.id === akun.id ? 'sendiri' : undefined}>
                <span className="nomor">{i + 1}</span>
                <button type="button" className="tautan nama-dengan-avatar" aria-label={`Lihat profil ${r.username}`} onClick={() => lihat(r.username)}>
                  <Avatar username={r.username} id={r.id} versi={r.avatar_versi} ukuran={32} />
                  <span className="nama-peringkat nama-teks">{r.username}</span>{r.id === akun.id && <em className="label-kamu">(kamu)</em>}
                </button>
                {pilih.urut === 'winrate'
                  ? <span className="angka-peringkat"><strong>{persen(r.menang, r.main) ?? 0}%</strong><br /><small>{r.menang} menang, {r.main} main</small></span>
                  : <span className="angka-peringkat"><strong>{r.menang}</strong> menang<br /><small>{r.main} main, {persen(r.menang, r.main) ?? 0}%</small></span>}
              </li>
            ))}
          </ol>
        )}
        <div className="aksi-bawah" />
      </section>
    </main>
  );
}
