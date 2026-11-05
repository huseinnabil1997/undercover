// Penyimpanan lokal di perangkat (localStorage). Tidak ada data yang dikirim ke server.
const PREFIX = 'undercover:';

export const KUNCI = {
  nama: 'nama',
  komposisi: 'komposisi',
  /** v2: default berubah menjadi semua kategori terpilih, pilihan lama tidak dipakai lagi. */
  kategori: 'kategori.v2',
  /** Sumber kata: 'internet' (bawaan) atau 'kamus'. */
  sumberKata: 'sumberKata',
  /** Pilihan kategori untuk sumber Internet (terpisah dari kategori Kamus kita). */
  kategoriInternet: 'kategoriInternet',
  panjangKata: 'panjangKata',
  /** Room match: true bila host terakhir memilih campuran Kamus kita dan Internet. */
  sumberMatchCampur: 'sumberMatchCampur',
  /** Timer vote manual versi lama (detik); hanya dibaca untuk migrasi ke batasWaktu. */
  timer: 'timer',
  /** Batas waktu giliran petunjuk dan vote: { petunjuk, vote } dalam detik, 0 = tanpa batas. */
  batasWaktu: 'batasWaktu',
  riwayat: 'riwayatPasangan',
  /** Mode Lokal memakai kamus pemain (publik) sebagai sumber kata. */
  pakaiKamusPemain: 'pakaiKamusPemain',
  /** Pilihan leaderboard: urutan ('menang' | 'winrate') dan peran ('semua' | peran). */
  peringkatUrut: 'peringkatUrut',
  peringkatPeran: 'peringkatPeran',
  /** Cache kamus pemain publik: { waktu, data }. */
  cacheKamusPemain: 'kamusPemain.cache',
  /** Snapshot top 3 musim berjalan milik sendiri (notifikasi). */
  top3Musim: 'top3Musim',
} as const;

/** Kunci lama yang sudah tidak dipakai (pilihan kategori versi 1 dan skor). */
export const KUNCI_LAMA = ['kategori', 'skor'] as const;

export function hapus(kunci: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PREFIX + kunci);
  } catch {
    // abaikan
  }
}

/** Migrasi sekali: buang kunci lama agar semua pemain mulai dengan semua kategori terpilih. */
export function bersihkanKunciLama(): void {
  for (const k of KUNCI_LAMA) hapus(k);
}

export function baca<T>(kunci: string, cadangan: T): T {
  if (typeof window === 'undefined') return cadangan;
  try {
    const raw = window.localStorage.getItem(PREFIX + kunci);
    return raw === null ? cadangan : (JSON.parse(raw) as T);
  } catch {
    return cadangan;
  }
}

export function simpan(kunci: string, nilai: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFIX + kunci, JSON.stringify(nilai));
  } catch {
    // Penyimpanan penuh atau diblokir: abaikan, game tetap jalan.
  }
}
