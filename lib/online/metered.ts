// Klien Metered Realtime Messaging (wss://rms.metered.ca/v1) tanpa SDK: bingkai JSON lewat WebSocket.
// Dipakai sebagai jalur relay utama. Isi pesan tetap terenkripsi AES-GCM oleh relay.ts; Metered hanya melihat
// teks base64 acak. Hanya `publish` yang dihitung kuota, jadi subscribe/unsubscribe/presence gratis.
import type { Pengangkut } from './relay';

export const URL_METERED = 'wss://rms.metered.ca/v1';

/** Bagian WebSocket yang dipakai (agar bisa diganti tiruan saat pengujian). */
export interface SoketTeks {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export type PembuatSoketTeks = (url: string) => SoketTeks;

const bawaanSoket: PembuatSoketTeks = (url) => new WebSocket(url) as unknown as SoketTeks;

/** Kode tutup yang tidak akan membaik dengan menyambung ulang (kunci salah, kanal ditolak, akun dibekukan). */
const TUTUP_FINAL = new Set([4001, 4002, 4003, 4012]);
/** Batas koneksi bersamaan atau laju terlampaui: tunggu lebih lama sebelum mencoba lagi. */
const TUTUP_SABAR = new Set([4010, 4011]);

export const BATAS_WELCOME_MS = 15000;
/** Cek hidup gratis: unsubscribe kanal kosong dibalas ack dan tidak dihitung kuota. */
export const INTERVAL_CEK_MS = 25000;
const BATAS_CEK_MS = 10000;
const KANAL_CEK = 'undercover-hn/cek';

export function keBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function dariBase64(s: string): Uint8Array {
  const t = atob(s);
  const b = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
  return b;
}

/** Ambil daftar iceServers dari metadata welcome (diisi Metered bila layanan TURN aktif). */
export function iceDariWelcome(m: unknown): RTCIceServer[] {
  const meta = (m as { metadata?: { iceServers?: unknown } } | null)?.metadata;
  const daftar = meta?.iceServers;
  if (!Array.isArray(daftar)) return [];
  return daftar.filter((s): s is RTCIceServer => {
    const u = (s as { urls?: unknown } | null)?.urls;
    return typeof u === 'string' || (Array.isArray(u) && u.every((x) => typeof x === 'string'));
  });
}

type Keadaan = 'mati' | 'menyambung' | 'tersambung' | 'ditolak';

/** Satu koneksi ke Metered. Menyambung ulang sendiri (jeda bertambah + acak) dan berlangganan ulang. */
export class KlienMetered implements Pengangkut {
  readonly nama = 'Metered';
  readonly metered = true;
  siap = false;
  /** null = belum menerima welcome. Array kosong = welcome tanpa TURN. */
  iceServers: RTCIceServer[] | null = null;
  /** Alasan terakhir gagal (untuk diagnosa), mis. "tutup 4010". */
  alasan = '';
  /** Jumlah publish yang berhasil dikirim (yang dihitung kuota Metered). */
  terkirim = 0;
  private keadaanSaatIni: Keadaan = 'mati';
  private ws: SoketTeks | null = null;
  private langganan = new Set<string>();
  private selesai = false;
  private jeda = 1000;
  private nomor = 0;
  private menungguCek = '';
  private timerUlang: ReturnType<typeof setTimeout> | null = null;
  private timerWelcome: ReturnType<typeof setTimeout> | null = null;
  private timerCek: ReturnType<typeof setInterval> | null = null;
  private timerBatasCek: ReturnType<typeof setTimeout> | null = null;
  private penungguWelcome: Array<() => void> = [];

  constructor(
    private kunci: string,
    private onPesan: (topik: string, data: Uint8Array) => void,
    private onSiap: (siap: boolean) => void = () => {},
    private buatSoket: PembuatSoketTeks = bawaanSoket,
    private url: string = URL_METERED,
  ) {}

  /** Sudah pernah menerima welcome (sehingga iceServers sudah pasti). */
  adaWelcome(): boolean {
    return this.iceServers !== null;
  }

  keadaan(): string {
    if (this.keadaanSaatIni === 'tersambung') return this.alasan ? `tersambung (${this.alasan})` : 'tersambung';
    if (this.keadaanSaatIni === 'ditolak') return `ditolak (${this.alasan})`;
    return this.alasan ? `menyambung (${this.alasan})` : 'menyambung';
  }

  mulai(): void {
    if (this.selesai) return;
    this.keadaanSaatIni = 'menyambung';
    let ws: SoketTeks;
    try {
      ws = this.buatSoket(`${this.url}?key=${encodeURIComponent(this.kunci)}`);
    } catch {
      this.alasan = 'soket gagal';
      this.jadwalUlang();
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev) => {
      if (ws !== this.ws || typeof ev.data !== 'string') return;
      let m: { type?: string; [k: string]: unknown };
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.tangani(ws, m);
    };
    ws.onclose = (ev) => this.putus(ws, ev?.code);
    ws.onerror = () => this.putus(ws);
    this.timerWelcome = setTimeout(() => {
      if (ws === this.ws && !this.siap) {
        this.alasan = 'tidak ada welcome';
        this.putus(ws);
      }
    }, BATAS_WELCOME_MS);
  }

