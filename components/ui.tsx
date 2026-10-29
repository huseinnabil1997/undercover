'use client';

// Komponen tampilan yang dipakai mode satu HP dan mode online.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { maksPenyusup, type Komposisi } from '@/lib/game';
import { PILIHAN_KATEGORI, SEMUA_KATEGORI, totalKombinasi } from '@/lib/bankKata';
import type { PanjangKata, Pemenang, Peran } from '@/lib/types';

export const NAMA_PERAN: Record<Peran, string> = { civilian: 'Civilian', undercover: 'Undercover', mrwhite: 'Mr. White' };

export const JUDUL_MENANG: Record<Pemenang, string> = {
  civilian: 'Civilian menang!',
  penyusup: 'Penyusup menang!',
  mrwhite: 'Mr. White menang!',
};

/** Tanda merek: lingkaran hijau dengan topeng mata. */
export function Tanda({ ukuran = 28 }: { ukuran?: number }) {
  return (
    <svg className="tanda" width={ukuran} height={ukuran} viewBox="0 0 32 32" aria-hidden focusable="false">
      <circle cx="16" cy="16" r="16" fill="#1ed760" />
      <rect x="6" y="13.5" width="8.5" height="5" rx="2.5" fill="#000" />
      <rect x="17.5" y="13.5" width="8.5" height="5" rx="2.5" fill="#000" />
    </svg>
  );
}

/** Judul fase: satu kata besar dan nomor ronde di kanan. */
export function KepalaFase({ judul, ronde }: { judul: string; ronde?: number }) {
  return (
    <div className="kepala-fase">
      <h2>{judul}</h2>
      {ronde !== undefined && <span className="ronde">Ronde {ronde}</span>}
    </div>
  );
}

export const angka = (n: number) => n.toLocaleString('id-ID');

export function Stepper({ nilai, min, max, onUbah, label }: { nilai: number; min: number; max: number; onUbah: (d: number) => void; label: string }) {
  return (
    <div className="stepper">
      <button onClick={() => onUbah(-1)} disabled={nilai <= min} aria-label={`Kurangi ${label}`}>−</button>
      <output aria-live="polite">{nilai}</output>
      <button onClick={() => onUbah(1)} disabled={nilai >= max} aria-label={`Tambah ${label}`}>+</button>
    </div>
  );
}

/** Kartu pengaturan jumlah peran. */
export function AturPeran({ jumlah, komposisi, onUbah, onOtomatis, nonaktif }: {
  jumlah: number;
  komposisi: Komposisi;
  onUbah: (k: Komposisi) => void;
  onOtomatis: () => void;
  nonaktif?: boolean;
}) {
  const ubah = (peran: keyof Komposisi, d: number) => onUbah({ ...komposisi, [peran]: Math.max(0, komposisi[peran] + d) });
  const maks = maksPenyusup(jumlah);
  const nilai = (peran: keyof Komposisi, label: string) =>
    nonaktif ? (
      <strong className="angka-besar">{komposisi[peran]}</strong>
    ) : (
      <Stepper nilai={komposisi[peran]} min={0} max={maks} onUbah={(d) => ubah(peran, d)} label={label} />
    );
  return (
    <div className="kartu">
      <div className="baris-judul">
        <h2>Peran</h2>
        {!nonaktif && <button className="kecil" onClick={onOtomatis}>Auto</button>}
      </div>
      <div className="peran-baris">
        <span>Civilian</span>
        <strong className="angka-besar">{Math.max(0, jumlah - komposisi.undercover - komposisi.mrWhite)}</strong>
      </div>
      <div className="peran-baris">
        <span>Undercover</span>
        {nilai('undercover', 'Undercover')}
      </div>
      <div className="peran-baris">
        <span>Mr. White</span>
        {nilai('mrWhite', 'Mr. White')}
      </div>
      <p className="catatan">Civilian harus lebih banyak dari Undercover + Mr. White.</p>
    </div>
  );
}

/** Kartu pilihan kategori kata. */
export function PilihKategori({ kategori, onUbah, nonaktif, panjangKata = 'bebas' }: {
  kategori: string[]; onUbah: (k: string[]) => void; nonaktif?: boolean; panjangKata?: PanjangKata;
}) {
  const semua = kategori.length === SEMUA_KATEGORI.length;
  return (
    <div className="kartu">
      <div className="baris-judul">
        <h2>Kategori</h2>
        {!nonaktif && (
          <button className="kecil" onClick={() => onUbah(semua ? [] : SEMUA_KATEGORI)}>{semua ? 'Kosong' : 'Semua'}</button>
        )}
      </div>
      <div className="chip-grup">
        {PILIHAN_KATEGORI.map((k) => {
          const aktif = kategori.includes(k.id);
          if (nonaktif && !aktif) return null;
          return (
            <button
              key={k.id}
              className={`chip ${aktif ? 'pilih' : ''}`}
              aria-pressed={aktif}
              disabled={nonaktif}
              onClick={() => onUbah(aktif ? kategori.filter((x) => x !== k.id) : [...kategori, k.id])}
            >
              {k.nama}
            </button>
          );
        })}
      </div>
      <p className="catatan">
        <strong>{angka(totalKombinasi(kategori, panjangKata))}</strong> pasangan kata
      </p>
    </div>
  );
}

