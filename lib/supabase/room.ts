// RPC room online (Tahap 3). Semua tabel room hanya bisa diakses lewat fungsi ini (lihat migrasi room_realtime).
import { bukaSandi, dariBase64, hexTopik, keBase64, sandikan, turunkanKunciRoom, type KunciRoom } from '../online/relay';
import type { StateHost } from '../online/types';
import { barisRiwayat, type HasilUntukDicatat } from './data';
import { supabase } from './klien';

export interface RoomSupabase {
  kunci: KunciRoom;
  hex: string;
}

const cache = new Map<string, Promise<RoomSupabase>>();

export function roomSupabase(kode: string): Promise<RoomSupabase> {
  let p = cache.get(kode);
  if (!p) {
    p = turunkanKunciRoom(kode).then((kunci) => ({ kunci, hex: hexTopik(kunci.topik) as string }));
    p.catch(() => cache.delete(kode));
    cache.set(kode, p);
  }
  return p;
}

async function rpc<T>(nama: string, arg: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(nama, arg);
  if (error) throw error;
  return data as T;
}

/** 'ok' bila kita host room ini, 'dipakai' bila host lain masih aktif. */
export const buatRoom = (hex: string) => rpc<'ok' | 'dipakai'>('buat_room', { p_topik: hex });
/** Nonce identitas sekali pakai, atau null bila room tidak ada. */
export const gabungRoom = (hex: string) => rpc<string | null>('gabung_room', { p_topik: hex });

export async function verifikasiPemain(hex: string, nonce: string): Promise<{ uid: string; username: string } | null> {
  const rows = await rpc<{ user_id: string; username: string }[]>('verifikasi_pemain', { p_topik: hex, p_nonce: nonce });
  const r = rows?.[0];
  return r ? { uid: r.user_id, username: r.username } : null;
}

/** Snapshot state host terenkripsi kunci room (server hanya menyimpan ciphertext). */
export async function sandikanSnapshot(r: RoomSupabase, s: StateHost): Promise<string> {
  return keBase64(await sandikan(r.kunci.kunci, s));
}

export async function bukaSnapshot(r: RoomSupabase, t: string): Promise<unknown> {
  const b = dariBase64(t);
  return b ? bukaSandi(r.kunci.kunci, b) : null;
}

export interface MetaDetakPublik {
  host: string;
  jumlah: number;
  status: 'lobby' | 'main';
  sumber: string;
  kategori: string;
}

/** false: kita bukan host lagi (host sudah dipindah ke pemain lain). */
export const detakHost = (
  hex: string,
  snapshot: string | null,
  opsi?: { publik: boolean; kode: string; meta: MetaDetakPublik },
) => rpc<boolean>('detak_host', {
  p_topik: hex,
  p_snapshot: snapshot,
  ...(opsi
    ? {
        p_publik: opsi.publik,
        p_kode: opsi.publik ? opsi.kode : null,
        p_meta: opsi.publik ? opsi.meta : null,
      }
    : {}),
});

export interface BarisRoomPublikRpc {
  kode: string;
  host: string;
  jumlah: number;
  status: string;
  sumber: string;
  kategori: string;
}

/** Daftar room publik aktif (meta aman saja; butuh login). */
export const daftarRoomPublik = () => rpc<BarisRoomPublikRpc[]>('daftar_room_publik', {});
export const tinggalkanRoom = (hex: string, snapshot: string | null) => rpc<null>('tinggalkan_room', { p_topik: hex, p_snapshot: snapshot });

/** Pemain biasa keluar: lepas kursi di server. Room dihapus bila ia anggota terakhir dan host sudah pergi. */
export const lepasKursiRoom = (hex: string) => tinggalkanRoom(hex, null);

export async function ambilAlihHost(hex: string): Promise<{ snapshot: string; hostKeluar: boolean } | null> {
  const rows = await rpc<{ snapshot: string; host_keluar: boolean }[]>('ambil_alih_host', { p_topik: hex });
  const r = rows?.[0];
  return r?.snapshot ? { snapshot: r.snapshot, hostKeluar: r.host_keluar } : null;
}

/** Baris hasil untuk semua peserta terverifikasi (uid diketahui host). Kosong bila belum selesai atau tidak lengkap. */
export function barisHasilRoom(s: StateHost): { idMain: string; baris: Record<string, unknown>[] } | null {
  const g = s.game;
  if (!g || g.fase !== 'hasil' || !g.pemenang || !g.idMain) return null;
  const baris: Record<string, unknown>[] = [];
  for (const id of g.peserta) {
    const uid = s.pemain.find((p) => p.id === id)?.uid;
    if (!uid) continue;
    const adalahLovers = !!(g.lovers && (g.lovers[0] === id || g.lovers[1] === id));
    const h: HasilUntukDicatat = {
      idMain: g.idMain, peran: g.peran[id], pemenang: g.pemenang, pasangan: g.pasangan, jumlahPemain: g.peserta.length,
      adalahLovers, loversMenang: !!g.loversMenang && adalahLovers,
    };
    const b = barisRiwayat(h);
    baris.push({
      user_id: uid, peran: b.peran, menang: b.menang, pemenang: b.pemenang,
      kata_civilian: b.kata_civilian, kata_undercover: b.kata_undercover,
      adalah_lovers: b.adalah_lovers, lovers_menang: b.lovers_menang,
    });
  }
  return baris.length >= 3 ? { idMain: g.idMain, baris } : null;
}

export const PESAN_ROOM_TAK_TERDAFTAR = 'Room ini tidak terdaftar di server, jadi hasil permainan tidak akan masuk riwayat. Tutup room lama yang tidak dipakai lalu buat room baru.';
export const PESAN_GAGAL_CATAT = 'Hasil gagal dicatat ke riwayat. Mencoba lagi otomatis.';

/** Galat dari server (bukan jaringan putus) saat host mendaftarkan room: hasil tidak bisa dicatat. */
export function galatDitolakServer(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const kode = (e as { code?: unknown }).code;
  return typeof kode === 'string' && kode.length > 0;
}

export const catatHasilRoom = (hex: string, idMain: string, baris: Record<string, unknown>[]) =>
  rpc<number>('catat_hasil_room', { p_topik: hex, p_id_main: idMain, p_baris: baris });

/** Pemain memeriksa apakah host sudah mencatat hasilnya. */
export async function hasilTercatat(idMain: string, uid: string): Promise<boolean> {
  const { data, error } = await supabase().from('riwayat_main').select('id').eq('id_main', idMain).eq('user_id', uid).maybeSingle();
  if (error) throw error;
  return !!data;
}
