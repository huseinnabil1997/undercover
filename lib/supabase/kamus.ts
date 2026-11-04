// Akses kamus pemain di Supabase. Baca publik (tanpa login); tulis hanya milik sendiri (RLS).
import { baca, KUNCI } from '../storage';
import { bacaCacheKamus, cacheSegar, simpanCacheKamus, type EntriKamus } from '../kamusPemain';
import { supabase } from './klien';

export interface BarisKamus { id: number; user_id: string; kata_a: string; kata_b: string; kategori: string }

const MAKS_BACA = 5000;

/** Ambil seluruh kamus publik dari server lalu simpan ke cache lokal. */
export async function ambilKamusPublik(): Promise<EntriKamus[]> {
  const { data, error } = await supabase().from('kamus_pemain').select('kata_a, kata_b, kategori').order('id').range(0, MAKS_BACA - 1);
  if (error) throw error;
  const hasil = (data ?? []).map((r) => ({ a: r.kata_a as string, b: r.kata_b as string, k: r.kategori as string }));
  simpanCacheKamus(hasil);
  return hasil;
}

/** Kamus publik: dari cache bila masih segar, selain itu ambil ulang; bila gagal, pakai cache lama. */
export async function kamusPublik(paksa = false): Promise<{ data: EntriKamus[]; dariCache: boolean }> {
  const c = bacaCacheKamus();
  if (!paksa && c && cacheSegar(c)) return { data: c.data, dariCache: true };
  try {
    return { data: await ambilKamusPublik(), dariCache: false };
  } catch (e) {
    if (c) return { data: c.data, dariCache: true };
    throw e;
  }
}

export async function ambilKamusSaya(userId: string): Promise<BarisKamus[]> {
  const { data, error } = await supabase().from('kamus_pemain').select('id, user_id, kata_a, kata_b, kategori').eq('user_id', userId).order('dibuat', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BarisKamus[];
}

export async function tambahKamus(a: string, b: string, kategori: string): Promise<void> {
  const { error } = await supabase().from('kamus_pemain').insert({ kata_a: a, kata_b: b, kategori });
  if (error) throw error;
}

export async function ubahKamus(id: number, a: string, b: string, kategori: string): Promise<void> {
  const { data, error } = await supabase().from('kamus_pemain').update({ kata_a: a, kata_b: b, kategori }).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw Object.assign(new Error('Tidak diizinkan'), { code: '42501' });
}

export async function hapusKamus(id: number): Promise<void> {
  const { data, error } = await supabase().from('kamus_pemain').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw Object.assign(new Error('Tidak diizinkan'), { code: '42501' });
}

export interface BarisPeringkat { id: string; username: string; avatar_versi: number | null; main: number; menang: number }
export type UrutPeringkat = 'menang' | 'winrate';
export type PeranPeringkat = 'semua' | 'civilian' | 'undercover' | 'mrwhite';
/** Winrate hanya dihitung untuk pemain dengan minimal sekian permainan (di peran yang dipilih). */
export const MIN_MAIN_WINRATE = 5;

export const URUT_PERINGKAT: { id: UrutPeringkat; nama: string }[] = [{ id: 'menang', nama: 'Jumlah menang' }, { id: 'winrate', nama: 'Winrate' }];
export const PERAN_PERINGKAT: { id: PeranPeringkat; nama: string }[] = [
  { id: 'semua', nama: 'Keseluruhan' }, { id: 'civilian', nama: 'Civilian' }, { id: 'undercover', nama: 'Undercover' }, { id: 'mrwhite', nama: 'Mr. White' },
];

/** Pilihan tersimpan; nilai tidak dikenal kembali ke bawaan. */
export function pilihanPeringkat(): { urut: UrutPeringkat; peran: PeranPeringkat } {
  const u = baca<unknown>(KUNCI.peringkatUrut, null);
  const p = baca<unknown>(KUNCI.peringkatPeran, null);
  return {
    urut: URUT_PERINGKAT.some((x) => x.id === u) ? (u as UrutPeringkat) : 'menang',
    peran: PERAN_PERINGKAT.some((x) => x.id === p) ? (p as PeranPeringkat) : 'semua',
  };
}


/**
 * Leaderboard per peran ('semua' = gabungan). Urut 'menang': menang terbanyak, lalu main paling sedikit,
 * lalu username. Urut 'winrate': winrate tertinggi (minimal MIN_MAIN_WINRATE main), lalu menang, lalu main terbanyak.
 */
export async function ambilPeringkat(urut: UrutPeringkat = 'menang', peran: PeranPeringkat = 'semua', batas = 50): Promise<BarisPeringkat[]> {
  let q = supabase().from('papan_peringkat_peran').select('id, username, avatar_versi, main, menang').eq('peran', peran);
  q = urut === 'winrate'
    ? q.gte('main', MIN_MAIN_WINRATE).order('winrate', { ascending: false }).order('menang', { ascending: false }).order('main', { ascending: false })
    : q.order('menang', { ascending: false }).order('main', { ascending: true });
  const { data, error } = await q.order('username').limit(batas);
  if (error) throw error;
  return (data ?? []) as BarisPeringkat[];
}
