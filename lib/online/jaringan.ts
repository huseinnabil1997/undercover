// Lapisan jaringan WebRTC (PeerJS) untuk mode online. Hanya berjalan di browser.
// Topologi bintang: setiap pemain tersambung langsung ke HP host. Broker publik 0.peerjs.com
// hanya dipakai untuk saling menemukan (signaling); isi permainan lewat koneksi P2P.
import type { DataConnection, Peer as PeerT, PeerOptions } from 'peerjs';
import { buatStateChat, gabungChat, terimaChat, type PesanChat } from './chat';
import { rapikanAksiPemain, reduceHost, viewUntuk } from './host';
import { peerIdHost } from './room';
import {
  INTERVAL_PING_MS, VERSI_PROTOKOL,
  type Aksi, type AksiPemain, type PesanKeHost, type PesanKeKlien, type StateHost, type ViewPemain,
} from './types';

/** Hanya STUN Google (gratis). Tanpa TURN, sebagian jaringan (NAT simetris, kantor, operator seluler tertentu) bisa gagal tersambung. */
export const OPSI_PEER: PeerOptions = {
  debug: 0,
  config: {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
  },
};

/** Klien menganggap host hilang jika tidak ada pesan selama ini, lalu menyambung ulang. */
export const BATAS_SENYAP_HOST_MS = 8000;
const JEDA_ULANG_MS = 2500;

export type StatusJaringan = 'menyambung' | 'tersambung' | 'menyambungUlang' | 'hostTidakAda' | 'idDipakai' | 'gagal';

async function buatPeer(id?: string): Promise<PeerT> {
  const { Peer } = await import('peerjs');
  return id ? new Peer(id, OPSI_PEER) : new Peer(OPSI_PEER);
}

/* ---------------------------------- Host ---------------------------------- */

export interface PendengarHost {
  onState: (s: StateHost) => void;
  onStatus: (s: StatusJaringan, info?: string) => void;
  onTolak?: (alasan: string) => void;
  /** Daftar chat terbaru (maks 50) setiap ada pesan baru. */
  onChat?: (pesan: PesanChat[]) => void;
}

export class HostRoom {
  private peer: PeerT | null = null;
  private koneksi = new Map<string, DataConnection>();
  private pemilikKoneksi = new Map<DataConnection, string>();
  private terkirim = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private selesai = false;
  private percobaan = 0;
  /** Chat hanya di memori: hilang saat room ditutup atau HP host refresh. */
  private chat = buatStateChat();

  constructor(public state: StateHost, private dengar: PendengarHost) {}

  async mulai(): Promise<void> {
    this.dengar.onStatus('menyambung');
    this.dengar.onState(this.state);
    this.dengar.onChat?.(this.chat.pesan);
    this.timer = setInterval(() => this.dispatch({ jenis: 'tick' }), 2000);
    await this.sambung();
  }

  private async sambung(): Promise<void> {
    if (this.selesai) return;
    const peer = await buatPeer(peerIdHost(this.state.kode));
    if (this.selesai) {
      peer.destroy();
      return;
    }
    this.peer = peer;
    peer.on('open', () => {
      this.percobaan = 0;
      this.dengar.onStatus('tersambung');
    });
    peer.on('connection', (conn) => this.terimaKoneksi(conn));
    peer.on('disconnected', () => {
      if (this.selesai || peer.destroyed) return;
      this.dengar.onStatus('menyambungUlang');
      setTimeout(() => !this.selesai && !peer.destroyed && peer.reconnect(), 1000);
    });
    peer.on('error', (err) => {
      if (this.selesai) return;
      if (err.type === 'unavailable-id') {
        // Biasanya id lama (sebelum refresh) belum dilepas broker. Coba klaim lagi sebentar lagi.
        peer.destroy();
        this.percobaan++;
        this.dengar.onStatus('idDipakai', String(this.percobaan));
        setTimeout(() => void this.sambung(), Math.min(10000, 2000 + this.percobaan * 1000));
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
        this.dengar.onStatus('menyambungUlang', err.type);
        if (peer.disconnected && !peer.destroyed) setTimeout(() => !this.selesai && !peer.destroyed && peer.reconnect(), JEDA_ULANG_MS);
      } else if (err.type === 'browser-incompatible') {
        this.dengar.onStatus('gagal', 'Browser ini tidak mendukung WebRTC.');
      }
    });
  }

  private terimaKoneksi(conn: DataConnection): void {
    conn.on('data', (data) => this.terimaPesan(conn, data as PesanKeHost));
    const tutup = () => {
      const id = this.pemilikKoneksi.get(conn);
      this.pemilikKoneksi.delete(conn);
      if (id && this.koneksi.get(id) === conn) {
        this.koneksi.delete(id);
        this.terkirim.delete(id);
        this.dispatch({ jenis: 'putus', id });
      }
    };
    conn.on('close', tutup);
    conn.on('error', tutup);
  }

  private kirim(conn: DataConnection, pesan: PesanKeKlien): void {
    try {
      if (conn.open) void conn.send(pesan);
    } catch {
      // Koneksi sedang putus; akan dikirim ulang saat tersambung lagi.
    }
  }

