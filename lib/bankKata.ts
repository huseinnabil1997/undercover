// Memuat bank kata (lazy per kategori) lalu memilih satu pasangan yang belum baru dipakai.
// Dipakai mode satu HP dan host mode online. Riwayat disimpan di perangkat ini saja.
import { META_KATEGORI, PEMUAT_KATEGORI } from '../data/words';
import { PASANGAN_KLASIK } from '../data/klasik';
import { catatRiwayat, ID_KLASIK, kombinasi2, pilihPasangan, satuKata, TanpaPasanganError } from './game';
import { baca, KUNCI, simpan } from './storage';
import type { PanjangKata, PasanganKata } from './types';

export const SEMUA_KATEGORI = [ID_KLASIK, ...META_KATEGORI.map((k) => k.id)];

export const PILIHAN_KATEGORI = [{ id: ID_KLASIK, nama: 'Klasik (kurasi)' }, ...META_KATEGORI.map((k) => ({ id: k.id, nama: k.nama }))];

export const KOMBINASI_PER_KATEGORI: Record<string, number> = Object.fromEntries([
  [ID_KLASIK, PASANGAN_KLASIK.length],
  ...META_KATEGORI.map((k) => [k.id, k.subkategori.reduce((t, s) => t + kombinasi2(s.jumlahKata), 0)]),
]);

export const KOMBINASI_SATU_KATA: Record<string, number> = Object.fromEntries([
  [ID_KLASIK, PASANGAN_KLASIK.filter(([a, b]) => satuKata(a) && satuKata(b)).length],
  ...META_KATEGORI.map((k) => [k.id, k.subkategori.reduce((t, s) => t + kombinasi2(s.jumlahSatuKata), 0)]),
]);

export function totalKombinasi(kategori: string[], panjangKata: PanjangKata = 'bebas'): number {
  const tabel = panjangKata === 'satu' ? KOMBINASI_SATU_KATA : KOMBINASI_PER_KATEGORI;
  return kategori.reduce((t, id) => t + (tabel[id] ?? 0), 0);
}

export const PESAN_TANPA_SATU_KATA =
  'Kategori yang dipilih tidak punya pasangan satu kata, jadi ronde ini memakai kata yang boleh lebih dari satu kata.';

export function rapikanKategori(k: unknown): string[] {
  return Array.isArray(k) ? k.filter((x): x is string => typeof x === 'string' && SEMUA_KATEGORI.includes(x)) : [];
}

/**
 * Pilih pasangan sesuai filter panjang kata. Jika mode 'satu' tidak punya kandidat sama sekali,
 * jatuh ke mode 'bebas' dan `cadangan` bernilai true agar UI bisa memberi tahu pemain.
 */
export async function siapkanPasangan(
  kategori: string[],
  panjangKata: PanjangKata,
): Promise<{ pasangan: PasanganKata; cadangan: boolean }> {
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
