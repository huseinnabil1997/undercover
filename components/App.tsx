'use client';

// Beranda: pilih main online (HP masing-masing) atau main di satu HP (pass-and-play).
import { useState } from 'react';
import { kodeDariUrl } from '@/lib/online/room';
import { bacaSesi } from '@/lib/online/sesi';
import OnlineGame from './OnlineGame';
import UndercoverGame from './UndercoverGame';

type Mode = 'beranda' | 'online' | 'offline';

function modeAwal(): { mode: Mode; kode: string | null } {
  const kode = kodeDariUrl(window.location.search);
  // Link undangan (?room=) atau sesi online di tab ini (mis. setelah refresh) langsung ke mode online.
  if (kode || bacaSesi('tab')) return { mode: 'online', kode };
  return { mode: 'beranda', kode: null };
}

export default function App() {
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
    <main className="wadah">
      <section className="beranda masuk">
        <div className="pahlawan">
          <span className="logo-besar" aria-hidden>🕵️</span>
          <h1>Undercover</h1>
          <p className="sub">Game tebak kata: temukan siapa yang kata rahasianya berbeda.</p>
        </div>
        <button className="pilihan-mode" onClick={() => setMode('online')}>
          <span className="ikon" aria-hidden>📱📱📱</span>
          <strong>Main Online</strong>
          <span>Setiap pemain memakai HP sendiri. Buat room, bagikan kode atau QR.</span>
        </button>
        <button className="pilihan-mode" onClick={() => setMode('offline')}>
          <span className="ikon" aria-hidden>📱</span>
          <strong>Main di Satu HP</strong>
          <span>Cukup satu HP yang dioper bergiliran ke semua pemain.</span>
        </button>
        <p className="catatan tengah-teks">Tanpa login dan tanpa pelacakan. Data hanya disimpan di HP ini.</p>
      </section>
    </main>
  );
}
