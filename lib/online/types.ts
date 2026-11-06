// Tipe state dan pesan untuk mode online (host = sumber state otoritatif, topologi bintang).
import type { Komposisi } from '../game';
import type { PesanChat } from './chat';
import type { BatasWaktu } from '../batasWaktu';
import type { EntriPetunjuk } from '../petunjuk';
import type { PanjangKata, PasanganKata, Pemenang, Peran, SumberKata } from '../types';

/**
 * Versi 4: salam membawa nonce identitas Supabase dan host bisa berpindah (versi 3: petunjuk ketik, versi 2: chat).
 * Klien versi lama ditolak dengan pesan "muat ulang".
 */
export const VERSI_PROTOKOL = 4;
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
  /** Id akun Supabase yang sudah diverifikasi host (hanya disimpan host, untuk mencatat hasil). */
  uid?: string;
}

export interface Pengaturan {
  komposisi: Komposisi;
  kategori: string[];
  /** Filter panjang kata pilihan host. Kosong (state lama) berarti 'satu'. */
  panjangKata?: PanjangKata;
  /** Sumber kata pilihan host. Kosong (state lama) ditebak dari id kategori. */
  sumberKata?: SumberKata;
  /** Room match: Kamus kita atau Internet diacak tiap game (semua kategori). Kosong di room match berarti campur. */
  sumberCampur?: boolean;
  /** Batas waktu giliran petunjuk dan vote pilihan host. Kosong (state lama) berarti tanpa batas. */
  batasWaktu?: BatasWaktu;
  /** Room tampil di daftar publik Online. Kosong/false = privat. Room match selalu dipaksa publik. */
  publik?: boolean;
}

/** Tenggat langkah yang sedang berjalan, dihitung dan dijaga host (jam host). */
export interface TenggatHost {
  /** Penanda langkah (fase, ronde, giliran, putaran vote); berganti tepat saat langkah berganti. */
  kunci: string;
  /** Waktu habis menurut jam host (ms). */
  sampai: number;
  /** Lama total langkah ini (ms), untuk progress bar. */
  total: number;
}

export type FaseOnline = 'kata' | 'diskusi' | 'vote' | 'terungkap' | 'hasil';

/** Target vote khusus untuk abstain (Lewati). Id pemain selalu diawali huruf 'p', jadi tidak bisa bentrok. */
export const SUARA_LEWATI = '-';

export interface HasilVote {
  hitung: Record<string, number>;
  /** Jumlah pemain yang memilih Lewati (opsional agar tetap cocok dengan host versi lama). */
  lewati?: number;
  /** Pemain yang seri suara terbanyak (kosong jika tidak seri). */
  seri: string[];
  keputusan: 'eliminasi' | 'voteUlang' | 'tanpaEliminasi';
}

export interface GameOnline {
  /** Id unik permainan (uuid) untuk mencatat riwayat tiap pemain tanpa duplikat. */
  idMain?: string;
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
  /** Voter id ke target id, atau SUARA_LEWATI untuk abstain. */
  suara: Record<string, string>;
  kandidat: string[];
  putaranVote: 1 | 2;
  hasilVote: HasilVote | null;
  /** Pemain yang baru tereliminasi lewat vote (null = aman). */
  tereliminasi: string | null;
  /** Pasangan Lovers yang ikut mati karena eliminasi berantai. */
  tereliminasiIkut?: string | null;
  tebakan: 'tidakPerlu' | 'menunggu' | 'salah';
  tebakanSalah?: string;
  pemenang: Pemenang | null;
  tebakanMrWhite?: string;
  /** Dua id pemain Lovers (null jika fitur off). */
  lovers: [string, string] | null;
  /** Kemenangan tambahan Lovers di akhir. */
  loversMenang?: boolean;
  /** Tenggat langkah saat ini; null/kosong jika tanpa batas waktu. */
  tenggat?: TenggatHost | null;
}

