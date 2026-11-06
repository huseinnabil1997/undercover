'use client';

// Komponen tampilan yang dipakai mode satu HP dan mode online.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { maksPenyusup, rapikanKomposisi, teksLoversBersama, type Komposisi } from '@/lib/game';
import { KREDIT_SUMBER_INTERNET, pilihanKategoriGabung, PILIHAN_SUMBER, totalGabung } from '@/lib/bankKata';
import type { EntriKamus } from '@/lib/kamusPemain';
import { kamusPublik } from '@/lib/supabase/kamus';
import type { PanjangKata, Pemenang, Peran, SumberKata } from '@/lib/types';
import { adaBatas, detikTebakan, labelDetik, PILIHAN_PETUNJUK, PILIHAN_VOTE, type BatasWaktu } from '@/lib/batasWaktu';

export const NAMA_PERAN: Record<Peran, string> = { civilian: 'Civilian', undercover: 'Undercover', mrwhite: 'Mr. White', jester: 'Jester' };

export const JUDUL_MENANG: Record<Pemenang, string> = {
  civilian: 'Civilian menang!',
  penyusup: 'Penyusup menang!',
  mrwhite: 'Mr. White menang!',
  jester: 'Jester menang!',
  lovers: 'Lovers menang!',
};

export { teksLoversBersama };

/** Banner penuh: hanya saat kata dibuka (layar rahasia). */
export function BannerLovers({ nama }: { nama: string }) {
  return (
    <p className="banner-lovers" role="status">
      {teksLoversBersama(nama)}
    </p>
  );
}

/**
 * Ikon 💞 kecil selama game. Ketuk untuk tampilkan/sembunyikan nama pasangan (default tersembunyi).
 * Hanya untuk pemain Lovers (nama tidak boleh bocor ke pemain lain).
 */
export function IkonPasanganLovers({ nama }: { nama: string }) {
  const [buka, setBuka] = useState(false);
  const idPanel = useId();
  return (
    <div className="pasangan-lovers-toggle">
      <button
        type="button"
        className="ikon-lovers-toggle"
        aria-expanded={buka}
        aria-controls={idPanel}
        aria-label={buka ? 'Sembunyikan nama pasangan Lovers' : 'Tampilkan nama pasangan Lovers'}
        onClick={() => setBuka((v) => !v)}
      >
        <span aria-hidden>💞</span>
      </button>
      {buka ? (
        <p id={idPanel} className="banner-lovers" role="status">
          {teksLoversBersama(nama)}
        </p>
      ) : (
        <span id={idPanel} className="sr-only">Nama pasangan tersembunyi. Ketuk ikon hati untuk menampilkan.</span>
      )}
    </div>
  );
}

/** Tanda merek: sosok penyusup hijau bertopi fedora dan bertopeng, sama dengan ilustrasi beranda dan favicon. */
export function Tanda({ ukuran = 28 }: { ukuran?: number }) {
  return (
    <svg className="tanda" width={ukuran} height={ukuran} viewBox="2.75 4.5 58.5 58.5" aria-hidden focusable="false">
      <path fill="#1ed760" d="M32 18C42.5 18 47.5 24.5 47.5 32.5C47.5 38.5 45 41.5 43.5 44.5C48.5 48.5 51.5 53 51.5 57C51.5 61.5 47 62.5 32 62.5C17 62.5 12.5 61.5 12.5 57C12.5 53 15.5 48.5 20.5 44.5C19 41.5 16.5 38.5 16.5 32.5C16.5 24.5 21.5 18 32 18Z" />
      <path fill="#000" d="M18 30.5C18 28.5 19.5 27.5 21.5 27.5C25 27.5 28.5 29 32 29C35.5 29 39 27.5 42.5 27.5C44.5 27.5 46 28.5 46 30.5V35C46 37.5 44.5 38.5 42 38.5C38.5 38.5 35.5 36.8 32 36.8C28.5 36.8 25.5 38.5 22 38.5C19.5 38.5 18 37.5 18 35Z" />
      <ellipse fill="#1ed760" cx="25.2" cy="33" rx="4.3" ry="2.6" />
      <ellipse fill="#1ed760" cx="38.8" cy="33" rx="4.3" ry="2.6" />
      <path fill="#3a3a3a" d="M20.5 20V10C20.5 7 23 5 26 5.5C28.5 6 30 7.5 32 7.5C34 7.5 35.5 6 38 5.5C41 5 43.5 7 43.5 10V20Z" />
      <rect fill="#1ed760" x="20.5" y="14.5" width="23" height="4.5" />
      <ellipse fill="#3a3a3a" cx="32" cy="20.5" rx="21.5" ry="3.6" />
    </svg>
  );
}

