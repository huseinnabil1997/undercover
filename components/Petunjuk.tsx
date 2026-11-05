'use client';

// Komponen petunjuk ketik: form giliran (kirim petunjuk / sudah bicara), daftar ringkas per pemain,
// riwayat per pemain atau per ronde, dan lembar Petunjuk yang bisa dibuka dari dok bawah.
// Semua teks dirender sebagai teks React biasa (otomatis di-escape).
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MAKS_PETUNJUK, petunjukMilik, urutkanBaris, type EntriPetunjuk } from '@/lib/petunjuk';

export { petunjukMilik };
import type { Peran } from '@/lib/types';
import { NAMA_PERAN } from './ui';
import type { InfoGelar } from '@/lib/online/gelarRoom';
import { META_KATEGORI } from '@/lib/peringkatMusim';
import { Avatar } from './Avatar';

export function FormPetunjuk({ judul, galat, onKirim, onSudahBicara, onUbah }: {
  judul: string;
  galat: string | null;
  onKirim: (teks: string) => void;
  onSudahBicara: () => void;
  /** Dipanggil saat teks berubah (mis. untuk menghapus galat lama). */
  onUbah?: () => void;
}) {
  const [teks, setTeks] = useState('');
  const sisa = MAKS_PETUNJUK - Array.from(teks).length;
  const kirim = (e: FormEvent) => {
    e.preventDefault();
    if (teks.trim()) onKirim(teks.trim());
  };
  return (
    <form className="kartu sorot form-petunjuk muncul" onSubmit={kirim}>
      <h2>{judul}</h2>
      <p className="catatan">Satu petunjuk tanpa menyebut katamu.</p>
      <input
        value={teks}
        onChange={(e) => {
          setTeks(Array.from(e.target.value).slice(0, MAKS_PETUNJUK).join(''));
          onUbah?.();
        }}
        placeholder="Petunjuk"
        aria-label="Petunjuk"
        aria-invalid={!!galat}
        aria-describedby="info-petunjuk"
        autoComplete="off"
        autoCapitalize="off"
        enterKeyHint="send"
        autoFocus
      />
      <p id="info-petunjuk" className={galat ? 'galat-petunjuk' : 'catatan nol'} role={galat ? 'alert' : undefined}>
        {galat ?? `Maks ${MAKS_PETUNJUK} karakter${sisa <= 10 ? `, sisa ${sisa}` : ''}`}
      </p>
      <div className="baris-petunjuk">
        <button type="submit" className="utama" disabled={!teks.trim()}>Kirim</button>
        <button type="button" className="kedua" onClick={onSudahBicara}>Sudah bicara</button>
      </div>
    </form>
  );
}

export interface PemainRiwayat {
  kunci: string;
  nama: string;
  hidup: boolean;
  /** Peran yang sudah terbuka (tereliminasi atau game selesai). */
  peran?: Peran;
  saya?: boolean;
  /** Mode online: pemain sedang tidak tersambung. */
  offline?: boolean;
}

/** Chip petunjuk ringkas; label ronde hanya jika sudah lebih dari satu ronde. */
export function ChipPetunjuk({ e, labelRonde, baru }: { e: EntriPetunjuk; labelRonde: boolean; baru?: boolean }) {
  return (
    <li className={`petunjuk-chip ringkas ${e.habis ? 'habis' : ''} ${baru ? 'baru' : ''}`}>
      {labelRonde && <span className="petunjuk-ronde">R{e.ronde}</span>} {e.teks}
    </li>
  );
}

/**
 * Daftar ringkas satu baris per pemain: nomor urut, nama, lalu semua petunjuknya (terbaru dulu).
 * Dipakai di layar diskusi (sekaligus urutan giliran), riwayat, dan lembar Petunjuk.
 */
