// Jalur cadangan "Lewat relay": pesan host <-> pemain lewat Metered Realtime (utama) dan beberapa broker MQTT
// publik gratis (WSS) sekaligus, dipakai saat koneksi langsung WebRTC tidak terbuka (mis. CGNAT seluler di dua sisi)
// atau broker PeerJS tidak terjangkau.
// Isi pesan dienkripsi AES-GCM dengan kunci turunan kode room (PBKDF2), dan nama topik juga turunan PBKDF2,
// jadi pengamat broker tidak melihat kode room maupun kata rahasia.
import { KlienMqtt, type Broker, type PembuatSoket } from './mqtt';
import { KlienMetered, type PembuatSoketTeks } from './metered';
import { KUNCI_METERED } from './kunciMetered';

/** Broker publik tanpa daftar akun. Pesan dikirim ke semua yang tersambung; yang mati diabaikan. */
export const BROKER_RELAY: Broker[] = [
  { url: 'wss://broker.itdata.nu/mqtt' },
  { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' },
  { url: 'wss://iot.coreflux.cloud/mqtt' },
  { url: 'wss://broker.hivemq.com:8884/mqtt' },
  { url: 'wss://broker.emqx.io:8084/mqtt' },
];

const AWALAN_TOPIK = 'undercover-hn/r1';
const GARAM = new TextEncoder().encode('undercover-hn relay v1');
export const ITERASI_PBKDF2 = 150000;

export interface KunciRoom {
  kunci: CryptoKey;
  /** Awalan topik room, turunan kode (bukan kode itu sendiri). */
  topik: string;
}

function keHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Turunkan kunci AES-GCM dan nama topik dari kode room. Semua anggota room (yang tahu kode) mendapat hasil sama. */
export async function turunkanKunciRoom(kode: string, iterasi = ITERASI_PBKDF2): Promise<KunciRoom> {
  const subtle = globalThis.crypto.subtle;
  const bahan = await subtle.importKey('raw', new TextEncoder().encode(kode.toUpperCase()), 'PBKDF2', false, ['deriveBits']);
  const bit = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: GARAM, iterations: iterasi }, bahan, 384));
  const kunci = await subtle.importKey('raw', bit.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { kunci, topik: `${AWALAN_TOPIK}/${keHex(bit.slice(32))}` };
}

export const topikHost = (k: KunciRoom) => `${k.topik}/h`;
export const topikKlien = (k: KunciRoom, rid: string) => `${k.topik}/k/${rid}`;

/** Format kabel: IV 12 byte (sekaligus id pesan untuk buang duplikat) lalu ciphertext AES-GCM dari JSON. */
export async function sandikan(kunci: CryptoKey, isi: unknown): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kunci, new TextEncoder().encode(JSON.stringify(isi))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

