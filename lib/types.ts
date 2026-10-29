export type Peran = 'civilian' | 'undercover' | 'mrwhite';

export interface Subkategori {
  id: string;
  nama: string;
  kata: string[];
}

export interface Kategori {
  id: string;
  nama: string;
  subkategori: Subkategori[];
}

export interface SubkategoriMeta {
  id: string;
  nama: string;
  jumlahKata: number;
}

export interface KategoriMeta {
  id: string;
  nama: string;
  subkategori: SubkategoriMeta[];
}

export interface PasanganKata {
  /** Kata untuk Civilian. */
  civilian: string;
  /** Kata untuk Undercover. */
  undercover: string;
  /** Nama sumber, misalnya "Makanan / Mi, Bakso & Olahan" atau "Klasik". */
  sumber: string;
}

export interface Pemain {
  nama: string;
  peran: Peran;
  hidup: boolean;
}

export type Pemenang = 'civilian' | 'penyusup' | 'mrwhite';