export interface StateHost {
  versi: number;
  kode: string;
  hostId: string;
  pemain: PemainOnline[];
  pengaturan: Pengaturan;
  game: GameOnline | null;
  /** Naik setiap state berubah, dipakai klien untuk mengabaikan view lama. */
  seq: number;
}

/** Aksi yang boleh dikirim pemain mana pun (dari HP masing-masing). */
export type AksiPemain =
  | { jenis: 'siap' }
  /** Batalkan Siap di fase baca kata (sebelum semua siap / diskusi dimulai). */
  | { jenis: 'batalSiap' }
  | { jenis: 'petunjuk'; teks: string }
  /** Pemain giliran sudah memberi petunjuk secara lisan: giliran maju tanpa entri riwayat. */
  | { jenis: 'sudahBicara' }
  /** target berisi id kandidat, atau SUARA_LEWATI untuk abstain. */
  | { jenis: 'vote'; target: string }
  | { jenis: 'tebak'; teks: string }
  | { jenis: 'keluar' };

/** Aksi yang hanya boleh dilakukan host. */
export type AksiKhususHost =
  | { jenis: 'aturPengaturan'; pengaturan: Pengaturan }
  | { jenis: 'mulai'; pasangan: PasanganKata; idMain?: string }
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
  | { jenis: 'gabung'; id: string; nama: string; token?: string; uid?: string }
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
  /** Label kategori pasangan ronde ini (aman dibagikan ke semua pemain). */
  kategoriKata: string;
  mrWhite: boolean;
  jester: boolean;
  /** Nama pasangan Lovers (hanya untuk diri sendiri jika termasuk pasangan). */
  namaLovers?: string | null;
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
  tereliminasiIkut?: string | null;
  tebakan: 'tidakPerlu' | 'menunggu' | 'salah';
  tebakanSalah?: string;
  /**
   * Sisa waktu langkah ini saat view dibuat host. Host mengirim sisa (bukan jam) agar selisih jam antar HP
   * tidak berpengaruh. `sampaiLokal` diisi penerima: Date.now() saat view diterima + sisaMs.
   */
  tenggat?: { kunci: string; sisaMs: number; totalMs: number; sampaiLokal?: number } | null;
  /** Diisi hanya saat permainan selesai. */
  hasil?: {
    pemenang: Pemenang;
    pasangan: PasanganKata;
    tebakanMrWhite?: string;
    idMain?: string;
    loversMenang?: boolean;
    /** Nama kedua Lovers (jika ada). */
    lovers?: [string, string];
  };
}

export interface ViewPemain {
  seq: number;
  kode: string;
  saya: string;
  hostId: string;
  pemain: PemainView[];
  pengaturan: Pengaturan;
  game: GameView | null;
}

/* --------------------------------- Pesan --------------------------------- */

export type PesanKeHost =
  | { t: 'halo'; v: number; id: string; nama: string; token: string; nonce?: string }
  | { t: 'ping' }
  | { t: 'aksi'; aksi: AksiPemain }
  | { t: 'chat'; teks: string };

export type PesanKeKlien =
  | { t: 'view'; view: ViewPemain }
  /** `chat: true` jika yang ditolak adalah pesan chat (ditampilkan di panel chat, bukan toast). */
  /** `petunjuk: true` jika yang ditolak adalah petunjuk (ditampilkan di bawah kolom petunjuk). `teks` = isi chat yang ditolak, dikembalikan ke pengirim. */
  /** `ganti: true` jika id pemain ini baru saja dipakai koneksi lain (tab atau HP lain): klien berhenti, tidak menyambung ulang. */
  | { t: 'tolak'; alasan: string; chat?: boolean; petunjuk?: boolean; teks?: string; ganti?: boolean }
  | { t: 'pong' }
  /** Host keluar dengan sengaja: pemain lain segera mencoba mengambil alih host. */
  | { t: 'hostPergi' }
  /** Akun ini sudah ada di room dengan id lain (HP baru): pakai id dan token lama itu. */
  | { t: 'idAkun'; id: string; token: string }
  | { t: 'chat'; pesan: PesanChat }
  | { t: 'riwayatChat'; pesan: PesanChat[] };
