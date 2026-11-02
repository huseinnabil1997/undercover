// Pemilihan jalur koneksi: "Langsung" (WebRTC P2P lewat PeerJS) atau "Lewat relay" (Metered + MQTT publik).
// Murni, tanpa jaringan.
import type { StatusJaringan } from './jaringan';
import type { ModeRelay, RingkasanRelay } from './relay';

export type Jalur = 'langsung' | 'relay';

/** Pemain beralih ke relay jika koneksi langsung belum menghasilkan data dari host selama ini. */
export const BATAS_LANGSUNG_MS = 7000;
/**
 * Di jalur relay pemain ping tiap 10 detik (bukan 3 detik seperti jalur langsung), karena setiap pesan lewat
 * Metered memakai kuota bulanan. Host membalas pong hanya bila belum mengirim apa pun ke pemain itu belakangan ini.
 */
export const INTERVAL_PING_RELAY_MS = 10000;
/** Pemain di jalur relay menganggap host hilang jika diam selama ini (2,5 kali interval ping). */
export const BATAS_SENYAP_HOST_RELAY_MS = 25000;
/** Host menganggap pemain di jalur relay putus jika diam selama ini. */
export const BATAS_SENYAP_RELAY_MS = 30000;
/** Pemain mengulang salam ke host lewat relay dengan jeda ini sampai mendapat jawaban... */
export const ULANG_HALO_RELAY_MS = 3000;
/** ...lalu lebih jarang setelah lama belum dijawab (hemat kuota). */
export const ULANG_HALO_RELAY_LAMBAT_MS = 10000;
export const BATAS_HALO_CEPAT_MS = 30000;
/** Host tidak membalas ping relay jika sudah mengirim pesan lain ke pemain itu dalam jangka ini. */
export const JEDA_PONG_RELAY_MS = 5000;
/** Tunggu welcome Metered (berisi TURN bila aktif) paling lama ini sebelum membuat koneksi WebRTC. */
export const TUNGGU_TURN_MS = 2500;

export function jedaHaloRelay(lamaRelayMs: number): number {
  return lamaRelayMs < BATAS_HALO_CEPAT_MS ? ULANG_HALO_RELAY_MS : ULANG_HALO_RELAY_LAMBAT_MS;
}

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

const NILAI_PAKSA = new Set(['relay', 'metered', 'mqtt']);

function nilaiJalur(search: string, simpan: string | null): string {
  return new URLSearchParams(search).get('jalur') ?? simpan ?? '';
}

/**
 * Flag uji/diagnosis: ?jalur=relay di URL (diingat di sessionStorage untuk tab itu) atau localStorage online:jalur=relay memaksa jalur relay.
 * ?jalur=metered atau ?jalur=mqtt memaksa relay hanya lewat satu jenis jalur itu.
 */
export function paksaRelayDari(search: string, simpan: string | null): boolean {
  return NILAI_PAKSA.has(nilaiJalur(search, simpan));
}

export function modeRelayDari(search: string, simpan: string | null): ModeRelay {
  const v = nilaiJalur(search, simpan);
  return v === 'metered' || v === 'mqtt' ? v : 'semua';
}

/** Rekam jejak percobaan jalur untuk layar "Coba lagi". */
export interface Diagnosa {
  /** Keadaan jalur langsung, mis. "gagal (peer-unavailable)". */
  langsung: string;
  /** null = belum tahu (welcome Metered belum datang). */
  turn: boolean | null;
  relay: RingkasanRelay | null;
  /** Hanya untuk pemain: apakah host sudah menjawab. */
  host?: string;
}

function teksMasuk(n: number | undefined): string {
  return `${n ?? 0} pesan masuk`;
}

/** Baris diagnosa singkat (Bahasa Indonesia) untuk ditampilkan di layar "Coba lagi". */
export function teksDiagnosa(d: Diagnosa): string[] {
  const r = d.relay;
  const masukMqtt = r ? Object.entries(r.masuk).filter(([k]) => k !== 'Metered').reduce((a, [, n]) => a + n, 0) : 0;
  const baris = [`Langsung: ${d.langsung}`];
  if (!r) {
    baris.push('Metered: belum dimulai', 'MQTT: belum dimulai');
  } else {
    baris.push(r.metered === null ? 'Metered: tidak dipakai' : `Metered: ${r.metered}, ${teksMasuk(r.masuk.Metered)}`);
    baris.push(r.mqttTotal === 0 ? 'MQTT: tidak dipakai' : `MQTT: ${r.mqttSiap}/${r.mqttTotal} broker, ${teksMasuk(masukMqtt)}`);
  }
  baris.push(`TURN: ${d.turn === null ? 'belum diketahui' : d.turn ? 'ada' : 'tidak ada'}`);
  if (d.host) baris.push(`Host: ${d.host}`);
  return baris;
}
