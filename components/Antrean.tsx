'use client';

// Matchmaking Online: pilih kapasitas room (4 sampai 8) atau Acak, lalu masuk ke room match terbuka.
import { useEffect, useRef, useState } from 'react';
import { labelUkuran, UKURAN_MATCH, type StatusMatch } from '@/lib/online/antrean';
import { cariMatch, keluarMatch } from '@/lib/supabase/antrean';
import { daftarRoomPublik, type BarisRoomPublikRpc } from '@/lib/supabase/room';
import { kodeValid } from '@/lib/online/room';
import { Tanda, TombolMenu } from './ui';
import { TombolSuara } from './PanelSuara';

const SEGAR_DAFTAR_MS = 10_000;

function labelStatusRoom(s: string): string {
  return s === 'main' ? 'Sedang main' : 'Lobby';
}

/** Daftar room publik aktif: sekali tap gabung. Segar otomatis ~10 dtk + tombol muat ulang. */
export function KartuDaftarRoom({ onGabung, nonaktif }: {
  onGabung: (kode: string) => void;
  nonaktif?: boolean;
}) {
  const [daftar, setDaftar] = useState<BarisRoomPublikRpc[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [tiket, setTiket] = useState(0);

  useEffect(() => {
    let hidup = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!hidup) return;
        setMemuat(true);
        try {
          const rows = await daftarRoomPublik();
          if (!hidup) return;
          setDaftar(Array.isArray(rows) ? rows.filter((r) => r?.kode && kodeValid(String(r.kode))) : []);
          setGalat(null);
        } catch (e: unknown) {
          if (!hidup) return;
          const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : '';
          setGalat(msg.toLowerCase().includes('login') ? 'Login dulu untuk melihat room publik.' : 'Gagal memuat daftar room.');
          setDaftar([]);
        } finally {
          if (hidup) setMemuat(false);
        }
      })();
    }, 0);
    return () => {
      hidup = false;
      window.clearTimeout(timer);
    };
  }, [tiket]);

  useEffect(() => {
    const id = window.setInterval(() => setTiket((n) => n + 1), SEGAR_DAFTAR_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="kartu" id="daftar-room-publik">
      <div className="baris-judul">
        <h2>Room aktif</h2>
        <button type="button" className="tautan" disabled={memuat} onClick={() => setTiket((n) => n + 1)} aria-label="Muat ulang daftar room">
          {memuat ? 'Memuat' : 'Muat ulang'}
        </button>
      </div>
      <p className="catatan">Room publik yang hostnya masih online. Sedang main: masuk sebagai penonton, ikut ronde berikutnya.</p>
      {galat && <p className="galat" role="alert">{galat}</p>}
      {daftar === null ? (
        <p className="catatan">Memuat</p>
      ) : daftar.length === 0 ? (
        <p className="catatan">Belum ada room publik. Buat room Publik atau cari match.</p>
      ) : (
        <ul className="daftar-room" role="list">
          {daftar.map((r) => (
            <li key={r.kode}>
              <button
                type="button"
                className="item-room"
                disabled={nonaktif}
                onClick={() => onGabung(String(r.kode).toUpperCase())}
              >
                <span className="room-atas">
                  <strong className="room-host">{r.host || 'Host'}</strong>
                  <span className={`lencana-status ${r.status === 'main' ? 'main' : 'lobby'}`}>{labelStatusRoom(r.status)}</span>
                </span>
                <span className="room-bawah">
                  <span>{r.jumlah} pemain</span>
                  {(r.sumber || r.kategori) && (
                    <span className="room-meta">{[r.sumber, r.kategori].filter(Boolean).join(' · ')}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
          : `Room maksimal ${ukuran} pemain. Mulai otomatis saat mencapai ${ukuran} pemain, atau setelah 60 detik tanpa pemain baru bila sudah minimal 4.`}
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
