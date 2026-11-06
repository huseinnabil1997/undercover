// Batas waktu giliran (petunjuk) dan voting, agar pemain tidak menunggu terlalu lama.
// Murni (tanpa DOM) kecuali pembacaan pilihan tersimpan, jadi bisa diuji.
import { baca, KUNCI } from './storage';

/** Dalam detik. 0 berarti tanpa batas (perilaku lama). */
export interface BatasWaktu {
  /** Batas satu giliran memberi petunjuk. */
  petunjuk: number;
  /** Batas diskusi dan voting (satu putaran vote). */
  vote: number;
}

export const TANPA_BATAS: BatasWaktu = { petunjuk: 0, vote: 0 };
export const PILIHAN_PETUNJUK = [0, 20, 30, 45, 60] as const;
export const PILIHAN_VOTE = [0, 30, 60, 90, 120] as const;
/** Tebakan Mr. White paling cepat 30 detik (mengetik satu kata butuh waktu). */
export const MIN_TEBAKAN = 30;
/** Peringatan suara dan getar di detik-detik terakhir. */
export const DETIK_PERINGATAN = 5;
/** Penanda di riwayat untuk giliran yang dilewati karena waktu habis. */
export const TEKS_WAKTU_HABIS = '(waktu habis)';
/** Host refresh: beri tambahan waktu agar pemain sempat tersambung ulang. */
export const TAMBAHAN_PULIH_MS = 10000;
/** Layar hasil eliminasi / aman: auto-lanjut tanpa menunggu host (detik). */
export const DETIK_LANJUT_HASIL = 8;
/** Fase baca kata: auto mulai diskusi jika belum semua Siap (detik). */
export const DETIK_SIAP_KATA = 45;

function pilih(x: unknown, daftar: readonly number[]): number {
  return typeof x === 'number' && daftar.includes(x) ? x : 0;
}

/** Rapikan nilai dari localStorage atau pesan (bisa rusak atau versi lama). */
export function rapikanBatasWaktu(raw: unknown): BatasWaktu {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { petunjuk: pilih(r.petunjuk, PILIHAN_PETUNJUK), vote: pilih(r.vote, PILIHAN_VOTE) };
}

export function adaBatas(b: BatasWaktu | undefined | null): boolean {
  return !!b && (b.petunjuk > 0 || b.vote > 0);
}

/** Batas tebakan Mr. White (detik); hanya aktif jika salah satu batas aktif. */
export function detikTebakan(b: BatasWaktu | undefined | null): number {
  if (!b || !adaBatas(b)) return 0;
  return Math.max(MIN_TEBAKAN, b.petunjuk);
}

export function labelDetik(d: number): string {
  return d === 0 ? 'Tanpa batas' : `${d} dtk`;
}

/** Tampilan sisa waktu, misal 0:07 atau 1:30. */
export function formatSisa(detik: number): string {
  const d = Math.max(0, Math.ceil(detik));
  return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`;
}

/**
 * Pilihan terakhir di perangkat ini. Pengguna lama yang memakai timer vote manual (60/90/120 detik)
 * otomatis mendapat batas vote yang sama.
 */
export function batasTersimpan(): BatasWaktu {
  const simpan = baca<unknown>(KUNCI.batasWaktu, null);
  if (simpan !== null) return rapikanBatasWaktu(simpan);
  return { petunjuk: 0, vote: pilih(baca<unknown>(KUNCI.timer, 0), PILIHAN_VOTE) };
}
