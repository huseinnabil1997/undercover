'use client';

// Beranda: pilih main online (HP masing-masing) atau main di satu HP (pass-and-play).
import { useCallback, useEffect, useRef, useState } from 'react';
import { kodeDariUrl } from '@/lib/online/room';
import { bacaSesi } from '@/lib/online/sesi';
import { bersihkanKunciLama } from '@/lib/storage';
import { bacaUmpan, daftarkanSW, pasangUmpan } from '@/lib/umpan/mesin';
import { AkunProvider, GerbangAkun, LayarProfil } from './Akun';
import { DialogProvider } from './Modal';
import { LayarPeringkat } from './Peringkat';
import { LayarKamus } from './Kamus';
import OnlineGame from './OnlineGame';
import { TombolSuara } from './PanelSuara';
import UndercoverGame from './UndercoverGame';
import { Tanda, type Penjaga } from './ui';

type Mode = 'beranda' | 'online' | 'offline' | 'profil' | 'peringkat' | 'kamus';

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
  return m === 'beranda' || m === 'online' || m === 'offline' || m === 'profil' || m === 'peringkat' || m === 'kamus' ? m : null;
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function App() {
  return (
    <AkunProvider>
      <DialogProvider>
        <Isi />
      </DialogProvider>
    </AkunProvider>
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

  // Suara dibuka pada ketukan pertama; service worker hanya dipasang jika notifikasi giliran diaktifkan.
  useEffect(() => {
    const lepas = pasangUmpan();
    if (bacaUmpan().notifikasi) void daftarkanSW();
    return lepas;
  }, []);

  const keBerandaLangsung = useCallback(() => {
    penjaga.current = null;
    // Buang ?room= dari URL agar tidak membuka form gabung lagi saat refresh.
    if (window.location.search) window.history.replaceState({ [KUNCI_RIWAYAT]: 'beranda' }, '', window.location.pathname);
    setMode('beranda');
  }, []);

  // Riwayat browser: menu di entri dasar, mode main di entri di atasnya, jadi tombol back browser kembali ke menu.
  useEffect(() => {
    bersihkanKunciLama();
    // Flag uji ?jalur= diingat untuk tab ini, karena query URL dibuang saat pindah layar.
    try {
      const jalur = new URLSearchParams(window.location.search).get('jalur');
      if (jalur) window.sessionStorage.setItem('online:jalur', jalur);
    } catch {
      // sessionStorage bisa diblokir; abaikan
    }
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

  if (mode === 'online') {
    return (
      <GerbangAkun alasan="Main Online perlu akun agar hasilnya tercatat." onBeranda={keMenu}>
        {(akun) => <OnlineGame key={akun.id} kodeAwal={awal.kode} username={akun.username} onBeranda={keMenu} daftarPenjaga={daftarPenjaga} />}
      </GerbangAkun>
    );
  }
  if (mode === 'profil') {
    return (
      <GerbangAkun alasan="Masuk untuk melihat profil dan riwayat." onBeranda={keMenu}>
        {(akun) => <LayarProfil akun={akun} onBeranda={keMenu} />}
      </GerbangAkun>
    );
  }
  if (mode === 'peringkat') {
    return (
      <GerbangAkun alasan="Masuk untuk melihat peringkat pemain." onBeranda={keMenu}>
        {(akun) => <LayarPeringkat akun={akun} onBeranda={keMenu} />}
      </GerbangAkun>
    );
  }
  if (mode === 'kamus') return <LayarKamus onBeranda={keMenu} />;
  if (mode === 'offline') return <UndercoverGame onBeranda={keMenu} daftarPenjaga={daftarPenjaga} />;

  return (
    <main className="wadah beranda masuk">
      <div className="atas-beranda"><TombolSuara /></div>
      <div className="pahlawan">
        <Tanda ukuran={44} />
        <h1>Undercover</h1>
        <p className="sub">Tebak kata. Cari penyusup.</p>
      </div>
      <div className="ilustrasi">
        {/* Animasi: WebP utama, GIF cadangan. Bila gerak dikurangi, tampilkan bingkai diam (PNG). */}
        <picture>
          <source media="(prefers-reduced-motion: reduce)" srcSet={`${BASE}/hero-static.png`} />
          <source type="image/webp" srcSet={`${BASE}/hero-anim.webp`} />
          <img
            src={`${BASE}/hero-anim.gif`}
            alt="Ilustrasi empat pemain, satu di antaranya penyusup bertopeng hijau"
            width={480}
            height={308}
            decoding="async"
          />
        </picture>
      </div>
      <div className="pilihan">
        <button className="utama" onClick={() => masuk('online')}>Online</button>
        <button className="kedua" onClick={() => masuk('offline')}>Lokal</button>
        <div className="baris-menu">
          <button className="kedua" onClick={() => masuk('profil')}>Profil</button>
          <button className="kedua" onClick={() => masuk('peringkat')}>Peringkat</button>
          <button className="kedua" onClick={() => masuk('kamus')}>Kamus</button>
        </div>
        <p className="catatan tengah-teks nol">Lokal tanpa login. Online perlu akun.</p>
      </div>
    </main>
  );
}
