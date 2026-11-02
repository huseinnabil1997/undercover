// Peristiwa game yang diberi suara, getar, atau notifikasi. Murni (tanpa DOM), jadi bisa diuji.
import type { ViewPemain } from '@/lib/online/types';

export type Peristiwa =
  /** Pemain baru masuk room (lobby). */
  | 'gabung'
  /** Game dimulai, kata dibagikan. */
  | 'mulai'
  /** Giliranmu memberi petunjuk (online). Peristiwa utama: suara jelas, getar, dan notifikasi. */
  | 'giliranmu'
  /** Kamu Mr. White yang tereliminasi dan harus menebak. Juga diberi notifikasi. */
  | 'tebakMrWhite'
  /** Voting dimulai (atau vote ulang). */
  | 'vote'
  /** Ada pemain tereliminasi. */
  | 'eliminasi'
  /** Vote selesai tanpa eliminasi. */
  | 'aman'
  | 'menang'
  | 'kalah'
  /** Pesan chat baru dari pemain lain. */
  | 'chat'
  /** Mode lokal: oper HP ke pemain berikutnya. */
  | 'oper'
  /** Mode lokal: kartu kata dibuka. */
  | 'buka'
  /** Mode lokal: giliran pemain berikutnya memberi petunjuk. */
  | 'giliranLokal';

/** Hanya peristiwa yang khusus untuk pemain ini yang memunculkan notifikasi HP. */
export const PERISTIWA_NOTIFIKASI: readonly Peristiwa[] = ['giliranmu', 'tebakMrWhite'];

export function perluNotifikasi(p: Peristiwa): boolean {
  return PERISTIWA_NOTIFIKASI.includes(p);
}

/** Pola getar (ms) per peristiwa. Getar panjang hanya untuk giliran; sisanya singkat atau tanpa getar. */
export const POLA_GETAR: Partial<Record<Peristiwa, number[]>> = {
  giliranmu: [180, 90, 180, 90, 320],
  tebakMrWhite: [180, 90, 180, 90, 320],
  giliranLokal: [120, 70, 200],
  mulai: [60],
  vote: [40],
  eliminasi: [90],
  menang: [60, 60, 120],
  kalah: [200],
};

export const TEKS_NOTIFIKASI: Partial<Record<Peristiwa, { judul: string; isi: string }>> = {
  giliranmu: { judul: 'Giliranmu!', isi: 'Beri satu petunjuk tanpa menyebut katamu.' },
  tebakMrWhite: { judul: 'Giliranmu menebak', isi: 'Kamu Mr. White. Tebak kata Civilian.' },
};

/** Kunci unik momen giliran, agar notifikasi untuk giliran yang sama tidak muncul dua kali. */
export function kunciGiliran(v: ViewPemain | null): string | null {
  const g = v?.game;
  if (!v || !g || !g.ikut) return null;
  if (g.fase === 'diskusi' && g.hidup && g.giliran < g.urutan.length && g.urutan[g.giliran] === v.saya) return `giliran-${g.ronde}-${g.giliran}`;
  if (g.fase === 'terungkap' && g.tebakan === 'menunggu' && g.tereliminasi === v.saya) return `tebak-${g.ronde}`;
  return null;
}

