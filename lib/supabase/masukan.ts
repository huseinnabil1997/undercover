// Akses fitur Masukan (saran/feedback) + upvote. Semua lewat RLS / RPC.
import { supabase } from './klien';

export type KategoriMasukan = 'bug' | 'fitur' | 'lainnya';
export type StatusMasukan = 'baru' | 'diterima' | 'dikerjakan' | 'selesai' | 'ditolak';
export type UrutMasukan = 'vote' | 'baru';

export interface BarisMasukan {
  id: number;
  user_id: string;
  username: string;
  isi: string;
  kategori: KategoriMasukan;
  status: StatusMasukan;
  dibuat: string;
  jumlah_vote: number;
  saya_vote: boolean;
}

export const MAKS_ISI_MASUKAN = 500;
export const KATEGORI_MASUKAN: { id: KategoriMasukan; nama: string }[] = [
  { id: 'bug', nama: 'Bug' },
  { id: 'fitur', nama: 'Fitur' },
  { id: 'lainnya', nama: 'Lainnya' },
];
export const STATUS_MASUKAN: { id: StatusMasukan; nama: string }[] = [
  { id: 'baru', nama: 'Baru' },
  { id: 'diterima', nama: 'Diterima' },
  { id: 'dikerjakan', nama: 'Dikerjakan' },
  { id: 'selesai', nama: 'Selesai' },
  { id: 'ditolak', nama: 'Ditolak' },
];
export const URUT_MASUKAN: { id: UrutMasukan; nama: string }[] = [
  { id: 'vote', nama: 'Terbanyak' },
  { id: 'baru', nama: 'Terbaru' },
];

export function labelKategori(k: KategoriMasukan): string {
  return KATEGORI_MASUKAN.find((x) => x.id === k)?.nama ?? k;
}

export function labelStatus(s: StatusMasukan): string {
  return STATUS_MASUKAN.find((x) => x.id === s)?.nama ?? s;
}

/** Rapikan & validasi isi sebelum kirim. Null = valid. */
export function validasiIsiMasukan(isi: string): string | null {
  const t = isi.trim();
  if (!t) return 'Tulis masukan dulu.';
  if ([...t].length > MAKS_ISI_MASUKAN) return `Maksimal ${MAKS_ISI_MASUKAN} karakter.`;
  return null;
}

/** Optimistic toggle lokal (untuk UI); server tetap sumber kebenaran. */
export function terapkanToggleVote(b: BarisMasukan, aktif: boolean): BarisMasukan {
  if (b.saya_vote === aktif) return b;
  return {
    ...b,
    saya_vote: aktif,
    jumlah_vote: Math.max(0, b.jumlah_vote + (aktif ? 1 : -1)),
  };
}

export function urutBarisMasukan(daftar: BarisMasukan[], urut: UrutMasukan): BarisMasukan[] {
  const salin = [...daftar];
  if (urut === 'baru') {
    salin.sort((a, b) => b.dibuat.localeCompare(a.dibuat) || b.id - a.id);
  } else {
    salin.sort((a, b) => b.jumlah_vote - a.jumlah_vote || b.dibuat.localeCompare(a.dibuat) || b.id - a.id);
  }
  return salin;
}

export async function ambilMasukan(urut: UrutMasukan = 'vote'): Promise<BarisMasukan[]> {
  const { data, error } = await supabase().rpc('daftar_masukan', { p_urut: urut });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    user_id: String(r.user_id),
    username: String(r.username),
    isi: String(r.isi),
    kategori: r.kategori as KategoriMasukan,
    status: r.status as StatusMasukan,
    dibuat: String(r.dibuat),
    jumlah_vote: Number(r.jumlah_vote ?? 0),
    saya_vote: !!r.saya_vote,
  }));
}

export async function kirimMasukan(isi: string, kategori: KategoriMasukan): Promise<void> {
  const err = validasiIsiMasukan(isi);
  if (err) throw new Error(err);
  const { error } = await supabase().from('masukan').insert({ isi: isi.trim(), kategori });
  if (error) throw Object.assign(new Error(pesanMasukan(error)), { code: error.code });
}

/** true = sekarang vote, false = batal. */
export async function toggleVoteMasukan(id: number): Promise<boolean> {
  const { data, error } = await supabase().rpc('toggle_vote_masukan', { p_id: id });
  if (error) throw Object.assign(new Error(pesanMasukan(error)), { code: error.code });
  return !!data;
}

export function pesanMasukan(e: { code?: string; message?: string }): string {
  if (e.code === 'P0001' || /batas 5 masukan/i.test(e.message ?? '')) return 'Batas 5 masukan per hari. Coba lagi besok.';
  if (e.code === '22023') return 'Isi masukan 1-500 karakter.';
  if (e.code === '42501') return 'Harus masuk dulu.';
  if (e.code === 'P0002') return 'Masukan tidak ditemukan.';
  return 'Gagal memproses masukan. Periksa internet lalu coba lagi.';
}