  private terimaPesan(conn: DataConnection, pesan: PesanKeHost): void {
    if (!pesan || typeof pesan !== 'object') return;
    if (pesan.t === 'halo') {
      if (pesan.v !== VERSI_PROTOKOL) {
        this.kirim(conn, { t: 'tolak', alasan: 'Versi aplikasi berbeda. Muat ulang halaman.' });
        return;
      }
      if (typeof pesan.id !== 'string' || pesan.id === this.state.hostId) return;
      const r = reduceHost(this.state, { jenis: 'gabung', id: pesan.id, nama: String(pesan.nama ?? ''), token: String(pesan.token ?? '') }, { now: Date.now() });
      if (r.tolak) {
        this.kirim(conn, { t: 'tolak', alasan: r.tolak });
        setTimeout(() => conn.close(), 500);
        return;
      }
      const lama = this.koneksi.get(pesan.id);
      if (lama && lama !== conn) {
        this.pemilikKoneksi.delete(lama);
        lama.close();
      }
      this.koneksi.set(pesan.id, conn);
      this.pemilikKoneksi.set(conn, pesan.id);
      this.terkirim.delete(pesan.id);
      this.terapkan(r.state, r.diam);
      // Pemain yang baru gabung atau tersambung ulang mendapat riwayat chat singkat.
      this.kirim(conn, { t: 'riwayatChat', pesan: this.chat.pesan });
      return;
    }
    const id = this.pemilikKoneksi.get(conn);
    if (!id) return;
    if (pesan.t === 'ping') {
      this.dispatch({ jenis: 'terlihat', id });
      this.kirim(conn, { t: 'pong' });
      return;
    }
    if (pesan.t === 'chat') {
      this.dispatch({ jenis: 'terlihat', id });
      const tolak = this.prosesChat(id, pesan.teks);
      if (tolak) this.kirim(conn, { t: 'tolak', alasan: tolak, chat: true });
      return;
    }
    if (pesan.t === 'aksi') {
      this.dispatch({ jenis: 'terlihat', id });
      const aksi = rapikanAksiPemain(pesan.aksi);
      if (!aksi) return;
      const r = reduceHost(this.state, { ...aksi, dari: id }, { now: Date.now() });
      if (r.tolak) this.kirim(conn, { t: 'tolak', alasan: r.tolak });
      this.terapkan(r.state, r.diam);
    }
  }

  /** Validasi lalu relay satu pesan chat ke semua pemain yang tersambung. Mengembalikan alasan jika ditolak. */
  private prosesChat(dari: string, teks: unknown): string | undefined {
    const p = this.state.pemain.find((x) => x.id === dari);
    const r = terimaChat(this.chat, p && { id: p.id, nama: p.nama }, teks, Date.now());
    if (r.tolak) return r.tolak;
    if (!r.pesan) return undefined;
    this.chat = r.state;
    this.dengar.onChat?.(this.chat.pesan);
    for (const conn of this.koneksi.values()) this.kirim(conn, { t: 'chat', pesan: r.pesan });
    return undefined;
  }

  /** Chat dari HP host sendiri. */
  kirimChat(teks: string): string | undefined {
    return this.prosesChat(this.state.hostId, teks);
  }

  /** Aksi dari host sendiri (UI di HP host) atau sistem. */
  dispatch(aksi: Aksi): string | undefined {
    const r = reduceHost(this.state, aksi, { now: Date.now() });
    this.terapkan(r.state, r.diam);
    return r.tolak;
  }

  private terapkan(baru: StateHost, diam?: boolean): void {
    const berubah = baru !== this.state;
    this.state = baru;
    if (!berubah || diam) {
      this.kirimSemua();
      return;
    }
    this.dengar.onState(baru);
    this.kirimSemua();
  }

  /** Kirim view terbaru ke setiap pemain yang belum menerima seq ini (hanya kata miliknya sendiri). */
  private kirimSemua(): void {
    for (const [id, conn] of this.koneksi) {
      if (this.terkirim.get(id) === this.state.seq || !conn.open) continue;
      this.terkirim.set(id, this.state.seq);
      this.kirim(conn, { t: 'view', view: viewUntuk(this.state, id) });
    }
  }

  hentikan(): void {
    this.selesai = true;
    if (this.timer) clearInterval(this.timer);
    for (const c of this.koneksi.values()) c.close();
    this.peer?.destroy();
  }
}

/* ---------------------------------- Klien --------------------------------- */

export interface PendengarKlien {
  onView: (v: ViewPemain) => void;
  onStatus: (s: StatusJaringan, info?: string) => void;
  onTolak: (alasan: string, saatGabung: boolean) => void;
  onChat?: (pesan: PesanChat[]) => void;
  onTolakChat?: (alasan: string) => void;
}

export class KlienRoom {
  private peer: PeerT | null = null;
  private conn: DataConnection | null = null;
  private selesai = false;
  private terakhirDengar = 0;
  private seq = 0;
  private sudahView = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private jadwalUlang: ReturnType<typeof setTimeout> | null = null;
  private chat: PesanChat[] = [];