export function DaftarPetunjuk({ pemain, entri, ronde, urutan, giliranKe, giliran, petaGelar }: {
  pemain: PemainRiwayat[];
  entri: EntriPetunjuk[];
  ronde: number;
  /** Urutan bicara ronde ini (kunci pemain). */
  urutan?: string[];
  /** Indeks giliran sekarang di `urutan`; yang sebelumnya diberi tanda selesai. */
  giliranKe?: number;
  /** Kunci pemain yang sedang giliran. */
  giliran?: string | null;
  /** Frame top 3 musim berjalan (online). */
  petaGelar?: Map<string, InfoGelar>;
}) {
  const labelRonde = entri.some((e) => e.ronde !== ronde) || ronde > 1;
  const baris = urutkanBaris(pemain, urutan);
  return (
    <ol className="daftar-petunjuk">
      {baris.map((p) => {
        const ke = urutan ? urutan.indexOf(p.kunci) : -1;
        const sekarang = giliran === p.kunci;
        const selesai = ke >= 0 && giliranKe !== undefined && ke < giliranKe;
        const milik = petunjukMilik(entri, p.kunci);
        return (
          <li
            key={p.kunci}
            className={`${p.hidup ? '' : 'mati'} ${sekarang ? 'sekarang' : ''} ${selesai ? 'selesai' : ''}${(() => { const f = petaGelar?.get(p.nama.toLowerCase())?.frame; return f ? ` gelar-${META_KATEGORI[f.kategori].warna} gelar-p${f.peringkat}` : ''; })()}`}
            aria-current={sekarang ? 'step' : undefined}
          >
            <span className="nomor" aria-hidden>{!p.hidup ? '×' : selesai ? '✓' : ke >= 0 ? ke + 1 : '·'}</span>
            <span className="dp-nama nama-dengan-avatar">
              <Avatar username={p.nama} cari ukuran={28} slot={petaGelar?.get(p.nama.toLowerCase())?.frame} />
              <span className="nama-teks">{p.nama}{p.saya && <em> (kamu)</em>}</span>
              {p.offline && <span className="lencana off">Offline</span>}
              {p.peran && <span className={`lencana ${p.peran}`}>{NAMA_PERAN[p.peran]}</span>}
              {!p.hidup && !p.peran && <span className="lencana off">Keluar</span>}
              {sekarang && <span className="dp-status">Giliran</span>}
            </span>
            {milik.length === 0 ? (
              <span className="dp-kosong">{sekarang ? 'Mengetik' : 'Belum ada'}</span>
            ) : (
              <ul className="dp-chip" aria-label={`Petunjuk ${p.nama}`}>
                {milik.map((e) => <ChipPetunjuk key={`${e.ronde}-${e.waktu}`} e={e} labelRonde={labelRonde} baru={e.ronde === ronde} />)}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function RiwayatPetunjuk({ pemain, entri, giliran, ronde, urutan, judul = 'Riwayat', tanpaKartu }: {
  pemain: PemainRiwayat[];
  entri: EntriPetunjuk[];
  /** Kunci pemain yang sedang giliran mengetik (untuk penanda). */
  giliran?: string | null;
  ronde: number;
  urutan?: string[];
  judul?: string;
  /** Dipakai di dalam lembar (tanpa bingkai kartu). */
  tanpaKartu?: boolean;
}) {
  const [mode, setMode] = useState<'pemain' | 'ronde'>('pemain');
  const nama = (k: string) => pemain.find((p) => p.kunci === k)?.nama ?? '?';
  // Ronde terbaru di atas.
  const daftarRonde = Array.from(new Set([...entri.map((e) => e.ronde), ronde])).sort((a, b) => b - a);
  const judulId = useId();
  return (
    <section className={`${tanpaKartu ? '' : 'kartu '}riwayat-petunjuk`} aria-labelledby={judulId}>
      <div className="baris-judul">
        <h2 id={judulId}>{judul}</h2>
        <div className="chip-grup kecil-tombol" role="group" aria-label="Tampilan riwayat">
          <button type="button" className={`chip ${mode === 'pemain' ? 'pilih' : ''}`} aria-pressed={mode === 'pemain'} onClick={() => setMode('pemain')}>Pemain</button>
          <button type="button" className={`chip ${mode === 'ronde' ? 'pilih' : ''}`} aria-pressed={mode === 'ronde'} onClick={() => setMode('ronde')}>Ronde</button>
        </div>
      </div>
      {mode === 'pemain' ? (
        <DaftarPetunjuk pemain={pemain} entri={entri} ronde={ronde} urutan={urutan} giliran={giliran} />
      ) : (
        <ol className="riwayat-daftar">
          {daftarRonde.map((r) => {
            const isi = entri.filter((e) => e.ronde === r);
            return (
              <li key={r}>
                <div className="riwayat-kepala"><span className="riwayat-nama">Ronde {r}{r === ronde && <em> (sekarang)</em>}</span></div>
                {isi.length === 0 ? (
                  <p className="riwayat-kosong">Belum ada petunjuk.</p>
                ) : (
                  <ul className="riwayat-petunjuk-list">
                    {isi.map((e) => (
                      <li key={`${e.pemain}-${e.waktu}`} className={`petunjuk-chip ringkas ${e.habis ? 'habis' : ''}`}>
                        <span className="petunjuk-ronde">{nama(e.pemain)}</span> {e.teks}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Isi tombol vote: nama + petunjuk pemain itu (terbaru dulu), agar tidak perlu bolak-balik ke riwayat. */
export function KartuVote({ nama, entri, ronde }: { nama: string; entri: EntriPetunjuk[]; ronde: number }) {
  return (
    <>
      <span className="pemain-nama">{nama}</span>
      {entri.length > 0 && (
        <span className="pemain-petunjuk">
          {entri.map((e) => (
            <span key={`${e.ronde}-${e.waktu}`} className={`${e.habis ? 'habis' : ''} ${e.ronde === ronde ? 'baru' : ''}`}>{e.teks}</span>
          ))}
        </span>
      )}
    </>
  );
}

const DURASI_TUTUP_MS = 220;

/**
 * Tombol "Petunjuk" di dok bawah + lembar (bottom sheet) berisi riwayat lengkap.
 * Bisa dibuka kapan saja tanpa harus menggulir halaman.
 */
export function LembarPetunjuk(props: {
  pemain: PemainRiwayat[];
  entri: EntriPetunjuk[];
  giliran?: string | null;
  ronde: number;
  urutan?: string[];
}) {
  const [fase, setFase] = useState<'tutup' | 'buka' | 'menutup'>('tutup');
  const tombolRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const judulId = useId();
  const tutup = () => {
    if (fase !== 'buka') return;
    setFase('menutup');
    const kurangi = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      setFase('tutup');
      tombolRef.current?.focus();
    }, kurangi ? 0 : DURASI_TUTUP_MS);
  };
  useEffect(() => {
    if (fase !== 'buka') return;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    // Gulir ke pemain yang sedang giliran agar langsung terlihat.
    panel?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'center' });
    const lama = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = lama; };
  }, [fase]);
  useEffect(() => {
    if (fase !== 'buka') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') tutup(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const jumlah = props.entri.filter((e) => !e.habis).length;
  return (
    <>
      <button
        ref={tombolRef}
        type="button"
        className="kecil tombol-dok tombol-petunjuk"
        onClick={() => setFase('buka')}
        aria-haspopup="dialog"
        aria-expanded={fase !== 'tutup'}
        aria-label={`Petunjuk, ${jumlah} tercatat`}
      >
        Petunjuk
        {jumlah > 0 && <span className="angka-dok" aria-hidden>{jumlah}</span>}
      </button>
      {fase !== 'tutup' && (
        <div className={`chat-latar${fase === 'menutup' ? ' tutup' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) tutup(); }}>
          <div ref={panelRef} className="chat-panel lembar-petunjuk" role="dialog" aria-modal="true" aria-labelledby={judulId} tabIndex={-1}>
            <div className="chat-kepala">
              <h2 id={judulId}>Petunjuk</h2>
              <button type="button" className="kecil" onClick={tutup}>Tutup</button>
            </div>
            <div className="lembar-isi">
              <RiwayatPetunjuk {...props} judul={`Ronde ${props.ronde}`} tanpaKartu />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