/** Buka sandi; null jika rusak, kunci salah, atau bukan JSON. */
export async function bukaSandi(kunci: CryptoKey, data: Uint8Array): Promise<unknown> {
  if (data.length < 13) return null;
  try {
    const pt = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, kunci, data.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}

export function idPesan(data: Uint8Array): string {
  return keHex(data.subarray(0, 12));
}

/** Ingat id pesan terakhir; pesan yang sama dari broker lain diabaikan. */
export class PenyaringDuplikat {
  private set = new Set<string>();
  private urutan: string[] = [];
  constructor(private kapasitas = 1000) {}

  /** true jika baru (belum pernah dilihat). */
  baru(id: string): boolean {
    if (this.set.has(id)) return false;
    this.set.add(id);
    this.urutan.push(id);
    if (this.urutan.length > this.kapasitas) this.set.delete(this.urutan.shift() as string);
    return true;
  }
}

/** Satu jalur relay (Metered atau satu broker MQTT). */
export interface Pengangkut {
  readonly nama: string;
  /** true untuk Metered (dihitung kuota pesan). */
  readonly metered?: boolean;
  /** Jalur utama (Supabase Realtime): selama siap, pesan hanya dikirim lewat jalur ini. */
  readonly utama?: boolean;
  siap: boolean;
  langgan(topik: string): void;
  mulai(): void;
  terbit(topik: string, data: Uint8Array): boolean;
  hentikan(): void;
  /** Keadaan singkat untuk diagnosa, mis. "tersambung" atau "menyambung (tutup 4010)". */
  keadaan(): string;
}

export type PembuatPengangkut = (onPesan: (topik: string, data: Uint8Array) => void, onSiap: (siap: boolean) => void) => Pengangkut;

/** Mode jalur relay yang dipakai: semua (bawaan), hanya Metered, atau hanya MQTT (untuk pengujian). */
export type ModeRelay = 'semua' | 'metered' | 'mqtt';

export interface OpsiPengangkut {
  mode?: ModeRelay;
  /** Kunci publik Metered; kosong = Metered tidak dipakai. */
  kunciMetered?: string;
  broker?: Broker[];
  buatSoket?: PembuatSoket;
  buatSoketMetered?: PembuatSoketTeks;
  /** Jalur utama (Supabase Realtime) untuk pemain yang login; dipasang paling depan. */
  utama?: PembuatPengangkut;
}

/** Daftar jalur relay: Supabase Realtime (bila ada) lebih dulu, lalu Metered, lalu broker MQTT publik sebagai cadangan. */
export function daftarPengangkut(o: OpsiPengangkut = {}): PembuatPengangkut[] {
  const mode = o.mode ?? 'semua';
  // Soket MQTT tiruan (pengujian) tanpa soket Metered tiruan: jangan menyambung ke Metered sungguhan.
  const kunci = o.kunciMetered ?? (o.buatSoket && !o.buatSoketMetered ? '' : KUNCI_METERED);
  const hasil: PembuatPengangkut[] = [];
  if (o.utama && mode === 'semua') hasil.push(o.utama);
  if (mode !== 'mqtt' && kunci) hasil.push((p, s) => new KlienMetered(kunci, p, s, o.buatSoketMetered));
  if (mode !== 'metered') for (const b of o.broker ?? BROKER_RELAY) hasil.push((p, s) => new KlienMqtt(b, p, s, o.buatSoket));
  return hasil;
}

/** Ringkasan keadaan jalur relay untuk diagnosa. */
export interface RingkasanRelay {
  /** Keadaan jalur utama (Supabase Realtime); null = tidak dipakai. */
  utama?: string | null;
  /** null = Metered tidak dipakai. */
  metered: string | null;
  mqttSiap: number;
  mqttTotal: number;
  /** Pesan terenkripsi valid yang diterima, per nama jalur yang mengantarnya lebih dulu. */
  masuk: Record<string, number>;
  /** Jumlah publish ke Metered (dihitung kuota). */
  terbitMetered: number;
}

/** Satu topik masuk, kirim lewat semua jalur sekaligus, buang duplikat, toleran jalur mati. */
export class RelayMulti {
  private klien: Pengangkut[];
  private saring = new PenyaringDuplikat();
  private selesai = false;
  private masuk: Record<string, number> = {};
  private terbitMetered = 0;

  constructor(
    private kunci: KunciRoom,
    private onPesan: (isi: unknown) => void,
    private onJumlah: (tersambung: number) => void = () => {},
    pengangkut: PembuatPengangkut[] = daftarPengangkut(),
  ) {
    this.klien = pengangkut.map((buat) => {
      let k: Pengangkut | null = null;
      k = buat((_t, d) => void this.terima(d, k), () => this.onJumlah(this.jumlah()));
      return k;
    });
  }

  private async terima(data: Uint8Array, dari: Pengangkut | null): Promise<void> {
    if (this.selesai || !this.saring.baru(idPesan(data))) return;
    const isi = await bukaSandi(this.kunci.kunci, data);
    if (isi === null || this.selesai) return;
    if (dari) this.masuk[dari.nama] = (this.masuk[dari.nama] ?? 0) + 1;
    this.onPesan(isi);
  }

  mulai(topikMasuk: string): void {
    for (const k of this.klien) {
      k.langgan(topikMasuk);
      k.mulai();
    }
  }

  jumlah(): number {
    return this.klien.filter((k) => k.siap).length;
  }

  /** Jalur Metered (jika dipakai), misalnya untuk mengambil iceServers TURN dari welcome. */
  get metered(): KlienMetered | null {
    return (this.klien.find((k) => k instanceof KlienMetered) as KlienMetered | undefined) ?? null;
  }

  ringkasan(): RingkasanRelay {
    const m = this.klien.find((k) => k.metered);
    const u = this.klien.find((k) => k.utama);
    const mqtt = this.klien.filter((k) => !k.metered && !k.utama);
    return {
      utama: u ? u.keadaan() : null,
      metered: m ? m.keadaan() : null,
      mqttSiap: mqtt.filter((k) => k.siap).length,
      mqttTotal: mqtt.length,
      masuk: { ...this.masuk },
      terbitMetered: this.terbitMetered,
    };
  }

  /**
   * Kirim lewat jalur utama bila siap (hemat kuota Metered dan beban broker publik), selain itu lewat semua jalur
   * yang tersambung. false jika tidak ada satu pun.
   */
  async kirim(topik: string, isi: unknown): Promise<boolean> {
    if (this.selesai) return false;
    const data = await sandikan(this.kunci.kunci, isi);
    this.saring.baru(idPesan(data)); // gema pesan sendiri tidak diproses
    let ok = false;
    const utama = this.klien.filter((k) => k.utama && k.siap);
    for (const k of utama.length ? utama : this.klien) {
      const t = k.terbit(topik, data);
      if (t && k.metered) this.terbitMetered++;
      ok = t || ok;
    }
    return ok;
  }

  hentikan(): void {
    this.selesai = true;
    for (const k of this.klien) k.hentikan();
  }
}

/** Hex topik room (bagian setelah awalan), dipakai sebagai nama kanal Supabase Realtime. */
export function hexTopik(topik: string): string | null {
  const m = /\/r1\/([0-9a-f]{32})(\/|$)/.exec(topik);
  return m ? m[1] : null;
}

export function keBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function dariBase64(t: string): Uint8Array | null {
  try {
    const s = atob(t);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  } catch {
    return null;
  }
}

export function buatIdRelay(): string {
  return keHex(globalThis.crypto.getRandomValues(new Uint8Array(8)));
}

/** Pesan di topik host: dari pemain `f`. Pesan di topik pemain: hanya `d`. */
export interface AmplopKeHost { f: string; d: unknown; tutup?: boolean }
export interface AmplopKeKlien { d: unknown }
