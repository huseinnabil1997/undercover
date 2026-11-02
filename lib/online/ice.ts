// Konfigurasi ICE dan aturan batas waktu negosiasi WebRTC. Murni, tanpa PeerJS, agar bisa diuji.

/**
 * Server STUN publik gratis tanpa login. Sengaja TANPA TURN: relay bawaan PeerJS (eu-0/us-0.turn.peerjs.com)
 * sudah tidak punya catatan DNS, sehingga hanya menambah kandidat gagal dan tidak pernah memberi relay.
 * Akibatnya dua HP di balik NAT simetris/CGNAT yang sama-sama ketat tetap bisa gagal tersambung.
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** Jika koneksi belum terbuka setelah ini dan ICE belum bergerak, buat koneksi baru. */
export const TUNGGU_AWAL_MS = 12000;
/** Batas keras untuk negosiasi yang masih berjalan (checking/connected) sebelum dibuat ulang. */
export const TUNGGU_NEGOSIASI_MAKS_MS = 45000;
/** Jeda antar pemeriksaan selama menunggu negosiasi yang masih berjalan. */
export const CEK_NEGOSIASI_MS = 3000;

export type StatusIce = RTCIceConnectionState | undefined;

/**
 * Apa yang dilakukan pada koneksi data yang belum terbuka.
 * - 'tunggu': ICE masih bekerja (checking/connected/completed), jangan diputus.
 * - 'ulang': gagal/ditutup, atau tidak ada kemajuan sama sekali setelah TUNGGU_AWAL_MS, atau sudah melewati batas keras.
 */
export function nasibNegosiasi(ice: StatusIce, lamaMs: number): 'tunggu' | 'ulang' {
  if (ice === 'failed' || ice === 'closed') return 'ulang';
  if (lamaMs >= TUNGGU_NEGOSIASI_MAKS_MS) return 'ulang';
  if (ice === 'checking' || ice === 'connected' || ice === 'completed') return 'tunggu';
  return lamaMs >= TUNGGU_AWAL_MS ? 'ulang' : 'tunggu';
}
