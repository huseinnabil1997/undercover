// Memuat bank kata (lazy per kategori) lalu memilih satu pasangan yang belum baru dipakai.
// Dipakai mode satu HP dan host mode online. Riwayat disimpan di perangkat ini saja.
import { META_KATEGORI, PEMUAT_KATEGORI } from '../data/words';
import { KATEGORI_INTERNET } from '../data/internet';
import { PASANGAN_KLASIK } from '../data/klasik';
import { catatRiwayat, ID_KLASIK, kombinasi2, pilihPasangan, pilihPasanganDaftar, satuKata, TanpaPasanganError } from './game';
import { baca, KUNCI, simpan } from './storage';
import type { PanjangKata, PasanganKata, SumberKata } from './types';

/* --------------------------------- Sumber --------------------------------- */

export const SUMBER_DEFAULT: SumberKata = 'internet';

export const PILIHAN_SUMBER: { id: SumberKata; nama: string; keterangan: string }[] = [
  { id: 'internet', nama: 'Internet', keterangan: 'Pasangan kata dari game Undercover publik di GitHub, dikurasi dan diterjemahkan ke bahasa Indonesia.' },
  { id: 'kamus', nama: 'Kamus kita', keterangan: 'Kamus buatan sendiri: kata populer Indonesia, dipasangkan acak per subkategori.' },
];

/** Semua sumber kata Internet beserta lisensinya, diambil dari data supaya selalu sinkron. */
export const DAFTAR_SUMBER_INTERNET: string[] = [...new Set(KATEGORI_INTERNET.flatMap((k) => k.sumber))].sort((a, b) =>
  a.localeCompare(b, 'id', { sensitivity: 'base' }),
);

/** Kredit sumber kata Internet (ditampilkan di UI). */
export const KREDIT_SUMBER_INTERNET = DAFTAR_SUMBER_INTERNET.join(', ');

export function rapikanSumber(x: unknown): SumberKata {
  return x === 'internet' || x === 'kamus' ? x : SUMBER_DEFAULT;
}

/** Sumber kata tersimpan. Bawaan (termasuk pengguna lama): Internet. */
export function sumberTersimpan(): SumberKata {
  return rapikanSumber(baca<unknown>(KUNCI.sumberKata, null));
}

export const SEMUA_KATEGORI_INTERNET = KATEGORI_INTERNET.map((k) => k.id);

export const SEMUA_KATEGORI = [ID_KLASIK, ...META_KATEGORI.map((k) => k.id)];

/** Semua id kategori milik satu sumber. */
export function semuaKategori(sumber: SumberKata): string[] {
  return sumber === 'internet' ? SEMUA_KATEGORI_INTERNET : SEMUA_KATEGORI;
}

/** Tebak sumber dari daftar id kategori (untuk pengaturan online lama tanpa sumberKata). */
export function tebakSumber(kategori: readonly string[]): SumberKata {
  return kategori.length > 0 && kategori.every((id) => SEMUA_KATEGORI.includes(id)) ? 'kamus' : 'internet';
}

export const PILIHAN_KATEGORI = [{ id: ID_KLASIK, nama: 'Klasik (kurasi)' }, ...META_KATEGORI.map((k) => ({ id: k.id, nama: k.nama }))];

export const KOMBINASI_PER_KATEGORI: Record<string, number> = Object.fromEntries([
  [ID_KLASIK, PASANGAN_KLASIK.length],
  ...META_KATEGORI.map((k) => [k.id, k.subkategori.reduce((t, s) => t + kombinasi2(s.jumlahKata), 0)]),
  ...KATEGORI_INTERNET.map((k) => [k.id, k.jumlah]),
]);

export const KOMBINASI_SATU_KATA: Record<string, number> = Object.fromEntries([
  [ID_KLASIK, PASANGAN_KLASIK.filter(([a, b]) => satuKata(a) && satuKata(b)).length],
  ...META_KATEGORI.map((k) => [k.id, k.subkategori.reduce((t, s) => t + kombinasi2(s.jumlahSatuKata), 0)]),
  ...KATEGORI_INTERNET.map((k) => [k.id, k.jumlahSatuKata]),
]);

