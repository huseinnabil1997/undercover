// Pemilihan jalur koneksi: "Langsung" (WebRTC P2P lewat PeerJS) atau "Lewat relay" (MQTT publik). Murni, tanpa jaringan.
import type { StatusJaringan } from './jaringan';

export type Jalur = 'langsung' | 'relay';

/** Pemain beralih ke relay jika koneksi langsung belum menghasilkan data dari host selama ini. */
export const BATAS_LANGSUNG_MS = 8000;
/** Host menganggap pemain di jalur relay putus jika diam selama ini (pemain ping tiap 3 detik). */
export const BATAS_SENYAP_RELAY_MS = 12000;
/** Pemain mengulang salam ke host lewat relay dengan jeda ini sampai mendapat jawaban. */
export const ULANG_HALO_RELAY_MS = 3000;

/** Galat PeerJS yang berarti jalur langsung tidak bisa dipakai saat ini (broker tidak terjangkau, WebRTC tidak ada, host tidak terdaftar). */
const GALAT_KE_RELAY = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible', 'peer-unavailable', 'webrtc']);

export interface KeadaanJalur {
  /** Lama mencoba jalur langsung tanpa menerima data dari host. */
  lamaMs: number;
  /** Tipe galat PeerJS terakhir, jika ada. */
  galat?: string;
  /** Sudah menerima view dari host lewat jalur langsung. */
  adaView: boolean;
  /** Mode uji: lewati jalur langsung. */
  paksaRelay?: boolean;
}

export function perluRelay(k: KeadaanJalur): boolean {
  if (k.paksaRelay) return true;
  if (k.adaView) return false;
  if (k.galat && GALAT_KE_RELAY.has(k.galat)) return true;
  return k.lamaMs >= BATAS_LANGSUNG_MS;
}

/** Status host gabungan: room dianggap terbuka jika salah satu jalur siap. Bentrok kode tetap dilaporkan. */
export function statusHostGabungan(langsung: StatusJaringan, brokerRelay: number): StatusJaringan {
  if (langsung === 'tersambung' || langsung === 'idDipakai') return langsung;
  return brokerRelay > 0 ? 'tersambung' : langsung;
}

export function teksJalur(j: Jalur): string {
  return j === 'relay' ? 'Lewat relay' : 'Langsung';
}

/** Flag uji/diagnosis: ?jalur=relay di URL atau localStorage online:jalur=relay memaksa jalur relay. */
export function paksaRelayDari(search: string, simpan: string | null): boolean {
  return new URLSearchParams(search).get('jalur') === 'relay' || simpan === 'relay';
}
