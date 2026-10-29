// Kode room dan peer id host. Murni, tanpa PeerJS.
import type { Rng } from '../game';

/** Huruf dan angka tanpa karakter yang mudah tertukar (0/O, 1/I/L). */
export const ALFABET_KODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PANJANG_KODE = 5;
export const PREFIX_PEER = 'undercover-hn-';

export function buatKodeRoom(rng: Rng = Math.random, panjang = PANJANG_KODE): string {
  let s = '';
  for (let i = 0; i < panjang; i++) s += ALFABET_KODE[Math.min(ALFABET_KODE.length - 1, Math.floor(rng() * ALFABET_KODE.length))];
  return s;
}

/** Rapikan input pengguna: huruf besar, buang spasi/tanda. Huruf mirip dipetakan (O ke 0 tidak ada, jadi O tetap ditolak). */
export function rapikanKode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function kodeValid(kode: string): boolean {
  if (kode.length < 4 || kode.length > 6) return false;
  for (const c of kode) if (!ALFABET_KODE.includes(c)) return false;
  return true;
}

export function peerIdHost(kode: string): string {
  return PREFIX_PEER + kode;
}

/** Ambil kode room dari query string (?room=KODE). */
export function kodeDariUrl(search: string): string | null {
  const k = rapikanKode(new URLSearchParams(search).get('room') ?? '');
  return kodeValid(k) ? k : null;
}

export function buatIdPemain(rng: Rng = Math.random): string {
  let s = 'p';
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 12; i++) s += abc[Math.min(abc.length - 1, Math.floor(rng() * abc.length))];
  return s;
}