  constructor(
    private kode: string,
    private identitas: { id: string; nama: string; token: string },
    private dengar: PendengarKlien,
  ) {}

  async mulai(): Promise<void> {
    this.dengar.onStatus('menyambung');
    const peer = await buatPeer();
    if (this.selesai) {
      peer.destroy();
      return;
    }
    this.peer = peer;
    peer.on('open', () => this.hubungi());
    peer.on('disconnected', () => {
      if (!this.selesai && !peer.destroyed) setTimeout(() => !this.selesai && !peer.destroyed && peer.reconnect(), 1000);
    });
    peer.on('error', (err) => {
      if (this.selesai) return;
      if (err.type === 'peer-unavailable') {
        this.dengar.onStatus('hostTidakAda');
        this.ulangNanti(3000);
      } else if (err.type === 'browser-incompatible') {
        this.dengar.onStatus('gagal', 'Browser ini tidak mendukung WebRTC.');
      } else {
        this.dengar.onStatus('menyambungUlang', err.type);
        this.ulangNanti(JEDA_ULANG_MS);
      }
    });
    this.timer = setInterval(() => this.detak(), INTERVAL_PING_MS);
  }

  private detak(): void {
    if (this.selesai) return;
    if (this.conn?.open) {
      this.kirimMentah({ t: 'ping' });
      if (Date.now() - this.terakhirDengar > BATAS_SENYAP_HOST_MS) {
        // Host diam terlalu lama (mis. HP host terkunci atau refresh): sambung ulang.
        this.dengar.onStatus('menyambungUlang', 'senyap');
        this.conn.close();
        this.conn = null;
        this.ulangNanti(500);
      }
    }
  }

  private ulangNanti(ms: number): void {
    if (this.jadwalUlang || this.selesai) return;
    this.jadwalUlang = setTimeout(() => {
      this.jadwalUlang = null;
      this.hubungi();
    }, ms);
  }

  private hubungi(): void {
    const peer = this.peer;
    if (this.selesai || !peer || peer.destroyed) return;
    if (peer.disconnected) {
      peer.reconnect();
      return;
    }
    if (this.conn?.open) return;
    this.conn?.close();
    const conn = peer.connect(peerIdHost(this.kode), { reliable: true, serialization: 'json' });
    this.conn = conn;
    this.sudahView = false;
    conn.on('open', () => {
      this.terakhirDengar = Date.now();
      this.kirimMentah({ t: 'halo', v: VERSI_PROTOKOL, ...this.identitas });
    });
    conn.on('data', (data) => {
      if (conn !== this.conn) return;
      this.terakhirDengar = Date.now();
      const p = data as PesanKeKlien;
      if (p.t === 'view') {
        // Setelah tersambung ulang, terima view pertama apa pun (host bisa saja baru dipulihkan).
        if (!this.sudahView || p.view.seq >= this.seq) {
          this.sudahView = true;
          this.seq = p.view.seq;
          this.dengar.onStatus('tersambung');
          this.dengar.onView(p.view);
        }
      } else if (p.t === 'chat' || p.t === 'riwayatChat') {
        const masuk: unknown[] = p.t === 'chat' ? [p.pesan] : Array.isArray(p.pesan) ? p.pesan : [];
        const baru = gabungChat(this.chat, masuk);
        if (baru !== this.chat) {
          this.chat = baru;
          this.dengar.onChat?.(baru);
        }
      } else if (p.t === 'tolak') {
        if (p.chat && this.dengar.onTolakChat) this.dengar.onTolakChat(p.alasan);
        else this.dengar.onTolak(p.alasan, !this.sudahView);
      }
    });
    const putus = () => {
      if (conn !== this.conn || this.selesai) return;
      this.conn = null;
      this.dengar.onStatus('menyambungUlang');
      this.ulangNanti(JEDA_ULANG_MS);
    };
    conn.on('close', putus);
    conn.on('error', putus);
    // Jika koneksi tidak pernah terbuka (mis. ICE gagal), coba lagi.
    setTimeout(() => {
      if (conn === this.conn && !conn.open && !this.selesai) {
        conn.close();
        this.conn = null;
        this.dengar.onStatus('menyambungUlang', 'timeout');
        this.ulangNanti(500);
      }
    }, 12000);
  }

  private kirimMentah(p: PesanKeHost): void {
    try {
      if (this.conn?.open) void this.conn.send(p);
    } catch {
      // abaikan, akan tersambung ulang
    }
  }

  kirimChat(teks: string): boolean {
    if (!this.conn?.open) return false;
    this.kirimMentah({ t: 'chat', teks });
    return true;
  }

  kirim(aksi: AksiPemain): boolean {
    if (!this.conn?.open) return false;
    this.kirimMentah({ t: 'aksi', aksi });
    return true;
  }

  hentikan(): void {
    this.selesai = true;
    if (this.timer) clearInterval(this.timer);
    if (this.jadwalUlang) clearTimeout(this.jadwalUlang);
    this.conn?.close();
    this.peer?.destroy();
  }
}
