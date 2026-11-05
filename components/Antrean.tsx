'use client';

// Matchmaking Online: pilih kapasitas room (4 sampai 8) atau Acak, lalu masuk ke room match terbuka.
import { useEffect, useRef, useState } from 'react';
import { labelUkuran, UKURAN_MATCH, type StatusMatch } from '@/lib/online/antrean';
import { cariMatch, keluarMatch } from '@/lib/supabase/antrean';
import { Tanda, TombolMenu } from './ui';
import { TombolSuara } from './PanelSuara';

export function KartuCariMatch({ onCari }: { onCari: (ukuran: number | null) => void }) {
  const [ukuran, setUkuran] = useState<number | null>(null);
  return (
    <div className="kartu">
      <h2>Cari match</h2>
      <p className="catatan">Masuk ke room pemain lain yang belum mulai, atau buka room baru dan tunggu pemain lain.</p>
      <p className="label">Maksimal pemain</p>
      <div className="chip-grup" role="group" aria-label="Maksimal pemain match">
        {[null, ...UKURAN_MATCH].map((u) => (
          <button key={u ?? 'acak'} className={`chip ${ukuran === u ? 'pilih' : ''}`} aria-pressed={ukuran === u} onClick={() => setUkuran(u)}>
            {u === null ? 'Acak' : u}
          </button>
        ))}
      </div>
      <p className="catatan">
        {ukuran === null
          ? 'Acak: masuk room match mana saja yang belum mulai. Jika tidak ada, dibuat room baru maksimal 8 pemain.'
          : `Room maksimal ${ukuran} pemain. Mulai otomatis saat penuh, atau setelah 60 detik tanpa pemain baru bila sudah minimal 4.`}
      </p>
      <button className="utama jarak-atas" id="cari-match" onClick={() => onCari(ukuran)}>Cari match</button>
    </div>
  );
}

export function LayarAntrean({ ukuran, onCocok, onBatal }: {
  ukuran: number | null;
  onCocok: (s: StatusMatch) => void;
  onBatal: (galat?: string) => void;
}) {
  const cocokRef = useRef(onCocok);
  const batalRef = useRef(onBatal);
  const [galat, setGalat] = useState<string | null>(null);
  useEffect(() => {
    cocokRef.current = onCocok;
    batalRef.current = onBatal;
  }, [onCocok, onBatal]);

  useEffect(() => {
    let hidup = true;
    cariMatch(ukuran)
      .then((s) => {
        if (!hidup) {
          // Sudah dibatalkan saat permintaan berjalan: lepas kursinya.
          if (s) void keluarMatch().catch(() => undefined);
          return;
        }
        if (s) cocokRef.current(s);
        else setGalat('Gagal mencari match. Coba lagi.');
      })
      .catch((e: { message?: string }) => {
        if (hidup) batalRef.current(e?.message?.includes('login') ? 'Login dulu untuk mencari match.' : 'Gagal mencari match. Coba lagi.');
      });
    return () => {
      hidup = false;
    };
  }, [ukuran]);

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
          <h2>Mencari room</h2>
          <p>Pilihan: <strong>{labelUkuran(ukuran)}</strong></p>
          {galat && <p className="galat" role="alert">{galat}</p>}
          <button className="kedua jarak-atas" id="batal-antrean" onClick={() => onBatal()}>Batal</button>
        </div>
      </section>
    </main>
  );
}
