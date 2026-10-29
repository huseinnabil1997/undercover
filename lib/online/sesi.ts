// Sesi online di perangkat ini. sessionStorage (khusus tab, bertahan saat refresh) dipakai untuk
// gabung ulang otomatis; salinan di localStorage dipakai untuk tombol "Lanjutkan room".
import type { StateHost } from './types';
import { kodeValid } from './room';

export interface SesiOnline {
  kode: string;
  id: string;
  token: string;
  nama: string;
  host: boolean;
  waktu: number;
}

const KUNCI_SESI = 'undercover:online:sesi';
const KUNCI_HOST = 'undercover:online:host';
/** Sesi yang lebih tua dari ini tidak ditawarkan lagi. */
export const UMUR_SESI_MS = 6 * 60 * 60 * 1000;

function aman<T>(f: () => T, cadangan: T): T {
  try {
    return f();
  } catch {
    return cadangan;
  }
}

function valid(x: unknown, now: number): x is SesiOnline {
  if (!x || typeof x !== 'object') return false;
  const s = x as SesiOnline;
  return typeof s.kode === 'string' && kodeValid(s.kode) && typeof s.id === 'string' && typeof s.token === 'string'
    && typeof s.nama === 'string' && typeof s.host === 'boolean' && typeof s.waktu === 'number' && now - s.waktu < UMUR_SESI_MS;
}

export function bacaSesi(tempat: 'tab' | 'perangkat', now = Date.now()): SesiOnline | null {
  return aman(() => {
    const st = tempat === 'tab' ? window.sessionStorage : window.localStorage;
    const raw = st.getItem(KUNCI_SESI);
    const x = raw ? JSON.parse(raw) : null;
    return valid(x, now) ? x : null;
  }, null);
}

export function simpanSesi(s: SesiOnline): void {
  aman(() => {
    const raw = JSON.stringify(s);
    window.sessionStorage.setItem(KUNCI_SESI, raw);
    window.localStorage.setItem(KUNCI_SESI, raw);
  }, undefined);
}

export function hapusSesi(): void {
  aman(() => {
    window.sessionStorage.removeItem(KUNCI_SESI);
    window.localStorage.removeItem(KUNCI_SESI);
  }, undefined);
}

export function simpanStateHost(s: StateHost): void {
  aman(() => window.localStorage.setItem(KUNCI_HOST, JSON.stringify(s)), undefined);
}

export function bacaStateHostMentah(): unknown {
  return aman(() => {
    const raw = window.localStorage.getItem(KUNCI_HOST);
    return raw ? JSON.parse(raw) : null;
  }, null);
}

export function hapusStateHost(): void {
  aman(() => window.localStorage.removeItem(KUNCI_HOST), undefined);
}

export function buatToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
