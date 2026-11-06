// Label kategori kata untuk lobby dan selama game (online + lokal).
import { PILIHAN_KATEGORI, PILIHAN_KATEGORI_INTERNET, tebakSumber } from './bankKata';
import { ID_PEMAIN } from './kamusGabung';
import type { SumberKata } from './types';

const NAMA: Record<string, string> = Object.fromEntries(
  [...PILIHAN_KATEGORI, ...PILIHAN_KATEGORI_INTERNET].map((k) => [k.id, k.nama]),
);

/** Nama tampilan satu id kategori (bawaan atau pemain). */
export function namaIdKategori(id: string, namaPemain?: readonly { id: string; nama: string }[]): string {
  if (namaPemain) {
    const p = namaPemain.find((x) => x.id === id);
    if (p) return p.nama;
  }
  if (NAMA[id]) return NAMA[id];
  if (id.startsWith(ID_PEMAIN)) return id.slice(ID_PEMAIN.length) || 'Kata pemain';
  return id;
}

/**
 * Label pasangan kata ronde ini. `sumber` di PasanganKata adalah nama kategori/sumber
 * (mis. "Klasik", "Makanan / ..."). Kosong = kata tanpa kategori jelas.
 */
export function labelKategoriPasangan(sumber: string | null | undefined): string {
  const t = (sumber ?? '').trim();
  if (!t) return 'Kata pemain';
  return t;
}

export interface PengaturanKategori {
  kategori: readonly string[];
  sumberKata?: SumberKata;
  sumberCampur?: boolean;
}

/** Ringkas pilihan host di lobby / sebelum Mulai. */
export function labelKategoriLobby(
  p: PengaturanKategori,
  namaPemain?: readonly { id: string; nama: string }[],
): string {
  if (p.sumberCampur) return 'Campur (acak tiap game)';
  const sumber = p.sumberKata ?? tebakSumber(p.kategori);
  if (!p.kategori.length) return 'Belum dipilih';
  const semuaBawaan = sumber === 'internet'
    ? PILIHAN_KATEGORI_INTERNET.map((k) => k.id)
    : PILIHAN_KATEGORI.map((k) => k.id);
  const set = new Set(p.kategori);
  if (semuaBawaan.length > 0 && semuaBawaan.every((id) => set.has(id)) && p.kategori.length >= semuaBawaan.length) {
    return sumber === 'internet' ? 'Semua kategori Internet' : 'Semua kategori Kamus kita';
  }
  const nama = p.kategori.map((id) => namaIdKategori(id, namaPemain));
  if (nama.length <= 3) return nama.join(', ');
  return `${nama.slice(0, 2).join(', ')} +${nama.length - 2} lainnya`;
}
