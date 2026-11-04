// Kamus pemain: pasangan kata buatan pemain (Supabase). Validasi di sini sama dengan constraint database.
import { catatRiwayat, pilihPasanganDaftar, TanpaPasanganError } from './game';
import { baca, KUNCI, simpan } from './storage';
import type { PanjangKata, PasanganKata } from './types';

export interface EntriKamus { a: string; b: string; k: string }

export const MAKS_KATA = 30;
export const MAKS_KATEGORI = 24;
export const KATEGORI_BAWAAN = 'Umum';
/** Cache dianggap segar selama 10 menit; setelah itu diambil ulang, cache lama tetap dipakai bila offline. */
export const UMUR_CACHE_MS = 10 * 60 * 1000;

const POLA_KATA = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9'.&-]*( [A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9'.&-]*)*$/;
const POLA_KATEGORI = /^[A-Za-zÀ-ÿ0-9]+( [A-Za-zÀ-ÿ0-9&-]+)*$/;

/** Buang spasi di tepi dan spasi ganda. */
export function rapikanKata(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export function cekKata(s: string): string | null {
  if (s.length < 2) return 'Kata minimal 2 huruf.';
  if (s.length > MAKS_KATA) return `Kata maksimal ${MAKS_KATA} karakter.`;
  if (!POLA_KATA.test(s)) return 'Kata hanya boleh huruf, angka, spasi, dan tanda - \' . &';
  return null;
}

export function cekKategori(s: string): string | null {
  if (s.length < 2 || s.length > MAKS_KATEGORI) return `Kategori 2 sampai ${MAKS_KATEGORI} karakter.`;
  if (!POLA_KATEGORI.test(s)) return 'Kategori hanya boleh huruf, angka, spasi, - dan &.';
  return null;
}

/** Kunci pasangan: urutan dan besar kecil huruf diabaikan (sama dengan kolom kunci di database). */
export function kunciKamus(a: string, b: string): string {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

/**
 * Validasi satu pasangan sebelum dikirim. `ada` berisi pasangan yang sudah ada (dari cache);
 * `abaikan` adalah kunci milik entri yang sedang diubah.
 */
export function cekPasangan(a: string, b: string, kategori: string, ada: readonly EntriKamus[] = [], abaikan?: string): string | null {
  const g = cekKata(a) ?? cekKata(b) ?? cekKategori(kategori);
  if (g) return g;
  if (a.toLowerCase() === b.toLowerCase()) return 'Kedua kata harus berbeda.';
  const k = kunciKamus(a, b);
  if (k !== abaikan && ada.some((e) => kunciKamus(e.a, e.b) === k)) return 'Pasangan ini sudah ada di kamus.';
  return null;
}

/** Pesan galat Supabase untuk tulis kamus. */
export function pesanGalatKamus(e: { code?: string; message?: string } | null | undefined): string {
  if (e?.code === '23505') return 'Pasangan ini sudah ada di kamus.';
  if (e?.message?.includes('batas kamus')) return 'Batas 300 pasangan per akun tercapai.';
  if (e?.code === '23514') return 'Kata atau kategori tidak valid.';
  if (e?.code === '42501') return 'Tidak diizinkan. Coba masuk ulang.';
  return 'Gagal menyimpan. Periksa internet lalu coba lagi.';
}

/* --------------------------------- Cache ---------------------------------- */

interface CacheKamus { waktu: number; data: EntriKamus[] }

function sahEntri(x: unknown): x is EntriKamus {
  const e = x as EntriKamus;
  return !!e && typeof e.a === 'string' && typeof e.b === 'string' && typeof e.k === 'string';
}

export function bacaCacheKamus(): CacheKamus | null {
  const c = baca<unknown>(KUNCI.cacheKamusPemain, null) as CacheKamus | null;
  if (!c || typeof c.waktu !== 'number' || !Array.isArray(c.data)) return null;
  return { waktu: c.waktu, data: c.data.filter(sahEntri) };
}

export function simpanCacheKamus(data: EntriKamus[], waktu = Date.now()): void {
  simpan(KUNCI.cacheKamusPemain, { waktu, data });
}

export function cacheSegar(c: CacheKamus | null, kini = Date.now()): boolean {
  return !!c && kini - c.waktu < UMUR_CACHE_MS && kini >= c.waktu;
}

/* -------------------------------- Kategori -------------------------------- */

export interface KategoriPemain { id: string; nama: string; jumlah: number; jumlahSatu: number }

/** Id kategori: dirapikan lalu huruf kecil, jadi "Buah", " buah " dan "BUAH" satu kelompok. */
export function idKategori(k: string): string {
  return rapikanKata(k || KATEGORI_BAWAAN).toLowerCase() || KATEGORI_BAWAAN.toLowerCase();
}

const satuKataSaja = (a: string, b: string) => !/\s/.test(rapikanKata(a)) && !/\s/.test(rapikanKata(b));

/** Kelompokkan kamus per kategori. Nama yang ditampilkan adalah bentuk tulisan paling umum. */
export function kelompokKategori(data: readonly EntriKamus[]): KategoriPemain[] {
  const grup = new Map<string, { bentuk: Map<string, number>; jumlah: number; jumlahSatu: number }>();
  for (const e of data) {
    const id = idKategori(e.k);
    const g = grup.get(id) ?? { bentuk: new Map(), jumlah: 0, jumlahSatu: 0 };
    const nama = rapikanKata(e.k || KATEGORI_BAWAAN);
    g.bentuk.set(nama, (g.bentuk.get(nama) ?? 0) + 1);
    g.jumlah += 1;
    if (satuKataSaja(e.a, e.b)) g.jumlahSatu += 1;
    grup.set(id, g);
  }
  return [...grup].map(([id, g]) => {
    const nama = [...g.bentuk].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'id'))[0][0];
    return { id, nama, jumlah: g.jumlah, jumlahSatu: g.jumlahSatu };
  }).sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
}

