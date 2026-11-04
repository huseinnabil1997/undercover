'use client';

// Leaderboard pemain Online: menang terbanyak, dengan avatar. Nama membuka profil (read-only).
import { useEffect, useState } from 'react';
import { persen } from '@/lib/akun';
import { ambilPeringkat, type BarisPeringkat } from '@/lib/supabase/kamus';
import { Kepala, useLihatProfil } from './Akun';
import { Avatar } from './Avatar';

export function LayarPeringkat({ akun, onBeranda }: { akun: { id: string; username: string }; onBeranda: () => void }) {
  const lihat = useLihatProfil();
  const [data, setData] = useState<BarisPeringkat[] | 'galat' | null>(null);
  const [muat, setMuat] = useState(0);
  useEffect(() => {
    let hidup = true;
    ambilPeringkat().then((d) => hidup && setData(d), () => hidup && setData('galat'));
    return () => {
      hidup = false;
    };
  }, [muat]);
  return (
    <main className="wadah">
      <Kepala onBeranda={onBeranda} />
      <section className="tumpuk masuk">
        <div className="kepala-fase"><h2>Peringkat</h2></div>
        <p className="catatan tengah-teks nol">50 pemain dengan kemenangan Online terbanyak.</p>
        {data === null && <p className="catatan tengah-teks" role="status">Memuat...</p>}
        {data === 'galat' && (
          <>
            <p className="galat" role="alert">Gagal memuat peringkat. Periksa internet.</p>
            <button className="kedua" onClick={() => { setData(null); setMuat((n) => n + 1); }}>Coba lagi</button>
          </>
        )}
        {Array.isArray(data) && data.length === 0 && <p className="catatan tengah-teks">Belum ada permainan tercatat.</p>}
        {Array.isArray(data) && data.length > 0 && (
          <ol className="kartu daftar-peringkat">
            {data.map((r, i) => (
              <li key={r.id} className={r.id === akun.id ? 'sendiri' : undefined}>
                <span className="nomor">{i + 1}</span>
                <button type="button" className="tautan nama-dengan-avatar" aria-label={`Lihat profil ${r.username}`} onClick={() => lihat(r.username)}>
                  <Avatar username={r.username} id={r.id} versi={r.avatar_versi} ukuran={32} />
                  <span className="nama-peringkat nama-teks">{r.username}</span>{r.id === akun.id && <em className="label-kamu">(kamu)</em>}
                </button>
                <span className="angka-peringkat"><strong>{r.menang}</strong> menang<br /><small>{r.main} main, {persen(r.menang, r.main) ?? 0}%</small></span>
              </li>
            ))}
          </ol>
        )}
        <div className="aksi-bawah" />
      </section>
    </main>
  );
}
