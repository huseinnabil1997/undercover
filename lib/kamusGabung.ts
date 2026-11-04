// Kamus pemain digabung ke sumber bawaan (Kamus kita dan Internet). Kategori dengan nama sama
// (tanpa beda besar kecil huruf dan spasi) masuk ke kategori bawaan; nama baru menjadi kategori
// sendiri dengan id berawalan 'p:'.
import { idKategori, kelompokKategori, type EntriKamus } from './kamusPemain';

export const ID_PEMAIN = 'p:';

export interface TambahanPemain {
  /** Pasangan pemain per id kategori (bawaan atau 'p:...'). */
  perKategori: Map<string, [string, string][]>;
  /** Kategori baru dari pemain (tidak ada padanan di sumber bawaan). */
  baru: { id: string; nama: string }[];
}

/** Kelompokkan kamus pemain ke kategori sebuah sumber. `bawaan` berisi id dan nama kategori bawaan sumber itu. */
export function tambahanPemain(data: readonly EntriKamus[], bawaan: readonly { id: string; nama: string }[]): TambahanPemain {
  const cocok = new Map<string, string>();
  for (const k of bawaan) {
    cocok.set(idKategori(k.nama), k.id);
    cocok.set(idKategori(k.id), k.id);
  }
  const nama = new Map(kelompokKategori(data).map((k) => [k.id, k.nama]));
  const perKategori = new Map<string, [string, string][]>();
  const baru = new Map<string, string>();
  for (const e of data) {
    const n = idKategori(e.k);
    const id = cocok.get(n) ?? `${ID_PEMAIN}${n}`;
    if (!cocok.has(n)) baru.set(id, nama.get(n) ?? n);
    perKategori.set(id, [...(perKategori.get(id) ?? []), [e.a, e.b]]);
  }
  return {
    perKategori,
    baru: [...baru].map(([id, n]) => ({ id, nama: n })).sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' })),
  };
}

/** Semua kategori baru dari pemain yang ada di cache (id 'p:...'). */
export function kategoriPemain(data: readonly EntriKamus[], bawaan: readonly { id: string; nama: string }[]): string[] {
  return tambahanPemain(data, bawaan).baru.map((k) => k.id);
}
