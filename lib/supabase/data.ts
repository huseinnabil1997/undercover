// Akses data akun, statistik, dan riwayat. Semua dibatasi RLS; riwayat online dicatat host lewat RPC (lib/supabase/room).
import type { PasanganKata, Pemenang, Peran } from '../types';
import { menangDengan, peranDb, type BarisStatistik, type PeranDb } from '../akun';
import { supabase } from './klien';
import { BUCKET_AVATAR, pathAvatar } from '../avatar';

export interface EntriRiwayat {
  id: number;
  peran: PeranDb;
  menang: boolean;
  pemenang: Pemenang;
  kata_civilian: string;
  kata_undercover: string;
  jumlah_pemain: number;
  waktu: string;
}

export const UKURAN_HALAMAN_RIWAYAT = 10;

export interface ProfilPublik { id: string; username: string; avatar_versi: number | null }

const cacheProfil = new Map<string, Promise<ProfilPublik | null>>();

/** Profil per username dengan cache sesi (untuk avatar di room, chat, dan hasil). */
export function profilTercache(username: string): Promise<ProfilPublik | null> {
  const k = username.toLowerCase();
  let p = cacheProfil.get(k);
  if (!p) {
    p = ambilProfilUsername(username).catch(() => {
      cacheProfil.delete(k);
      return null;
    });
    cacheProfil.set(k, p);
  }
  return p;
}

export function lupakanProfil(username: string): void {
  cacheProfil.delete(username.toLowerCase());
}

/** Waktu terakhir username diganti (null bila belum pernah). */
export async function ambilUsernameDiganti(id: string): Promise<string | null> {
  const { data, error } = await supabase().from('profil').select('username_diganti').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data?.username_diganti as string | null | undefined) ?? null;
}

/** Bisa ganti username lagi pada (null = sekarang juga boleh). */
export function bisaGantiLagi(diganti: string | null, now = Date.now()): Date | null {
  if (!diganti) return null;
  const t = new Date(diganti).getTime() + 7 * 24 * 3600 * 1000;
  return t > now ? new Date(t) : null;
}

/**
 * Ganti username lewat RPC (server mengganti profil dan email login sintetis). Cache avatar per username
 * untuk nama lama dan baru dibuang, lalu sesi disegarkan agar nama di aplikasi ikut berganti.
 * Mengembalikan waktu penggantian (ISO).
 */
export async function gantiUsername(lama: string, baru: string): Promise<string> {
  const { data, error } = await supabase().rpc('ganti_username', { baru });
  if (error) throw Object.assign(new Error(pesanGantiUsername(error)), { code: error.code });
  lupakanProfil(lama);
  lupakanProfil(baru);
  await supabase().auth.refreshSession().catch(() => {});
  return data as string;
}

export function pesanGantiUsername(e: { code?: string; message?: string }): string {
  if (e.code === '23505') return 'Username sudah dipakai.';
  if (e.code === '22023' || e.code === 'P0001') return `${e.message ?? 'Username tidak valid'}.`;
  if (e.code === '42501') return 'Harus masuk dulu.';
  return 'Gagal mengganti username. Periksa internet lalu coba lagi.';
}

/** Unggah foto (sudah diproses) lalu naikkan versi di profil. */
export async function unggahAvatar(userId: string, blob: Blob, versiLama: number | null): Promise<number> {
  const { error } = await supabase().storage.from(BUCKET_AVATAR).upload(pathAvatar(userId), blob, { upsert: true, contentType: blob.type, cacheControl: '31536000' });
  if (error) throw error;
  const versi = (versiLama ?? 0) + 1;
  const { error: e2 } = await supabase().from('profil').update({ avatar_versi: versi }).eq('id', userId);
  if (e2) throw e2;
  return versi;
}

export async function hapusAvatar(userId: string): Promise<void> {
  const { error } = await supabase().storage.from(BUCKET_AVATAR).remove([pathAvatar(userId)]);
  if (error) throw error;
  const { error: e2 } = await supabase().from('profil').update({ avatar_versi: null }).eq('id', userId);
  if (e2) throw e2;
}

export async function ambilProfil(id: string): Promise<ProfilPublik | null> {
  const { data, error } = await supabase().from('profil').select('id, username, avatar_versi').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ambilProfilUsername(username: string): Promise<ProfilPublik | null> {
  const { data, error } = await supabase().from('profil').select('id, username, avatar_versi').ilike('username', polaPersis(username)).maybeSingle();
  if (error) throw error;
  return data;
}

/** Pola ilike yang cocok persis (tanpa beda besar kecil); _ dan % di-escape. */
export function polaPersis(teks: string): string {
  return teks.trim().replace(/[\\%_]/g, (c) => '\\' + c);
}

/** Cari username yang diawali teks tertentu. */
export async function cariProfil(teks: string): Promise<ProfilPublik[]> {
  const t = teks.trim();
  if (!t) return [];
  const { data, error } = await supabase().from('profil').select('id, username, avatar_versi').ilike('username', polaPersis(t) + '%').order('username').limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function ambilStatistik(userId: string): Promise<BarisStatistik[]> {
  const { data, error } = await supabase().from('statistik').select('peran, main, menang').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as BarisStatistik[];
}

export async function ambilRiwayat(userId: string, halaman: number): Promise<{ baris: EntriRiwayat[]; adaLagi: boolean }> {
  const dari = halaman * UKURAN_HALAMAN_RIWAYAT;
  // Ambil satu baris ekstra untuk tahu apakah masih ada halaman berikutnya.
  const { data, error } = await supabase()
    .from('riwayat_main')
    .select('id, peran, menang, pemenang, kata_civilian, kata_undercover, jumlah_pemain, waktu')
    .eq('user_id', userId)
    .order('waktu', { ascending: false })
    .order('id', { ascending: false })
    .range(dari, dari + UKURAN_HALAMAN_RIWAYAT);
  if (error) throw error;
  const baris = (data ?? []) as EntriRiwayat[];
  return { baris: baris.slice(0, UKURAN_HALAMAN_RIWAYAT), adaLagi: baris.length > UKURAN_HALAMAN_RIWAYAT };
}

export interface HasilUntukDicatat {
  idMain: string;
  peran: Peran;
  pemenang: Pemenang;
  pasangan: PasanganKata;
  jumlahPemain: number;
  adalahLovers?: boolean;
  loversMenang?: boolean;
}

/** Baris riwayat_main untuk hasil satu permainan online. */
export function barisRiwayat(h: HasilUntukDicatat) {
  return {
    id_main: h.idMain,
    mode: 'online' as const,
    peran: peranDb(h.peran),
    menang: menangDengan(h.peran, h.pemenang, {
      loversMenang: h.loversMenang,
      adalahLovers: h.adalahLovers,
    }),
    pemenang: h.pemenang === 'lovers' ? 'lovers' : h.pemenang,
    kata_civilian: h.pasangan.civilian.slice(0, 60),
    kata_undercover: h.pasangan.undercover.slice(0, 60),
    jumlah_pemain: h.jumlahPemain,
    adalah_lovers: !!h.adalahLovers,
    lovers_menang: !!h.loversMenang,
  };
}

