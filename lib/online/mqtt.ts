// Klien MQTT 3.1.1 minimal lewat WebSocket (QoS 0 saja), cukup untuk relay cadangan mode online.
// Sengaja tanpa dependensi: codec paket murni (bisa diuji) plus klien kecil dengan sambung ulang otomatis.

const enc = new TextEncoder();

function panjangSisa(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

function str(s: string): number[] {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 0xff, ...b];
}

function paket(header: number, isi: number[] | Uint8Array): Uint8Array {
  const sisa = panjangSisa(isi.length);
  const out = new Uint8Array(1 + sisa.length + isi.length);
  out[0] = header;
  out.set(sisa, 1);
  out.set(isi, 1 + sisa.length);
  return out;
}

export interface OpsiConnect {
  clientId: string;
  username?: string;
  password?: string;
  keepAlive: number;
}

export function paketConnect(o: OpsiConnect): Uint8Array {
  let flag = 0x02; // clean session
  if (o.username !== undefined) flag |= 0x80;
  if (o.password !== undefined) flag |= 0x40;
  const isi = [...str('MQTT'), 4, flag, o.keepAlive >> 8, o.keepAlive & 0xff, ...str(o.clientId)];
  if (o.username !== undefined) isi.push(...str(o.username));
  if (o.password !== undefined) isi.push(...str(o.password));
  return paket(0x10, isi);
}

export function paketSubscribe(idPaket: number, topik: string): Uint8Array {
  return paket(0x82, [idPaket >> 8, idPaket & 0xff, ...str(topik), 0]);
}

export function paketPublish(topik: string, data: Uint8Array): Uint8Array {
  const t = str(topik);
  const isi = new Uint8Array(t.length + data.length);
  isi.set(t, 0);
  isi.set(data, t.length);
  return paket(0x30, isi);
}

export const PAKET_PING = Uint8Array.of(0xc0, 0);
export const PAKET_DISCONNECT = Uint8Array.of(0xe0, 0);

export type PaketMasuk =
  | { jenis: 'connack'; kode: number }
  | { jenis: 'suback'; id: number }
  | { jenis: 'publish'; topik: string; data: Uint8Array }
  | { jenis: 'pingresp' }
  | { jenis: 'lain'; tipe: number };

/** Pengurai aliran byte: frame WebSocket bisa berisi sebagian atau beberapa paket MQTT sekaligus. */
export class PenguraiMqtt {
  private buf = new Uint8Array(0);

  tambah(potongan: Uint8Array): PaketMasuk[] {
    const gabung = new Uint8Array(this.buf.length + potongan.length);
    gabung.set(this.buf, 0);
    gabung.set(potongan, this.buf.length);
    this.buf = gabung;
    const hasil: PaketMasuk[] = [];
    for (;;) {
      if (this.buf.length < 2) break;
      let kali = 1;
      let n = 0;
      let i = 1;
      let lengkap = false;
      for (; i < Math.min(this.buf.length, 5); i++) {
        n += (this.buf[i] & 0x7f) * kali;
        kali *= 128;
        if ((this.buf[i] & 0x80) === 0) {
          lengkap = true;
          i++;
          break;
        }
      }
      if (!lengkap) {
        if (this.buf.length >= 5) throw new Error('Panjang paket MQTT tidak valid');
        break;
      }
      if (this.buf.length < i + n) break;
      hasil.push(uraiPaket(this.buf[0], this.buf.subarray(i, i + n)));
      this.buf = this.buf.slice(i + n);
    }
    return hasil;
  }
}

function uraiPaket(header: number, isi: Uint8Array): PaketMasuk {
  const tipe = header >> 4;
  if (tipe === 2) return { jenis: 'connack', kode: isi[1] ?? 255 };
  if (tipe === 9) return { jenis: 'suback', id: (isi[0] << 8) | isi[1] };
  if (tipe === 13) return { jenis: 'pingresp' };
  if (tipe === 3) {
    const qos = (header >> 1) & 3;
    const pt = (isi[0] << 8) | isi[1];
    const topik = new TextDecoder().decode(isi.subarray(2, 2 + pt));
    const mulai = 2 + pt + (qos > 0 ? 2 : 0);
    return { jenis: 'publish', topik, data: isi.slice(mulai) };
  }
  return { jenis: 'lain', tipe };
}

/* ------------------------------ Klien WebSocket ----------------------------- */

export interface Broker {
  url: string;
  username?: string;
  password?: string;
}

/** Bagian WebSocket yang dipakai (agar bisa diganti tiruan saat pengujian). */
export interface SoketMinimal {
  binaryType: string;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: Uint8Array): void;
  close(): void;
}

export type PembuatSoket = (url: string) => SoketMinimal;

const bawaanSoket: PembuatSoket = (url) => new WebSocket(url, 'mqtt') as unknown as SoketMinimal;

const KEEPALIVE_DETIK = 30;
const BATAS_CONNECT_MS = 10000;

