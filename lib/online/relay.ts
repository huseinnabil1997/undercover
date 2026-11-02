// Jalur cadangan "Lewat relay": pesan host <-> pemain lewat beberapa broker MQTT publik gratis (WSS) sekaligus,
// dipakai saat koneksi langsung WebRTC tidak terbuka (mis. CGNAT seluler di dua sisi) atau broker PeerJS tidak terjangkau.
// Isi pesan dienkripsi AES-GCM dengan kunci turunan kode room (PBKDF2), dan nama topik juga turunan PBKDF2,
// jadi pengamat broker tidak melihat kode room maupun kata rahasia.
import { KlienMqtt, type Broker, type PembuatSoket } from './mqtt';

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

/** Satu topik masuk, kirim ke banyak broker sekaligus, buang duplikat, toleran broker mati. */
export class RelayMulti {
  private klien: KlienMqtt[];
  private saring = new PenyaringDuplikat();
  private selesai = false;

  constructor(
    private kunci: KunciRoom,
    private onPesan: (isi: unknown) => void,
    private onJumlah: (tersambung: number) => void = () => {},
    daftar: Broker[] = BROKER_RELAY,
    buatSoket?: PembuatSoket,
  ) {
    this.klien = daftar.map((b) => new KlienMqtt(b, (_t, d) => void this.terima(d), () => this.onJumlah(this.jumlah()), buatSoket));
  }

  private async terima(data: Uint8Array): Promise<void> {
    if (this.selesai || !this.saring.baru(idPesan(data))) return;
    const isi = await bukaSandi(this.kunci.kunci, data);
    if (isi !== null && !this.selesai) this.onPesan(isi);
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

  /** Kirim ke semua broker yang tersambung. false jika tidak ada satu pun. */
  async kirim(topik: string, isi: unknown): Promise<boolean> {
    if (this.selesai) return false;
    const data = await sandikan(this.kunci.kunci, isi);
    this.saring.baru(idPesan(data)); // gema pesan sendiri tidak diproses
    let ok = false;
    for (const k of this.klien) ok = k.terbit(topik, data) || ok;
    return ok;
  }

  hentikan(): void {
    this.selesai = true;
    for (const k of this.klien) k.hentikan();
  }
}

export function buatIdRelay(): string {
  return keHex(globalThis.crypto.getRandomValues(new Uint8Array(8)));
}

/** Pesan di topik host: dari pemain `f`. Pesan di topik pemain: hanya `d`. */
export interface AmplopKeHost { f: string; d: unknown; tutup?: boolean }
export interface AmplopKeKlien { d: unknown }
