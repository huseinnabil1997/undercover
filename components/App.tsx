'use client';

// Beranda: pilih main online (HP masing-masing) atau main di satu HP (pass-and-play).
import { useState } from 'react';
import { kodeDariUrl } from '@/lib/online/room';
import { bacaSesi } from '@/lib/online/sesi';
import { DialogProvider } from './Modal';
import OnlineGame from './OnlineGame';
import UndercoverGame from './UndercoverGame';
import { Tanda } from './ui';

type Mode = 'beranda' | 'online' | 'offline';

function modeAwal(): { mode: Mode; kode: string | null } {
  const kode = kodeDariUrl(window.location.search);
  // Link undangan (?room=) atau sesi online di tab ini (mis. setelah refresh) langsung ke mode online.
  if (kode || bacaSesi('tab')) return { mode: 'online', kode };
  return { mode: 'beranda', kode: null };
}

export default function App() {
  return (
    <DialogProvider>
      <Isi />
    </DialogProvider>
  );
}

function Isi() {
  const [awal] = useState(modeAwal);
  const [mode, setMode] = useState<Mode>(awal.mode);

  function keBeranda() {
    // Buang ?room= dari URL agar tidak membuka form gabung lagi saat refresh.
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
    setMode('beranda');
  }

  if (mode === 'online') return <OnlineGame kodeAwal={awal.kode} onBeranda={keBeranda} />;
  if (mode === 'offline') return <UndercoverGame onBeranda={keBeranda} />;

  return (
    <main className="wadah beranda masuk">
      <div className="pahlawan">
        <Tanda ukuran={56} />
        <h1>Undercover</h1>
        <p className="sub">Tebak kata. Cari penyusup.</p>
      </div>
      <div className="pilihan">
        <button className="utama" onClick={() => setMode('online')}>Online</button>
        <button className="kedua" onClick={() => setMode('offline')}>Lokal</button>
        <p className="catatan tengah-teks nol">Tanpa login</p>
      </div>
    </main>
  );
}
