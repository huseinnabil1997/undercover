'use client';

// Matchmaking Online: pilih ukuran match, lalu tunggu di antrean sampai match terbentuk.
import { useEffect, useRef, useState } from 'react';
import { DETAK_ANTREAN_MS, formatTunggu, labelUkuran, UKURAN_MATCH, type StatusAntrean } from '@/lib/online/antrean';
import { detakAntrean, keluarAntrean, keluarAntreanSaatTutup, masukAntrean, pantauAntrean } from '@/lib/supabase/antrean';
import { Tanda, TombolMenu } from './ui';
import { TombolSuara } from './PanelSuara';

export function KartuCariMatch({ onCari }: { onCari: (ukuran: number | null) => void }) {
  const [ukuran, setUkuran] = useState<number | null>(null);
  return (
    <div className="kartu">
      <h2>Cari match</h2>
      <p className="catatan">Main dengan pemain lain yang sedang mencari. Urutan antrean sesuai waktu masuk.</p>
      <p className="label">Jumlah pemain</p>
      <div className="chip-grup" role="group" aria-label="Jumlah pemain match">
        {[null, ...UKURAN_MATCH].map((u) => (
          <button key={u ?? 'acak'} className={`chip ${ukuran === u ? 'pilih' : ''}`} aria-pressed={ukuran === u} onClick={() => setUkuran(u)}>
            {u === null ? 'Acak' : u}
          </button>
        ))}
      </div>
      <p className="catatan">{ukuran === null ? 'Acak: masuk match ukuran berapa saja, minimal 4 pemain.' : `Match terbentuk saat ${ukuran} pemain siap.`}</p>
      <button className="utama jarak-atas" id="cari-match" onClick={() => onCari(ukuran)}>Cari match</button>
    </div>
  );
}

export function LayarAntrean({ ukuran, userId, onCocok, onBatal }: {
  ukuran: number | null;
  userId: string;
  onCocok: (s: StatusAntrean) => void;
  onBatal: (galat?: string) => void;
}) {
  const [status, setStatus] = useState<StatusAntrean | null>(null);
  const [mulai] = useState(() => Date.now());
  const [sekarang, setSekarang] = useState(() => Date.now());
  const [galat, setGalat] = useState<string | null>(null);
  const cocokRef = useRef(onCocok);
  const batalRef = useRef(onBatal);
  useEffect(() => {
    cocokRef.current = onCocok;
    batalRef.current = onBatal;
  }, [onCocok, onBatal]);

  useEffect(() => {
    let hidup = true;
    let selesai = false;
    let sibuk = false;
    const terima = (s: StatusAntrean | null) => {
      if (!hidup || selesai) return;
      if (!s) {
        // Baris hilang (mis. basi karena HP tidur): masuk lagi.
        void masukAntrean(ukuran).then(terima).catch(() => setGalat('Gagal masuk antrean. Mencoba lagi.'));
        return;
      }
      setGalat(null);
      setStatus(s);
      if (s.kode) {
        selesai = true;
        cocokRef.current(s);
      }
    };
    const detak = async () => {
      if (sibuk || selesai) return;
      sibuk = true;
      try {
        terima(await detakAntrean());
      } catch {
        if (hidup) setGalat('Koneksi terputus. Mencoba lagi.');
      } finally {
        sibuk = false;
      }
    };
    masukAntrean(ukuran).then(terima).catch((e: { message?: string }) => {
      if (hidup) batalRef.current(e?.message?.includes('login') ? 'Login dulu untuk mencari match.' : 'Gagal masuk antrean. Coba lagi.');
    });
    const id = window.setInterval(() => void detak(), DETAK_ANTREAN_MS);
    const jam = window.setInterval(() => setSekarang(Date.now()), 1000);
    const lepas = pantauAntrean(userId, () => void detak());
    const tutup = () => void keluarAntreanSaatTutup();
    window.addEventListener('pagehide', tutup);
    return () => {
      hidup = false;
      window.clearInterval(id);
      window.clearInterval(jam);
      window.removeEventListener('pagehide', tutup);
      lepas();
      if (!selesai) void keluarAntrean().catch(() => undefined);
    };
  }, [ukuran, userId]);

  return (
    <main className="wadah">
      <header className="kepala">
        <TombolMenu onClick={() => onBatal()} />
        <span className="logo"><Tanda /> Undercover</span>
        <TombolSuara />
      </header>
      <section className="tumpuk tengah masuk">
        <div className="kartu besar" id="layar-antrean">
          <div className="pemutar" aria-hidden />
          <h2>{status?.kode ? 'Match ditemukan' : 'Mencari match'}</h2>
          <p>Ukuran: <strong>{labelUkuran(ukuran)}</strong></p>
          <p role="timer" aria-label="Lama menunggu">{formatTunggu(sekarang - mulai)}</p>
          {status?.menunggu != null && !status.kode && (
            <p className="catatan" data-uji="menunggu">{status.menunggu} pemain menunggu{ukuran === null ? '' : ' untuk ukuran ini'}</p>
          )}
          {status?.kode && <p className="catatan">Masuk ke room {status.jumlah} pemain</p>}
          {galat && <p className="galat" role="alert">{galat}</p>}
          {!status?.kode && <button className="kedua jarak-atas" id="batal-antrean" onClick={() => onBatal()}>Batal</button>}
        </div>
      </section>
    </main>
  );
}