/** Bandingkan view lama dan baru, kembalikan peristiwa yang terjadi untuk pemain ini. */
export function peristiwaOnline(lama: ViewPemain | null, baru: ViewPemain): Peristiwa[] {
  const hasil: Peristiwa[] = [];
  const a = lama?.game ?? null;
  const b = baru.game;
  // Peristiwa pertama setelah menyambung (view awal) tidak dibunyikan, kecuali giliranmu.
  if (!lama) {
    const k = kunciGiliran(baru);
    if (k) hasil.push(k.startsWith('tebak') ? 'tebakMrWhite' : 'giliranmu');
    return hasil;
  }
  if (!b) {
    if (!a && baru.pemain.length > lama.pemain.length) hasil.push('gabung');
    return hasil;
  }
  const gameBaru = !a || (a.fase === 'hasil' && b.fase !== 'hasil') || b.ronde < a.ronde;
  if (gameBaru && b.fase === 'kata') hasil.push('mulai');
  if (b.fase === 'vote' && (a?.fase !== 'vote' || a.putaranVote !== b.putaranVote)) hasil.push('vote');
  if (b.fase === 'terungkap' && a?.fase !== 'terungkap') hasil.push(b.tereliminasi ? 'eliminasi' : 'aman');
  if (b.fase === 'hasil' && a?.fase !== 'hasil' && b.hasil) {
    hasil.push(menangkah(baru) ? 'menang' : 'kalah');
  }
  const kA = kunciGiliran(lama);
  const kB = kunciGiliran(baru);
  if (kB && kB !== kA) hasil.push(kB.startsWith('tebak') ? 'tebakMrWhite' : 'giliranmu');
  return hasil;
}

/** Apakah pemain ini ada di tim pemenang. Penonton (tidak ikut) dianggap tidak menang. */
export function menangkah(v: ViewPemain): boolean {
  const g = v.game;
  const p = v.pemain.find((x) => x.id === v.saya);
  if (!g?.hasil || !g.ikut || !p?.peran) return false;
  const w = g.hasil.pemenang;
  if (w === 'civilian') return p.peran === 'civilian';
  if (w === 'mrwhite') return p.peran === 'mrwhite';
  return p.peran !== 'civilian';
}

const PRIORITAS: readonly Peristiwa[] = ['giliranmu', 'tebakMrWhite', 'menang', 'kalah', 'eliminasi', 'aman', 'vote', 'mulai', 'gabung'];

/** Dari beberapa peristiwa sekaligus, bunyikan satu saja yang paling penting agar tidak bertumpuk. */
export function pilihUtama(daftar: Peristiwa[]): Peristiwa | null {
  if (daftar.length === 0) return null;
  return [...daftar].sort((a, b) => urut(a) - urut(b))[0];
}

function urut(p: Peristiwa): number {
  const i = PRIORITAS.indexOf(p);
  return i < 0 ? PRIORITAS.length : i;
}

/** Bentuk ringkas fase mode lokal (satu HP), cukup untuk menentukan isyarat suaranya. */
export type FaseLokal =
  | { jenis: 'serah'; idx: number; terbuka: boolean }
  | { jenis: 'diskusi'; ronde: number; giliran: number }
  | { jenis: 'vote'; ronde: number }
  | { jenis: 'terungkap'; ronde: number; idx: number }
  | { jenis: 'aman'; ronde: number }
  | { jenis: 'hasil' };

/**
 * Isyarat mode lokal. `kunci` berubah tepat sekali per momen, jadi isyarat tidak berulang saat render ulang.
 * Pergantian giliran memberi petunjuk memakai isyarat yang jelas (giliranLokal) karena HP dioper.
 */
export function peristiwaLokal(f: FaseLokal): { kunci: string; p: Peristiwa } {
  switch (f.jenis) {
    case 'serah':
      if (f.terbuka) return { kunci: `buka-${f.idx}`, p: 'buka' };
      return { kunci: `serah-${f.idx}`, p: f.idx === 0 ? 'mulai' : 'oper' };
    case 'diskusi':
      return { kunci: `giliran-${f.ronde}-${f.giliran}`, p: 'giliranLokal' };
    case 'vote':
      return { kunci: `vote-${f.ronde}`, p: 'vote' };
    case 'terungkap':
      return { kunci: `terungkap-${f.ronde}-${f.idx}`, p: 'eliminasi' };
    case 'aman':
      return { kunci: `aman-${f.ronde}`, p: 'aman' };
    case 'hasil':
      return { kunci: 'hasil', p: 'menang' };
  }
}
