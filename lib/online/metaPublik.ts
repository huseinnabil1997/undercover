// Meta aman untuk daftar room publik (bukan kata/peran).
import { labelKategoriLobby } from '../labelKategori';
import type { Pengaturan, StateHost } from './types';

export type StatusRoomPublik = 'lobby' | 'main';

export interface MetaRoomPublik {
  host: string;
  jumlah: number;
  status: StatusRoomPublik;
  sumber: string;
  kategori: string;
}

export interface BarisRoomPublik {
  kode: string;
  host: string;
  jumlah: number;
  status: StatusRoomPublik;
  sumber: string;
  kategori: string;
}

/** Label sumber untuk daftar (bukan pasangan kata). */
export function labelSumberPublik(p: Pengaturan): string {
  if (p.sumberCampur) return 'Campur';
  if (p.sumberKata === 'kamus') return 'Kamus kita';
  if (p.sumberKata === 'internet') return 'Internet';
  return '';
}

/** Status daftar: Sedang main selama game aktif (bukan hasil/lobby). */
export function statusRoomPublik(st: StateHost): StatusRoomPublik {
  const g = st.game;
  if (g && g.fase !== 'hasil') return 'main';
  return 'lobby';
}

export function metaRoomPublik(st: StateHost, usernameHost: string): MetaRoomPublik {
  const jumlah = st.pemain.filter((p) => p.online).length;
  return {
    host: usernameHost.slice(0, 20),
    jumlah,
    status: statusRoomPublik(st),
    sumber: labelSumberPublik(st.pengaturan),
    kategori: labelKategoriLobby(st.pengaturan).slice(0, 80),
  };
}

/** Room match selalu publik; room buat sendiri mengikuti pengaturan (bawaan privat). */
export function publikDariPengaturan(p: Pengaturan, match?: number): boolean {
  if (match) return true;
  return p.publik === true;
}
