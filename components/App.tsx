'use client';

// Beranda: pilih main online (HP masing-masing) atau main di satu HP (pass-and-play).
import { useCallback, useEffect, useRef, useState } from 'react';
import { kodeDariUrl } from '@/lib/online/room';
import { bacaSesi } from '@/lib/online/sesi';
import { bersihkanKunciLama } from '@/lib/storage';
import { DialogProvider } from './Modal';
import OnlineGame from './OnlineGame';
import UndercoverGame from './UndercoverGame';
import { Tanda, type Penjaga } from './ui';

type Mode = 'beranda' | 'online' | 'offline';

/** Penanda entri riwayat browser milik aplikasi ini. */
const KUNCI_RIWAYAT = 'undercover';

function modeAwal(): { mode: Mode; kode: string | null } {
  const kode = kodeDariUrl(window.location.search);
  // Link undangan (?room=) atau sesi online di tab ini (mis. setelah refresh) langsung ke mode online.
  if (kode || bacaSesi('tab')) return { mode: 'online', kode };
  return { mode: 'beranda', kode: null };
}

function modeRiwayat(state: unknown): Mode | null {
  const m = (state as Record<string, unknown> | null)?.[KUNCI_RIWAYAT];
  return m === 'beranda' || m === 'online' || m === 'offline' ? m : null;
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
  const modeRef = useRef<Mode>(awal.mode);
  /** Diisi layar game: konfirmasi dan bersih-bersih sebelum kembali ke menu. */
  const penjaga = useRef<Penjaga | null>(null);
  /** true saat history.back() dipicu oleh aplikasi sendiri (penjaga sudah lolos). */
  const lewati = useRef(false);
  const daftarPenjaga = useCallback((p: Penjaga | null) => {
    penjaga.current = p;
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const keBerandaLangsung = useCallback(() => {
    penjaga.current = null;
    // Buang ?room= dari URL agar tidak membuka form gabung lagi saat refresh.
    if (window.location.search) window.history.replaceState({ [KUNCI_RIWAYAT]: 'beranda' }, '', window.location.pathname);
    setMode('beranda');
  }, []);

  // Riwayat browser: menu di entri dasar, mode main di entri di atasnya, jadi tombol back browser kembali ke menu.
  useEffect(() => {
    bersihkanKunciLama();
    if (awal.mode !== 'beranda' && !modeRiwayat(window.history.state)) {
      const url = window.location.pathname + window.location.search;
      window.history.replaceState({ [KUNCI_RIWAYAT]: 'beranda' }, '', window.location.pathname);
      window.history.pushState({ [KUNCI_RIWAYAT]: awal.mode }, '', url);
    } else if (!modeRiwayat(window.history.state)) {
      window.history.replaceState({ [KUNCI_RIWAYAT]: 'beranda' }, '', window.location.pathname + window.location.search);
    }
  }, [awal.mode]);

  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const tujuan = modeRiwayat(e.state) ?? 'beranda';
      if (tujuan !== 'beranda') {
        setMode(tujuan);
        return;
      }
      if (lewati.current || modeRef.current === 'beranda') {
        lewati.current = false;
        keBerandaLangsung();
        return;
      }
      const p = penjaga.current;
      if (!p) {
        keBerandaLangsung();
        return;
      }
      // Tahan dulu di layar sekarang, lalu tanya lewat modal (tanpa dialog bawaan browser).
      window.history.pushState({ [KUNCI_RIWAYAT]: modeRef.current }, '', window.location.pathname + window.location.search);
      void p().then((ok) => {
        if (!ok) return;
        lewati.current = true;
        window.history.back();
      });
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [keBerandaLangsung]);

  function masuk(m: Mode) {
    window.history.pushState({ [KUNCI_RIWAYAT]: m }, '', window.location.pathname);
    setMode(m);
  }

  const keMenu = useCallback(async () => {
    const p = penjaga.current;
    if (p && !(await p())) return;
    penjaga.current = null;
    const m = modeRiwayat(window.history.state);
    if (m && m !== 'beranda') {
      lewati.current = true;
      window.history.back();
    } else {
      keBerandaLangsung();
    }
  }, [keBerandaLangsung]);

  if (mode === 'online') return <OnlineGame kodeAwal={awal.kode} onBeranda={keMenu} daftarPenjaga={daftarPenjaga} />;
  if (mode === 'offline') return <UndercoverGame onBeranda={keMenu} daftarPenjaga={daftarPenjaga} />;

  return (
    <main className="wadah beranda masuk">
      <div className="pahlawan">
        <Tanda ukuran={44} />
        <h1>Undercover</h1>
        <p className="sub">Tebak kata. Cari penyusup.</p>
      </div>
      <div className="ilustrasi">
        {/* Ekspor statis tanpa optimasi gambar Next, jadi pakai img biasa. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/undercover-hero.webp`}
          alt="Ilustrasi empat pemain, satu di antaranya penyusup bertopeng hijau"
          width={600}
          height={366}
          decoding="async"
        />
      </div>
      <div className="pilihan">
        <button className="utama" onClick={() => masuk('online')}>Online</button>
        <button className="kedua" onClick={() => masuk('offline')}>Lokal</button>
        <p className="catatan tengah-teks nol">Tanpa login</p>
      </div>
    </main>
  );
}
