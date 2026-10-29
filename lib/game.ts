// Logika murni permainan Undercover. Tidak menyentuh DOM, localStorage, maupun React,
// sehingga mudah diuji. Semua keacakan memakai fungsi `rng` yang bisa disuntikkan.
import type { Kategori, KategoriMeta, PasanganKata, Pemain, Pemenang, Peran } from './types';

export type Rng = () => number;

export const MIN_PEMAIN = 3;
export const MAX_PEMAIN = 20;
export const ID_KLASIK = 'klasik';

/** Bilangan bulat acak di [0, max). */
export function acakIndeks(max: number, rng: Rng = Math.random): number {
  return Math.min(max - 1, Math.floor(rng() * max));
}

/** Fisher-Yates, mengembalikan salinan baru. */
export function acakUrutan<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const hasil = arr.slice();
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = acakIndeks(i + 1, rng);
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}

export function namaDefault(i: number): string {
  return `Pemain ${i + 1}`;
}

/* ---------------------------------- Setup --------------------------------- */

export interface Komposisi {
  undercover: number;
  mrWhite: number;
}

/** Komposisi peran bawaan yang seimbang untuk jumlah pemain tertentu. */
export function komposisiDefault(jumlahPemain: number): Komposisi {
  const n = Math.max(MIN_PEMAIN, Math.min(MAX_PEMAIN, Math.floor(jumlahPemain)));
  const mrWhite = n >= 5 ? 1 : 0;
  let undercover = Math.max(1, Math.round(n / 4));
  while (undercover > 1 && n - undercover - mrWhite <= undercover + mrWhite) undercover--;
  return { undercover, mrWhite };
}

/** Jumlah penyusup (Undercover + Mr. White) terbesar yang masih valid. */
export function maksPenyusup(jumlahPemain: number): number {
  return Math.max(0, Math.ceil(jumlahPemain / 2) - 1);
}

/** Mengembalikan daftar pesan galat. Kosong berarti valid. */
export function validasiSetup(nama: readonly string[], komposisi: Komposisi): string[] {
  const galat: string[] = [];
  const n = nama.length;
  const { undercover, mrWhite } = komposisi;
  if (n < MIN_PEMAIN) galat.push(`Minimal ${MIN_PEMAIN} pemain.`);
  if (n > MAX_PEMAIN) galat.push(`Maksimal ${MAX_PEMAIN} pemain.`);
  if (!Number.isInteger(undercover) || !Number.isInteger(mrWhite) || undercover < 0 || mrWhite < 0) {
    galat.push('Jumlah peran harus bilangan bulat tidak negatif.');
  }
  if (undercover + mrWhite < 1) galat.push('Minimal ada 1 Undercover atau Mr. White.');
  const civilian = n - undercover - mrWhite;
  if (civilian <= undercover + mrWhite) {
    galat.push('Jumlah Civilian harus lebih banyak dari gabungan Undercover dan Mr. White.');
  }
  const bersih = nama.map((x) => x.trim().toLowerCase());
  if (bersih.some((x) => x === '')) galat.push('Nama pemain tidak boleh kosong.');
  if (new Set(bersih).size !== bersih.length) galat.push('Nama pemain tidak boleh kembar.');
  return galat;
}

/* ---------------------------------- Peran --------------------------------- */

export function bagiPeran(nama: readonly string[], komposisi: Komposisi, rng: Rng = Math.random): Pemain[] {
  const peran: Peran[] = [
    ...Array<Peran>(komposisi.undercover).fill('undercover'),
    ...Array<Peran>(komposisi.mrWhite).fill('mrwhite'),
    ...Array<Peran>(nama.length - komposisi.undercover - komposisi.mrWhite).fill('civilian'),
  ];
  const acak = acakUrutan(peran, rng);
  return nama.map((n, i) => ({ nama: n.trim(), peran: acak[i], hidup: true }));
}

/** Kata yang dilihat pemain. Mr. White tidak mendapat kata (null). */
export function kataUntuk(pemain: Pemain, pasangan: PasanganKata): string | null {
  if (pemain.peran === 'civilian') return pasangan.civilian;
  if (pemain.peran === 'undercover') return pasangan.undercover;
  return null;
}

/** Urutan bicara acak dari pemain yang masih hidup; pembicara pertama bukan Mr. White. */
export function urutanBicara(pemain: readonly Pemain[], rng: Rng = Math.random): number[] {
  const hidup = pemain.map((p, i) => ({ p, i })).filter((x) => x.p.hidup);
  const urut = acakUrutan(hidup, rng);
  const pertama = urut.findIndex((x) => x.p.peran !== 'mrwhite');
  if (pertama > 0) {
    const [x] = urut.splice(pertama, 1);
    urut.unshift(x);
  }
  return urut.map((x) => x.i);
}

/* ------------------------------ Eliminasi/Menang ----------------------------- */

export function eliminasi(pemain: readonly Pemain[], indeks: number): Pemain[] {
  return pemain.map((p, i) => (i === indeks ? { ...p, hidup: false } : p));
}

/**
 * Cek pemenang.
 * - Civilian menang jika semua Undercover dan Mr. White tereliminasi.
 * - Penyusup menang jika penyusup tersisa >= Civilian tersisa
 *   (termasuk saat tinggal 2 pemain dan minimal satu penyusup).
 */
