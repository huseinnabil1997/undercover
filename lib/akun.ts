// Aturan akun: login cukup dengan username + password. Supabase Auth butuh email, jadi username diubah
// menjadi email sintetis yang tidak pernah dikirimi surat. Keunikan username (tanpa beda besar kecil) dijaga
// oleh email unik di Auth dan indeks unik lower(username) di tabel profil.
import type { Pemenang, Peran } from './types';

export const USERNAME_MIN = 3;
export const USERNAME_MAKS = 20;
export const PASSWORD_MIN = 6;
export const DOMAIN_AKUN = 'undercover.local';
const POLA_USERNAME = /^[A-Za-z0-9_]+$/;

export function rapikanUsername(u: string): string {
  return u.trim();
}

/** Pesan galat untuk username, atau null jika valid. */
export function cekUsername(u: string): string | null {
  const t = rapikanUsername(u);
  if (t.length < USERNAME_MIN || t.length > USERNAME_MAKS) return `Username ${USERNAME_MIN} sampai ${USERNAME_MAKS} karakter.`;
  if (!POLA_USERNAME.test(t)) return 'Username hanya huruf, angka, dan garis bawah (_).';
  return null;
}

export function cekPassword(p: string): string | null {
  return p.length < PASSWORD_MIN ? `Password minimal ${PASSWORD_MIN} karakter.` : null;
}

export function emailDari(username: string): string {
  return `${rapikanUsername(username).toLowerCase()}@${DOMAIN_AKUN}`;
}

/** Terjemahkan galat Supabase Auth ke bahasa Indonesia. */
export function pesanGalatAuth(e: { message?: string; code?: string } | null | undefined): string {
  const kode = e?.code ?? '';
  const pesan = (e?.message ?? '').toLowerCase();
  if (kode === 'user_already_exists' || kode === 'email_exists' || pesan.includes('already registered')) return 'Username sudah dipakai.';
  if (kode === 'invalid_credentials' || pesan.includes('invalid login')) return 'Username atau password salah.';
  if (kode === 'email_not_confirmed') return 'Akun belum aktif: konfirmasi email masih menyala di pengaturan project. Hubungi pengelola game.';
  if (kode === 'over_email_send_rate_limit' || kode === 'over_request_rate_limit' || pesan.includes('rate limit')) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (kode === 'weak_password') return `Password terlalu lemah. Minimal ${PASSWORD_MIN} karakter.`;
  if (kode === 'unexpected_failure' || pesan.includes('database error')) return 'Username sudah dipakai atau tidak valid.';
  if (pesan.includes('fetch') || pesan.includes('network')) return 'Tidak bisa terhubung ke server. Periksa internet.';
  return 'Gagal. Coba lagi.';
}

/** Peran untuk statistik (nama di database). */
export type PeranDb = 'civilian' | 'undercover' | 'mrwhite';

export function peranDb(p: Peran): PeranDb {
  return p === 'mrwhite' ? 'mrwhite' : p === 'undercover' ? 'undercover' : 'civilian';
}

export function menangDengan(peran: Peran, pemenang: Pemenang): boolean {
  return pemenang === 'civilian' ? peran === 'civilian' : pemenang === 'mrwhite' ? peran === 'mrwhite' : peran !== 'civilian';
}

export interface BarisStatistik { peran: PeranDb; main: number; menang: number }

export interface RingkasanStatistik {
  main: number;
  menang: number;
  /** 0 sampai 100, dibulatkan; null jika belum pernah main. */
  persen: number | null;
  perPeran: Record<PeranDb, { main: number; menang: number; persen: number | null }>;
}

export function persen(menang: number, main: number): number | null {
  return main > 0 ? Math.round((menang / main) * 100) : null;
}

export function ringkasStatistik(baris: BarisStatistik[]): RingkasanStatistik {
  const perPeran = {} as RingkasanStatistik['perPeran'];
  for (const p of ['civilian', 'undercover', 'mrwhite'] as const) {
    const b = baris.find((x) => x.peran === p);
    const main = b?.main ?? 0;
    const menang = b?.menang ?? 0;
    perPeran[p] = { main, menang, persen: persen(menang, main) };
  }
  const main = baris.reduce((a, b) => a + b.main, 0);
  const menang = baris.reduce((a, b) => a + b.menang, 0);
  return { main, menang, persen: persen(menang, main), perPeran };
}
