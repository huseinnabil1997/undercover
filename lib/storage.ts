// Penyimpanan lokal di perangkat (localStorage). Tidak ada data yang dikirim ke server.
const PREFIX = 'undercover:';

export const KUNCI = {
  nama: 'nama',
  komposisi: 'komposisi',
  /** v2: default berubah menjadi semua kategori terpilih, pilihan lama tidak dipakai lagi. */
  kategori: 'kategori.v2',
  panjangKata: 'panjangKata',
  timer: 'timer',
  riwayat: 'riwayatPasangan',
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