  private tangani(ws: SoketTeks, m: { type?: string; [k: string]: unknown }): void {
    switch (m.type) {
      case 'welcome': {
        if (this.timerWelcome) clearTimeout(this.timerWelcome);
        this.iceServers = iceDariWelcome(m);
        this.siap = true;
        this.keadaanSaatIni = 'tersambung';
        this.alasan = '';
        this.jeda = 1000;
        for (const t of this.langganan) this.kirimJson({ type: 'subscribe', channel: t });
        this.timerCek = setInterval(() => this.cek(ws), INTERVAL_CEK_MS);
        const tunggu = this.penungguWelcome;
        this.penungguWelcome = [];
        for (const f of tunggu) f();
        this.onSiap(true);
        return;
      }
      case 'message': {
        if (typeof m.channel !== 'string' || typeof m.data !== 'string') return;
        let data: Uint8Array;
        try {
          data = dariBase64(m.data);
        } catch {
          return;
        }
        this.onPesan(m.channel, data);
        return;
      }
      case 'ack':
      case 'error': {
        if (m.requestId && m.requestId === this.menungguCek) {
          this.menungguCek = '';
          if (this.timerBatasCek) clearTimeout(this.timerBatasCek);
        }
        if (m.type === 'error' && typeof m.code === 'string') this.alasan = m.code;
        return;
      }
      case 'going_away': {
        const t = Number(m.retryAfterMs);
        if (Number.isFinite(t) && t > 0) this.jeda = Math.min(30000, t);
        return;
      }
    }
  }

  /** Cek koneksi masih hidup tanpa memakai kuota pesan. */
  private cek(ws: SoketTeks): void {
    if (ws !== this.ws || this.menungguCek) return;
    this.menungguCek = `cek-${++this.nomor}`;
    this.kirimJson({ type: 'unsubscribe', channel: KANAL_CEK, requestId: this.menungguCek });
    this.timerBatasCek = setTimeout(() => {
      if (ws === this.ws && this.menungguCek) {
        this.alasan = 'tidak menjawab';
        this.putus(ws);
      }
    }, BATAS_CEK_MS);
  }

  private putus(ws: SoketTeks, kode?: number): void {
    if (ws !== this.ws) return;
    this.ws = null;
    try {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close();
    } catch {
      // abaikan
    }
    if (this.timerWelcome) clearTimeout(this.timerWelcome);
    if (this.timerCek) clearInterval(this.timerCek);
    if (this.timerBatasCek) clearTimeout(this.timerBatasCek);
    this.timerCek = null;
    this.menungguCek = '';
    const tadi = this.siap;
    this.siap = false;
    if (kode && kode !== 1000 && kode !== 1001 && kode !== 1005) this.alasan = `tutup ${kode}`;
    else if (!this.alasan && !tadi) this.alasan = 'tidak terjangkau';
    if (tadi) this.onSiap(false);
    if (kode !== undefined && TUTUP_FINAL.has(kode)) {
      this.keadaanSaatIni = 'ditolak';
      this.selesai = true;
      this.lepasPenunggu();
      return;
    }
    this.keadaanSaatIni = 'menyambung';
    if (kode !== undefined && TUTUP_SABAR.has(kode)) this.jeda = Math.max(this.jeda, 30000);
    this.lepasPenunggu();
    this.jadwalUlang();
  }

  private lepasPenunggu(): void {
    const tunggu = this.penungguWelcome;
    this.penungguWelcome = [];
    for (const f of tunggu) f();
  }

  private jadwalUlang(): void {
    if (this.selesai || this.timerUlang) return;
    const tunggu = this.jeda * (0.8 + Math.random() * 0.4);
    this.timerUlang = setTimeout(() => {
      this.timerUlang = null;
      this.mulai();
    }, tunggu);
    this.jeda = Math.min(30000, this.jeda * 2);
  }

  private kirimJson(o: unknown): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify(o));
      return true;
    } catch {
      return false;
    }
  }

  /** Tunggu welcome pertama (atau kegagalan pertama) paling lama `ms`. Hasil: iceServers bila ada. */
  tungguWelcome(ms: number): Promise<RTCIceServer[]> {
    if (this.iceServers || this.selesai) return Promise.resolve(this.iceServers ?? []);
    return new Promise((selesai) => {
      const t = setTimeout(() => selesai(this.iceServers ?? []), ms);
      this.penungguWelcome.push(() => {
        clearTimeout(t);
        selesai(this.iceServers ?? []);
      });
    });
  }

  langgan(topik: string): void {
    if (this.langganan.has(topik)) return;
    this.langganan.add(topik);
    if (this.siap) this.kirimJson({ type: 'subscribe', channel: topik });
  }

  terbit(topik: string, data: Uint8Array): boolean {
    if (!this.siap) return false;
    const ok = this.kirimJson({ type: 'publish', channel: topik, data: keBase64(data) });
    if (ok) this.terkirim++;
    return ok;
  }

  hentikan(): void {
    this.selesai = true;
    if (this.timerUlang) clearTimeout(this.timerUlang);
    const ws = this.ws;
    if (ws) {
      try {
        ws.close();
      } catch {
        // abaikan
      }
      this.putus(ws, 1000);
    }
    this.keadaanSaatIni = 'mati';
    this.lepasPenunggu();
  }
}