/** Satu koneksi ke satu broker. Menyambung ulang sendiri (jeda bertambah) dan berlangganan ulang. */
export class KlienMqtt {
  siap = false;
  readonly metered = false;
  private ws: SoketMinimal | null = null;
  private langganan = new Set<string>();
  private idPaket = 1;
  private selesai = false;
  private jeda = 1500;
  private timerUlang: ReturnType<typeof setTimeout> | null = null;
  private timerPing: ReturnType<typeof setInterval> | null = null;
  private timerConnect: ReturnType<typeof setTimeout> | null = null;
  private terakhirTerima = 0;

  constructor(
    public broker: Broker,
    private onPesan: (topik: string, data: Uint8Array) => void,
    private onSiap: (siap: boolean) => void = () => {},
    private buatSoket: PembuatSoket = bawaanSoket,
  ) {}

  get nama(): string {
    try {
      return new URL(this.broker.url).host;
    } catch {
      return this.broker.url;
    }
  }

  keadaan(): string {
    return this.siap ? 'tersambung' : 'menyambung';
  }

  mulai(): void {
    if (this.selesai) return;
    let ws: SoketMinimal;
    try {
      ws = this.buatSoket(this.broker.url);
    } catch {
      this.jadwalUlang();
      return;
    }
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    const pengurai = new PenguraiMqtt();
    ws.onopen = () => {
      const clientId = 'uc' + Math.random().toString(36).slice(2, 12);
      this.kirimMentah(paketConnect({ clientId, username: this.broker.username, password: this.broker.password, keepAlive: KEEPALIVE_DETIK }));
    };
    ws.onmessage = (ev) => {
      if (ws !== this.ws) return;
      const d = ev.data;
      const bytes = d instanceof ArrayBuffer ? new Uint8Array(d) : d instanceof Uint8Array ? d : null;
      if (!bytes) return;
      this.terakhirTerima = Date.now();
      let daftar: PaketMasuk[];
      try {
        daftar = pengurai.tambah(bytes);
      } catch {
        ws.close();
        return;
      }
      for (const p of daftar) this.tanganiPaket(p);
    };
    ws.onclose = () => this.putus(ws);
    ws.onerror = () => this.putus(ws);
    this.timerConnect = setTimeout(() => {
      if (ws === this.ws && !this.siap) this.putus(ws);
    }, BATAS_CONNECT_MS);
  }

  private tanganiPaket(p: PaketMasuk): void {
    if (p.jenis === 'connack') {
      if (p.kode !== 0) {
        this.ws?.close();
        return;
      }
      if (this.timerConnect) clearTimeout(this.timerConnect);
      this.siap = true;
      this.jeda = 1500;
      for (const t of this.langganan) this.kirimMentah(paketSubscribe(this.idBaru(), t));
      this.timerPing = setInterval(() => {
        if (Date.now() - this.terakhirTerima > KEEPALIVE_DETIK * 1500) {
          this.ws?.close();
          if (this.ws) this.putus(this.ws);
          return;
        }
        this.kirimMentah(PAKET_PING);
      }, (KEEPALIVE_DETIK * 1000) / 2);
      this.onSiap(true);
    } else if (p.jenis === 'publish') {
      this.onPesan(p.topik, p.data);
    }
  }

  private putus(ws: SoketMinimal): void {
    if (ws !== this.ws) return;
    this.ws = null;
    try {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close();
    } catch {
      // abaikan
    }
    if (this.timerPing) clearInterval(this.timerPing);
    if (this.timerConnect) clearTimeout(this.timerConnect);
    this.timerPing = null;
    const tadi = this.siap;
    this.siap = false;
    if (tadi) this.onSiap(false);
    this.jadwalUlang();
  }

  private jadwalUlang(): void {
    if (this.selesai || this.timerUlang) return;
    this.timerUlang = setTimeout(() => {
      this.timerUlang = null;
      this.mulai();
    }, this.jeda);
    this.jeda = Math.min(30000, this.jeda * 2);
  }

  private idBaru(): number {
    this.idPaket = (this.idPaket % 65535) + 1;
    return this.idPaket;
  }

  private kirimMentah(b: Uint8Array): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(b);
      return true;
    } catch {
      return false;
    }
  }

  langgan(topik: string): void {
    if (this.langganan.has(topik)) return;
    this.langganan.add(topik);
    if (this.siap) this.kirimMentah(paketSubscribe(this.idBaru(), topik));
  }

  terbit(topik: string, data: Uint8Array): boolean {
    return this.siap && this.kirimMentah(paketPublish(topik, data));
  }

  hentikan(): void {
    this.selesai = true;
    if (this.timerUlang) clearTimeout(this.timerUlang);
    const ws = this.ws;
    if (ws) {
      this.kirimMentah(PAKET_DISCONNECT);
      this.putus(ws);
    }
  }
}
