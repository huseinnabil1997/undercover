// Tipe state dan pesan untuk mode online (host = sumber state otoritatif, topologi bintang).
import type { Komposisi } from '../game';
import type { PesanChat } from './chat';
import type { EntriPetunjuk } from '../petunjuk';
import type { PasanganKata, Pemenang, Peran } from '../types';

/** Versi 3: diskusi dengan petunjuk ketik (versi 2 menambah chat). Klien versi lama ditolak dengan pesan "muat ulang". */
export const VERSI_PROTOKOL = 3;
export const INTERVAL_PING_MS = 3000;
/** Pemain dianggap offline jika host tidak menerima pesan apa pun selama ini. */
export const BATAS_OFFLINE_MS = 10000;

export interface PemainOnline {
  id: string;
  nama: string;
  online: boolean;
  terakhir: number;
  /** Rahasia sesi pemain (hanya disimpan host, tidak pernah dikirim ke pemain lain). */
  token?: string;
}

export interface Pengaturan {
  komposisi: Komposisi;
  kategori: string[];
}

export type FaseOnline = 'kata' | 'diskusi' | 'vote' | 'terungkap' | 'hasil';

export interface HasilVote {
  hitung: Record<string, number>;
  /** Pemain yang seri suara terbanyak (kosong jika tidak seri). */
  seri: string[];
  keputusan: 'eliminasi' | 'voteUlang' | 'tanpaEliminasi';
}

export interface GameOnline {
  peserta: string[];
  peran: Record<string, Peran>;
  hidup: Record<string, boolean>;
  pasangan: PasanganKata;
  ronde: number;
  fase: FaseOnline;
  siap: string[];
  urutan: string[];
  giliran: number;
  /** Riwayat petunjuk semua ronde di game ini (publik untuk semua pemain). */
  petunjuk: EntriPetunjuk[];
  /** Voter id ke target id. */
  suara: Record<string, string>;
  kandidat: string[];
  putaranVote: 1 | 2;
  hasilVote: HasilVote | null;
  /** Pemain yang baru tereliminasi (null = tidak ada eliminasi pada voting ini). */
  tereliminasi: string | null;
  tebakan: 'tidakPerlu' | 'menunggu' | 'salah';
  tebakanSalah?: string;
  pemenang: Pemenang | null;
  tebakanMrWhite?: string;
}

export interface StateHost {
  versi: number;
  kode: string;
  hostId: string;
  pemain: PemainOnline[];
  pengaturan: Pengaturan;
  game: GameOnline | null;
  skor: Record<string, number>;
  /** Naik setiap state berubah, dipakai klien untuk mengabaikan view lama. */
  seq: number;
}

/** Aksi yang boleh dikirim pemain mana pun (dari HP masing-masing). */
export type AksiPemain =
  | { jenis: 'siap' }
  | { jenis: 'petunjuk'; teks: string }
  /** Pemain giliran sudah memberi petunjuk secara lisan: giliran maju tanpa entri riwayat. */
  | { jenis: 'sudahBicara' }
  | { jenis: 'vote'; target: string }
  | { jenis: 'tebak'; teks: string }
  | { jenis: 'keluar' };

/** Aksi yang hanya boleh dilakukan host. */
export type AksiKhususHost =
  | { jenis: 'aturPengaturan'; pengaturan: Pengaturan }
  | { jenis: 'mulai'; pasangan: PasanganKata }
  | { jenis: 'mulaiDiskusi' }
  | { jenis: 'lewatiGiliran' }
  | { jenis: 'mulaiVote' }
  | { jenis: 'tutupVote' }
  | { jenis: 'lewatiTebakan' }
  | { jenis: 'lanjut' }
  | { jenis: 'keLobby' }
  | { jenis: 'keluarkan'; id: string };

/** Aksi sistem dari lapisan jaringan host. */
export type AksiSistem =
  | { jenis: 'gabung'; id: string; nama: string; token?: string }
  | { jenis: 'terlihat'; id: string }
  | { jenis: 'putus'; id: string }
  | { jenis: 'tick' };

export type Aksi = (AksiPemain | AksiKhususHost) & { dari: string } | AksiSistem;

/* ---------------------------- View per pemain ---------------------------- */

export interface PemainView {
  id: string;
  nama: string;
  online: boolean;
  host: boolean;
  /** Ikut permainan yang sedang berjalan. */
  ikut: boolean;
  hidup: boolean;
  /** Peran hanya diisi jika sudah terbuka (tereliminasi atau permainan selesai). */
  peran?: Peran;
}

export interface GameView {
  ronde: number;
  fase: FaseOnline;
  ikut: boolean;
  hidup: boolean;
  /** Kata milik pemain ini. null untuk Mr. White atau penonton. */
  kata: string | null;
  mrWhite: boolean;
  siap: string[];
  urutan: string[];
  giliran: number;
  /** Riwayat petunjuk (hanya id pemain, ronde, teks; tanpa kata rahasia). */
  petunjuk: EntriPetunjuk[];
  /** Siapa saja yang sudah vote (tanpa isi pilihannya). */
  sudahVote: string[];
  pilihanSaya: string | null;
  kandidat: string[];
  putaranVote: 1 | 2;
  hasilVote: HasilVote | null;
  tereliminasi: string | null;
  tebakan: 'tidakPerlu' | 'menunggu' | 'salah';
  tebakanSalah?: string;
  /** Diisi hanya saat permainan selesai. */
  hasil?: { pemenang: Pemenang; pasangan: PasanganKata; tebakanMrWhite?: string };
}

export interface ViewPemain {
  seq: number;
  kode: string;
  saya: string;
  hostId: string;
  pemain: PemainView[];
  pengaturan: Pengaturan;
  skor: Record<string, number>;
  game: GameView | null;
}

/* --------------------------------- Pesan --------------------------------- */

export type PesanKeHost =
  | { t: 'halo'; v: number; id: string; nama: string; token: string }
  | { t: 'ping' }
  | { t: 'aksi'; aksi: AksiPemain }
  | { t: 'chat'; teks: string };

export type PesanKeKlien =
  | { t: 'view'; view: ViewPemain }
  /** `chat: true` jika yang ditolak adalah pesan chat (ditampilkan di panel chat, bukan toast). */
  /** `petunjuk: true` jika yang ditolak adalah petunjuk (ditampilkan di bawah kolom petunjuk). `teks` = isi chat yang ditolak, dikembalikan ke pengirim. */
  | { t: 'tolak'; alasan: string; chat?: boolean; petunjuk?: boolean; teks?: string }
  | { t: 'pong' }
  | { t: 'chat'; pesan: PesanChat }
  | { t: 'riwayatChat'; pesan: PesanChat[] };
