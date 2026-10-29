// Penyimpanan lokal di perangkat (localStorage). Tidak ada data yang dikirim ke server.
const PREFIX = 'undercover:';

export const KUNCI = {
  nama: 'nama',
  komposisi: 'komposisi',
  kategori: 'kategori',
  panjangKata: 'panjangKata',
  timer: 'timer',
  riwayat: 'riwayatPasangan',
  skor: 'skor',
} as const;

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