export const PILIHAN_KATEGORI_INTERNET = KATEGORI_INTERNET.map((k) => ({ id: k.id, nama: k.nama }));

export function pilihanKategori(sumber: SumberKata): { id: string; nama: string }[] {
  return sumber === 'internet' ? PILIHAN_KATEGORI_INTERNET : PILIHAN_KATEGORI;
}

export function totalKombinasi(kategori: string[], panjangKata: PanjangKata = 'bebas'): number {
  const tabel = panjangKata === 'satu' ? KOMBINASI_SATU_KATA : KOMBINASI_PER_KATEGORI;
  return kategori.reduce((t, id) => t + (tabel[id] ?? 0), 0);
}

export const PESAN_TANPA_SATU_KATA =
  'Kategori yang dipilih tidak punya pasangan satu kata, jadi ronde ini memakai kata yang boleh lebih dari satu kata.';

/** Buang id yang bukan milik sumber tersebut. */
export function rapikanKategori(k: unknown, sumber: SumberKata = 'kamus'): string[] {
  const sah = semuaKategori(sumber);
  return Array.isArray(k) ? k.filter((x): x is string => typeof x === 'string' && sah.includes(x)) : [];
}

export function kunciKategori(sumber: SumberKata): string {
  return sumber === 'internet' ? KUNCI.kategoriInternet : KUNCI.kategori;
}

/**
 * Pilihan kategori tersimpan per sumber. Bawaan (belum pernah disimpan atau kosong): semua
 * kategori sumber itu (untuk Kamus kita termasuk Klasik).
 */
export function kategoriTersimpan(sumber: SumberKata = 'kamus'): string[] {
  const k = rapikanKategori(baca<unknown>(kunciKategori(sumber), null), sumber);
  return k.length > 0 ? k : [...semuaKategori(sumber)];
}

/**
 * Pilih pasangan sesuai filter panjang kata. Jika mode 'satu' tidak punya kandidat sama sekali,
 * jatuh ke mode 'bebas' dan `cadangan` bernilai true agar UI bisa memberi tahu pemain.
 */
export async function siapkanPasangan(
  kategori: string[],
  panjangKata: PanjangKata,
  sumber: SumberKata = tebakSumber(kategori),
): Promise<{ pasangan: PasanganKata; cadangan: boolean }> {
  if (sumber === 'internet') return siapkanPasanganInternet(kategori, panjangKata);
  const idBank = kategori.filter((id) => id !== ID_KLASIK && PEMUAT_KATEGORI[id]);
  const dataKategori = await Promise.all(idBank.map(async (id) => (await PEMUAT_KATEGORI[id]()).default));
  const riwayat = baca<string[]>(KUNCI.riwayat, []);
  const opsi = { kategori: dataKategori, klasik: kategori.includes(ID_KLASIK) ? PASANGAN_KLASIK : [], riwayat };
  let pasangan: PasanganKata;
  let cadangan = false;
  try {
    pasangan = pilihPasangan({ ...opsi, panjangKata });
  } catch (e) {
    if (!(e instanceof TanpaPasanganError)) throw e;
    cadangan = true;
    pasangan = pilihPasangan({ ...opsi, panjangKata: 'bebas' });
  }
  simpan(KUNCI.riwayat, catatRiwayat(riwayat, pasangan));
  return { pasangan, cadangan };
}

async function siapkanPasanganInternet(
  kategori: string[],
  panjangKata: PanjangKata,
): Promise<{ pasangan: PasanganKata; cadangan: boolean }> {
  const { PASANGAN_INTERNET } = await import('../data/internet/pasangan');
  const daftar = KATEGORI_INTERNET.filter((k) => kategori.includes(k.id)).map((k) => ({
    nama: k.nama,
    pasangan: PASANGAN_INTERNET[k.id] ?? [],
  }));
  const riwayat = baca<string[]>(KUNCI.riwayat, []);
  const opsi = { daftar, riwayat, label: 'Internet' };
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
