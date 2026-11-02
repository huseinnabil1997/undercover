// Pengaman "loading tanpa ujung": jika belum tersambung dalam BATAS_MENYAMBUNG_MS, UI berhenti menampilkan
// pemutar saja dan memberi alasan yang jelas plus tombol Coba lagi / Keluar dari room. Murni, tanpa PeerJS.
import type { StatusJaringan } from './jaringan';

export const BATAS_MENYAMBUNG_MS = 15000;

/** Sudah terlalu lama belum tersambung. `sejak` = saat terakhir status berubah dari/ke tersambung (atau percobaan baru). */
export function sudahMacet(status: StatusJaringan, sejak: number, sekarang: number): boolean {
  return status !== 'tersambung' && sejak > 0 && sekarang - sejak >= BATAS_MENYAMBUNG_MS;
}

const PESAN_INTERNET = 'Server penghubung belum bisa dijangkau. Periksa koneksi internet lalu coba lagi.';
const PESAN_P2P = 'Belum bisa tersambung ke HP host. Jaringan ini mungkin memblokir koneksi antar HP. Coba data seluler atau Wi-Fi lain, atau minta host membuka ulang room.';
const PESAN_RELAY = 'Host belum menjawab, termasuk lewat jalur relay. Pastikan HP host masih membuka room ini (layar menyala) dan kodenya benar.';
const PESAN_RELAY_PUTUS = 'Server relay belum bisa dijangkau. Periksa koneksi internet lalu coba lagi.';

/** Pesan yang ditampilkan saat macet, sesuai status jaringan terakhir. */
export function pesanMacet(host: boolean, kode: string, status: StatusJaringan, info?: string): string {
  if (status === 'gagal') return info || 'Koneksi gagal. Coba lagi.';
  if (host) {
    if (status === 'idDipakai') {
      return `Kode room ${kode} masih dipakai sesi lain, misalnya tab lain yang membuka room ini. Tutup tab itu lalu coba lagi, atau keluar dan buat room baru.`;
    }
    return `Room ${kode} belum bisa dibuka. ${PESAN_INTERNET}`;
  }
  if (info === 'relay-putus') return PESAN_RELAY_PUTUS;
  if (info === 'relay') return `Room ${kode}: ${PESAN_RELAY}`;
  if (status === 'hostTidakAda') {
    return `Room ${kode} tidak ditemukan. Mungkin host sudah menutup room, HP host terkunci, atau kodenya salah.`;
  }
  if (info === 'timeout' || info === 'senyap') return PESAN_P2P;
  if (info === 'network' || info === 'server-error' || info === 'socket-error' || info === 'socket-closed') return PESAN_INTERNET;
  return `${PESAN_INTERNET} Jika internet lancar, ${PESAN_P2P.charAt(0).toLowerCase()}${PESAN_P2P.slice(1)}`;
}