/** Judul fase: satu kata besar dan nomor ronde di kanan. */
export function KepalaFase({ judul, ronde, kategori }: { judul: string; ronde?: number; kategori?: string }) {
  return (
    <div className="kepala-fase">
      <h2>{judul}</h2>
      <div className="kepala-fase-meta">
        {ronde !== undefined && <span className="ronde">Ronde {ronde}</span>}
        {kategori ? <span className="kategori-main" title={kategori}>Kategori: {kategori}</span> : null}
      </div>
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

/** Kartu pengaturan jumlah peran + toggle opsional Lovers/Jester. */
export function AturPeran({ jumlah, komposisi, onUbah, onOtomatis, nonaktif }: {
  jumlah: number;
  komposisi: Komposisi;
  onUbah: (k: Komposisi) => void;
  onOtomatis: () => void;
  nonaktif?: boolean;
}) {
  const k = rapikanKomposisi(komposisi);
  const jester = k.jester ? 1 : 0;
  const kapasitas = maksPenyusup(jumlah, jester);
  const ubah = (peran: 'undercover' | 'mrWhite', d: number) => {
    const lain = peran === 'undercover' ? k.mrWhite : k.undercover;
    const maksPeran = Math.max(0, kapasitas - lain);
    onUbah({ ...k, [peran]: Math.max(0, Math.min(maksPeran, k[peran] + d)) });
  };
  const civilian = Math.max(0, jumlah - k.undercover - k.mrWhite - jester);
  const nilai = (peran: 'undercover' | 'mrWhite', label: string) => {
    const lain = peran === 'undercover' ? k.mrWhite : k.undercover;
    const maksPeran = Math.max(k[peran], Math.max(0, kapasitas - lain));
    return nonaktif ? (
      <strong className="angka-besar">{k[peran]}</strong>
    ) : (
      <Stepper nilai={k[peran]} min={0} max={maksPeran} onUbah={(d) => ubah(peran, d)} label={label} />
    );
  };
  const toggle = (field: 'jester' | 'lovers', aktif: boolean) => {
    if (nonaktif) return;
    if (field === 'jester') {
      if (!aktif) {
        onUbah({ ...k, jester: 0 });
        return;
      }
      // Nyalakan Jester: turunkan UC/MW bila perlu agar civilian > UC+MW+Jester.
      let uc = k.undercover;
      let mw = k.mrWhite;
      const kap = maksPenyusup(jumlah, 1);
      while (uc + mw > kap) {
        if (uc > 1) uc--;
        else if (mw > 0) mw--;
        else if (uc > 0) uc--;
        else break;
      }
      if (uc + mw < 1) uc = 1;
      onUbah({ ...k, jester: 1, undercover: uc, mrWhite: mw });
    } else onUbah({ ...k, lovers: aktif });
  };
  return (
    <div className="kartu">
      <div className="baris-judul">
        <h2>Peran</h2>
        {!nonaktif && <button className="kecil" onClick={onOtomatis}>Auto</button>}
      </div>
      <div className="peran-baris">
        <span>Civilian</span>
        <strong className="angka-besar">{civilian}</strong>
      </div>
      <div className="peran-baris">
        <span>Undercover</span>
        {nilai('undercover', 'Undercover')}
      </div>
      <div className="peran-baris">
        <span>Mr. White</span>
        {nilai('mrWhite', 'Mr. White')}
      </div>
      <div className="peran-baris">
        <span>Jester</span>
        {nonaktif ? (
          <strong className="angka-besar">{jester ? 'On' : 'Off'}</strong>
        ) : (
          <button
            type="button"
            className={`chip${jester ? ' pilih' : ''}`}
            aria-pressed={!!jester}
            disabled={jumlah < 5 && !jester}
            onClick={() => toggle('jester', !jester)}
          >
            {jester ? 'On' : 'Off'}
          </button>
        )}
      </div>
      <div className="peran-baris">
        <span>Lovers</span>
        {nonaktif ? (
          <strong className="angka-besar">{k.lovers ? 'On' : 'Off'}</strong>
        ) : (
          <button
            type="button"
            className={`chip${k.lovers ? ' pilih' : ''}`}
            aria-pressed={!!k.lovers}
            disabled={jumlah < 5 && !k.lovers}
            onClick={() => toggle('lovers', !k.lovers)}
          >
            {k.lovers ? 'On' : 'Off'}
          </button>
        )}
      </div>
      <p className="catatan">Civilian harus lebih banyak dari Undercover + Mr. White + Jester. Jester/Lovers opsional (min 5 pemain; keduanya min 6).</p>
      <p className="catatan nol"><strong>Jester</strong>: tanpa kata. Menang jika divote; kalah jika bertahan sampai akhir. Bukan Civilian.</p>
      <p className="catatan nol"><strong>Lovers</strong>: dua pemain peran sama (Civilian atau Undercover) dipasangkan diam-diam. Kamu diberi tahu siapa pasanganmu dan kalian punya kata yang sama. Lindungi pasangan; jika satu mati, pasangan ikut. Menang tambahan jika keduanya bertahan sampai akhir.</p>
    </div>
  );
}

/** Kamus pemain publik (cache 10 menit, tanpa login). Kosong bila belum termuat atau offline tanpa cache. */
export function useKamusPemain(): EntriKamus[] {
  const [data, setData] = useState<EntriKamus[]>([]);
  useEffect(() => {
    let hidup = true;
    kamusPublik(false).then((d) => hidup && setData(d.data), () => {});
    return () => {
      hidup = false;
    };
  }, []);
  return data;
}

/** Kartu pilihan kategori kata. Kategori dari kamus pemain digabung (yang baru diberi tanda 'pemain'). */
export function PilihKategori({ kategori, onUbah, nonaktif, panjangKata = 'bebas', sumber = 'kamus' }: {
  kategori: string[]; onUbah: (k: string[]) => void; nonaktif?: boolean; panjangKata?: PanjangKata; sumber?: SumberKata;
}) {
  const kamus = useKamusPemain();
  const pilihan = pilihanKategoriGabung(sumber, kamus);
  const daftarSemua = pilihan.map((k) => k.id);
  const semua = daftarSemua.every((id) => kategori.includes(id));
  return (
    <div className="kartu">
      <div className="baris-judul">
        <h2>Kategori {sumber === 'internet' ? 'Internet' : 'Kamus kita'}</h2>
        {!nonaktif && (
          <button className="kecil" onClick={() => onUbah(semua ? [] : [...daftarSemua])}>{semua ? 'Kosong' : 'Semua'}</button>
        )}
      </div>
      <div className="chip-grup">
        {pilihan.map((k) => {
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
              {k.nama}{k.dariPemain && <small className="tanda-pemain"> pemain</small>}
            </button>
          );
        })}
      </div>
      <p className="catatan">
        <strong>{angka(totalGabung(sumber, kategori, panjangKata, kamus))}</strong> pasangan kata, termasuk kamus pemain
      </p>
    </div>
  );
}

/** Pilihan sumber kata: Internet (bawaan) atau Kamus kita. */
export function PilihSumberKata({ nilai, onUbah, nonaktif }: { nilai: SumberKata; onUbah: (s: SumberKata) => void; nonaktif?: boolean }) {
  const pilihan = PILIHAN_SUMBER.find((p) => p.id === nilai) ?? PILIHAN_SUMBER[0];
  return (
    <div className="kartu">
      <div className="baris-judul">
        <h2>Sumber kata</h2>
      </div>
      <div className="segmen" role="group" aria-label="Sumber kata">
        {PILIHAN_SUMBER.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={nilai === p.id}
            disabled={nonaktif}
            onClick={() => onUbah(p.id)}
          >
            {p.nama}
          </button>
        ))}
      </div>
      <p className="catatan">{pilihan.keterangan} Pasangan buatan pemain (menu Kamus) ikut digabung.{nonaktif ? ' Diatur oleh host.' : ''}</p>
      {nilai === 'internet' && (
        <details className="atribusi-sumber">
          <summary>Sumber kata</summary>
          <p>{KREDIT_SUMBER_INTERNET}.</p>
        </details>
      )}
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

/** Batas waktu petunjuk dan vote. Bawaan Tanpa batas (seperti sebelumnya). */
export function PilihBatasWaktu({ nilai, onUbah, nonaktif, mode }: {
  nilai: BatasWaktu;
  onUbah: (b: BatasWaktu) => void;
  nonaktif?: boolean;
  mode: 'online' | 'lokal';
}) {
  const baris = [
    { kunci: 'petunjuk' as const, judul: 'Petunjuk per giliran', pilihan: PILIHAN_PETUNJUK },
    { kunci: 'vote' as const, judul: 'Diskusi dan vote', pilihan: PILIHAN_VOTE },
  ];
  const tebak = detikTebakan(nilai);
  return (
    <div className="kartu batas-waktu">
      <div className="baris-judul">
        <h2>Batas waktu</h2>
      </div>
      {baris.map((b) => (
        <div key={b.kunci} className="baris-batas">
          <p className="label-batas" id={`batas-${b.kunci}`}>{b.judul}</p>
          <div className="chip-grup" role="group" aria-labelledby={`batas-${b.kunci}`}>
            {b.pilihan.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip ${nilai[b.kunci] === d ? 'pilih' : ''}`}
                aria-pressed={nilai[b.kunci] === d}
                disabled={nonaktif}
                onClick={() => onUbah({ ...nilai, [b.kunci]: d })}
              >
                {labelDetik(d)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="catatan">
        {!adaBatas(nilai)
          ? 'Tanpa batas: tidak ada hitung mundur.'
          : mode === 'online'
            ? `Waktu habis: giliran petunjuk dilewati, vote langsung dihitung (yang belum memilih dianggap tidak memilih), dan tebakan Mr. White (${tebak} dtk) dianggap salah.`
            : `Waktu habis: giliran petunjuk otomatis dilewati, vote hanya diberi tanda (tetap kalian yang memilih siapa keluar), dan tebakan Mr. White (${tebak} dtk) dianggap salah.`}
        {nonaktif ? ' Diatur oleh host.' : ''}
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