/** Dipanggil sebelum kembali ke menu. Hasil false berarti batal (mis. pengguna menolak di modal). */
export type Penjaga = () => Promise<boolean>;

/** Tombol pil kiri atas untuk kembali ke menu pilih Lokal atau Online. */
export function TombolMenu({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="kecil tombol-menu" onClick={onClick} aria-label="Kembali ke menu Lokal atau Online">
      <span aria-hidden>‹</span> Menu
    </button>
  );
}

const PILIHAN_PANJANG: { id: PanjangKata; label: string }[] = [
  { id: 'satu', label: 'Satu kata' },
  { id: 'bebas', label: 'Boleh lebih' },
];

/** Kontrol segmen pil untuk filter panjang kata. */
export function PilihPanjangKata({ nilai, onUbah, nonaktif }: { nilai: PanjangKata; onUbah: (p: PanjangKata) => void; nonaktif?: boolean }) {
  return (
    <div className="kartu">
      <div className="baris-judul">
        <h2>Panjang kata</h2>
      </div>
      <div className="segmen" role="group" aria-label="Panjang kata">
        {PILIHAN_PANJANG.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={nilai === p.id}
            disabled={nonaktif}
            onClick={() => onUbah(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="catatan">
        {nilai === 'satu' ? 'Hanya pasangan tanpa spasi, misal Kopi dan Teh.' : 'Boleh lebih dari satu kata, misal Es Teh.'}
      </p>
    </div>
  );
}

/**
 * Kartu yang dibalik (flip) untuk menampilkan kata rahasia. Sisi belakang baru dirender saat
 * terbuka, jadi kata tidak ada di halaman sebelum pemain memilih untuk melihatnya.
 */
export function KartuBalik({ terbuka, depan, belakang, rahasia = true }: { terbuka: boolean; depan: ReactNode; belakang: ReactNode; rahasia?: boolean }) {
  return (
    <div className={`kartu-balik ${terbuka ? 'terbalik' : ''}`}>
      <div className="sisi depan kartu besar" aria-hidden={terbuka}>{depan}</div>
      <div className={`sisi belakang kartu besar ${rahasia ? 'rahasia' : ''}`} aria-hidden={!terbuka}>{terbuka ? belakang : null}</div>
    </div>
  );
}

/** Konfeti CSS ringan (tanpa library). Disembunyikan jika pengguna memilih kurangi animasi. */
export function Konfeti({ jumlah = 40 }: { jumlah?: number }) {
  const warna = ['#1ed760', '#ffffff', '#f3727f', '#2e77d0', '#b3b3b3'];
  return (
    <div className="konfeti" aria-hidden>
      {Array.from({ length: jumlah }, (_, i) => {
        // Sebaran deterministik agar render stabil.
        const kiri = (i * 37) % 100;
        const tunda = ((i * 53) % 60) * 10;
        const durasi = 1400 + ((i * 29) % 9) * 120;
        const putar = (i * 47) % 360;
        return (
          <span
            key={i}
            style={{
              left: `${kiri}%`,
              background: warna[i % warna.length],
              animationDelay: `${tunda}ms`,
              animationDuration: `${durasi}ms`,
              transform: `rotate(${putar}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Pertahankan item yang baru dihapus selama `ms` agar animasi keluar bisa diputar.
 * Mengembalikan item beserta penanda `keluar`.
 */
export function useDaftarKeluar<T>(items: T[], kunci: (x: T) => string, ms = 220): { item: T; keluar: boolean }[] {
  const [keluar, setKeluar] = useState<Map<string, { item: T; indeks: number }>>(new Map());
  const sebelum = useRef<T[]>(items);
  useEffect(() => {
    const kini = new Set(items.map(kunci));
    const hilang = sebelum.current
      .map((item, indeks) => ({ item, indeks }))
      .filter(({ item }) => !kini.has(kunci(item)));
    sebelum.current = items;
    if (hilang.length === 0) return;
    setKeluar((m) => {
      const baru = new Map(m);
      for (const h of hilang) baru.set(kunci(h.item), h);
      return baru;
    });
    const t = window.setTimeout(() => {
      setKeluar((m) => {
        const baru = new Map(m);
        for (const h of hilang) baru.delete(kunci(h.item));
        return baru;
      });
    }, ms);
    return () => window.clearTimeout(t);
    // kunci dianggap stabil
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, ms]);
  const hasil = items.map((item) => ({ item, keluar: false }));
  for (const [k, { item, indeks }] of keluar) {
    if (items.some((x) => kunci(x) === k)) continue;
    hasil.splice(Math.min(indeks, hasil.length), 0, { item, keluar: true });
  }
  return hasil;
}