export function cekPemenang(pemain: readonly Pemain[]): Pemenang | null {
  const hidup = pemain.filter((p) => p.hidup);
  const civilian = hidup.filter((p) => p.peran === 'civilian').length;
  const penyusup = hidup.length - civilian;
  if (penyusup === 0) return 'civilian';
  if (penyusup >= civilian) return 'penyusup';
  if (hidup.length <= 2 && penyusup >= 1) return 'penyusup';
  return null;
}

export function normalisasiTebakan(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Tebakan Mr. White benar jika sama dengan kata Civilian (trim, tidak peka huruf besar/kecil). */
export function tebakanBenar(tebakan: string, kataCivilian: string): boolean {
  const t = normalisasiTebakan(tebakan);
  return t.length > 0 && t === normalisasiTebakan(kataCivilian);
}

/** Pemain yang termasuk tim pemenang. */
export function timPemenang(pemain: readonly Pemain[], pemenang: Pemenang): Pemain[] {
  if (pemenang === 'civilian') return pemain.filter((p) => p.peran === 'civilian');
  if (pemenang === 'mrwhite') return pemain.filter((p) => p.peran === 'mrwhite');
  return pemain.filter((p) => p.peran !== 'civilian');
}

export const POIN_MENANG: Record<Peran, number> = { civilian: 2, undercover: 10, mrwhite: 6 };

export function tambahSkor(
  skor: Readonly<Record<string, number>>,
  pemain: readonly Pemain[],
  pemenang: Pemenang,
): Record<string, number> {
  const baru = { ...skor };
  for (const p of timPemenang(pemain, pemenang)) baru[p.nama] = (baru[p.nama] ?? 0) + POIN_MENANG[p.peran];
  return baru;
}

/* -------------------------------- Bank kata -------------------------------- */

export function kombinasi2(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

export function jumlahKombinasiMeta(meta: readonly KategoriMeta[]): number {
  return meta.reduce((t, k) => t + k.subkategori.reduce((s, sub) => s + kombinasi2(sub.jumlahKata), 0), 0);
}

export function kunciPasangan(a: string, b: string): string {
  return [normalisasiTebakan(a), normalisasiTebakan(b)].sort().join('|');
}

/** Ambil 2 kata berbeda secara acak dari satu subkategori. */
export function ambilDuaKata(kata: readonly string[], rng: Rng = Math.random): [string, string] {
  if (kata.length < 2) throw new Error('Subkategori butuh minimal 2 kata.');
  const i = acakIndeks(kata.length, rng);
  let j = acakIndeks(kata.length - 1, rng);
  if (j >= i) j++;
  return [kata[i], kata[j]];
}

export interface OpsiPasangan {
  kategori: readonly Kategori[];
  klasik?: ReadonlyArray<readonly [string, string]>;
  /** Kunci pasangan yang baru dipakai (lihat kunciPasangan). */
  riwayat?: ReadonlySet<string> | readonly string[];
  /** Peluang memilih dari daftar Klasik jika tersedia (0..1). */
  peluangKlasik?: number;
  maksPercobaan?: number;
  rng?: Rng;
}

/**
 * Pilih pasangan kata. Kategori dipilih rata, lalu subkategori rata, lalu 2 kata berbeda.
 * Pasangan di riwayat dihindari selama percobaan masih ada. Kata mana yang jadi milik
 * Civilian juga diacak.
 */
export function pilihPasangan(opsi: OpsiPasangan): PasanganKata {
  const rng = opsi.rng ?? Math.random;
  const riwayat = opsi.riwayat instanceof Set ? opsi.riwayat : new Set(opsi.riwayat ?? []);
  const kategori = opsi.kategori.filter((k) => k.subkategori.some((s) => s.kata.length >= 2));
  const klasik = opsi.klasik ?? [];
  if (kategori.length === 0 && klasik.length === 0) throw new Error('Tidak ada kategori kata yang dipilih.');
  const peluangKlasik = kategori.length === 0 ? 1 : klasik.length === 0 ? 0 : (opsi.peluangKlasik ?? 0.3);
  const maks = opsi.maksPercobaan ?? 50;

  let calon: PasanganKata | null = null;
  for (let t = 0; t < maks; t++) {
    let a: string;
    let b: string;
    let sumber: string;
    if (rng() < peluangKlasik) {
      [a, b] = klasik[acakIndeks(klasik.length, rng)];
      sumber = 'Klasik';
    } else {
      const k = kategori[acakIndeks(kategori.length, rng)];
      const subs = k.subkategori.filter((s) => s.kata.length >= 2);
      const s = subs[acakIndeks(subs.length, rng)];
      [a, b] = ambilDuaKata(s.kata, rng);
      sumber = `${k.nama} / ${s.nama}`;
    }
    const tukar = rng() < 0.5;
    calon = { civilian: tukar ? b : a, undercover: tukar ? a : b, sumber };
    if (!riwayat.has(kunciPasangan(a, b))) return calon;
  }
  return calon as PasanganKata;
}

/** Tambah pasangan ke riwayat (paling baru di depan), dibatasi panjangnya. */
export function catatRiwayat(riwayat: readonly string[], pasangan: PasanganKata, maks = 300): string[] {
  const kunci = kunciPasangan(pasangan.civilian, pasangan.undercover);
  return [kunci, ...riwayat.filter((k) => k !== kunci)].slice(0, maks);
}