export const PESAN_KAMUS_KOSONG = 'Kamus pemain masih kosong.';
export const PESAN_KATEGORI_KOSONG = 'Tidak ada pasangan di kategori kamus pemain yang dipilih.';

/* ----------------------------- Pilih pasangan ----------------------------- */

/**
 * Pilih pasangan dari kamus pemain di kategori terpilih (id ternormalisasi; kosong atau tidak
 * diisi berarti semua). Jatuh ke 'bebas' bila tidak ada pasangan satu kata.
 */
export function pilihDariKamus(data: readonly EntriKamus[], panjangKata: PanjangKata, kategori?: readonly string[]): { pasangan: PasanganKata; cadangan: boolean } {
  if (data.length === 0) throw new Error(PESAN_KAMUS_KOSONG);
  const nama = new Map(kelompokKategori(data).map((k) => [k.id, k.nama]));
  const pilih = kategori && kategori.length > 0 ? new Set(kategori.map(idKategori)) : null;
  const grup = new Map<string, [string, string][]>();
  for (const e of data) {
    const id = idKategori(e.k);
    if (pilih && !pilih.has(id)) continue;
    grup.set(id, [...(grup.get(id) ?? []), [e.a, e.b]]);
  }
  const daftar = [...grup].map(([id, pasangan]) => ({ nama: nama.get(id) ?? id, pasangan }));
  if (daftar.length === 0) throw new Error(PESAN_KATEGORI_KOSONG);
  const riwayat = baca<string[]>(KUNCI.riwayat, []);
  const opsi = { daftar, riwayat, label: 'Kamus pemain' };
  let pasangan: PasanganKata;
  let cadangan = false;
  try {
    pasangan = pilihPasanganDaftar({ ...opsi, panjangKata });
  } catch (e) {
    if (!(e instanceof TanpaPasanganError)) throw e;
    cadangan = true;
    pasangan = pilihPasanganDaftar({ ...opsi, panjangKata: 'bebas' });
  }
  simpan(KUNCI.riwayat, catatRiwayat(riwayat, pasangan));
  return { pasangan, cadangan };
}
