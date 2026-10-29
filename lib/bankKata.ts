// Memuat bank kata (lazy per kategori) lalu memilih satu pasangan yang belum baru dipakai.
// Dipakai mode satu HP dan host mode online. Riwayat disimpan di perangkat ini saja.
import { META_KATEGORI, PEMUAT_KATEGORI } from '../data/words';
import { PASANGAN_KLASIK } from '../data/klasik';
import { catatRiwayat, ID_KLASIK, kombinasi2, pilihPasangan } from './game';
import { baca, KUNCI, simpan } from './storage';
import type { PasanganKata } from './types';

export const SEMUA_KATEGORI = [ID_KLASIK, ...META_KATEGORI.map((k) => k.id)];

export const PILIHAN_KATEGORI = [{ id: ID_KLASIK, nama: 'Klasik (kurasi)' }, ...META_KATEGORI.map((k) => ({ id: k.id, nama: k.nama }))];

export const KOMBINASI_PER_KATEGORI: Record<string, number> = Object.fromEntries([
  [ID_KLASIK, PASANGAN_KLASIK.length],
  ...META_KATEGORI.map((k) => [k.id, k.subkategori.reduce((t, s) => t + kombinasi2(s.jumlahKata), 0)]),
]);

export function totalKombinasi(kategori: string[]): number {
  return kategori.reduce((t, id) => t + (KOMBINASI_PER_KATEGORI[id] ?? 0), 0);
}

export function rapikanKategori(k: unknown): string[] {
  return Array.isArray(k) ? k.filter((x): x is string => typeof x === 'string' && SEMUA_KATEGORI.includes(x)) : [];
}

export async function siapkanPasangan(kategori: string[]): Promise<PasanganKata> {
  const idBank = kategori.filter((id) => id !== ID_KLASIK && PEMUAT_KATEGORI[id]);
  const dataKategori = await Promise.all(idBank.map(async (id) => (await PEMUAT_KATEGORI[id]()).default));
  const riwayat = baca<string[]>(KUNCI.riwayat, []);
  const pasangan = pilihPasangan({
    kategori: dataKategori,
    klasik: kategori.includes(ID_KLASIK) ? PASANGAN_KLASIK : [],
    riwayat,
  });
  simpan(KUNCI.riwayat, catatRiwayat(riwayat, pasangan));
  return pasangan;
}
