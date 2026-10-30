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
const PREFIX_AKTIF = 'undercover:online:aktif:';
/** Tab yang masih memakai sesi memperbarui tanda aktif setiap DETAK_AKTIF_MS. */
export const DETAK_AKTIF_MS = 2000;
export const BATAS_AKTIF_MS = 6000;
/** Id halaman ini. Dibuat per muat halaman, jadi tidak ikut tersalin saat tab diduplikasi. */
export const ID_HALAMAN = Math.random().toString(36).slice(2, 12);
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

/** `hanyaTab`: hapus sesi tab ini saja; salinan perangkat dibiarkan (mungkin milik tab lain yang masih aktif). */
export function hapusSesi(hanyaTab = false): void {
  aman(() => {
    window.sessionStorage.removeItem(KUNCI_SESI);
    if (!hanyaTab) window.localStorage.removeItem(KUNCI_SESI);
  }, undefined);
}

/** Tanda bahwa halaman ini sedang memakai sesi pemain `id`. */
export function tandaiAktif(id: string, now = Date.now()): void {
  aman(() => window.localStorage.setItem(PREFIX_AKTIF + id, JSON.stringify({ halaman: ID_HALAMAN, waktu: now })), undefined);
}

export function lepasAktif(id: string): void {
  aman(() => {
    const raw = window.localStorage.getItem(PREFIX_AKTIF + id);
    if (raw && JSON.parse(raw)?.halaman === ID_HALAMAN) window.localStorage.removeItem(PREFIX_AKTIF + id);
  }, undefined);
}

/** Murni: apakah tanda aktif `raw` menunjukkan sesi masih dipakai halaman lain. */
export function aktifDiHalamanLain(raw: unknown, halaman: string, now: number): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const t = raw as { halaman?: unknown; waktu?: unknown };
  return typeof t.halaman === 'string' && t.halaman !== halaman && typeof t.waktu === 'number' && now - t.waktu < BATAS_AKTIF_MS;
}

export function sesiDipakaiHalamanLain(id: string, now = Date.now()): boolean {
  return aman(() => {
    const raw = window.localStorage.getItem(PREFIX_AKTIF + id);
    return aktifDiHalamanLain(raw ? JSON.parse(raw) : null, ID_HALAMAN, now);
  }, false);
}

/**
 * Tombol "Lanjut" hanya untuk kembali ke sesi yang tidak sedang terbuka di tab lain, dan hanya untuk room
 * yang sama dengan link undangan (jika ada). Tanpa ini tab kedua bisa memakai id pemain yang sama.
 */
export function bolehTawarkanLanjut(lanjut: SesiOnline | null, kodeAwal: string | null, dipakaiLain: boolean): boolean {
  if (!lanjut || dipakaiLain) return false;
  return !kodeAwal || kodeAwal === lanjut.kode;
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
