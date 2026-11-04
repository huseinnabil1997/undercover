// Jalur relay utama: Supabase Realtime broadcast di kanal privat "uc:<hex>".
// Hanya anggota room yang login yang bisa bergabung ke kanal (RLS realtime.messages). Isi pesan tetap AES-GCM
// dengan kunci turunan kode room, jadi server Supabase pun hanya melihat ciphertext.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { dariBase64, hexTopik, keBase64, type PembuatPengangkut, type Pengangkut } from './relay';

export const EVENT_RELAY = 'm';
const JEDA_ULANG_MS = 4000;

export class KlienRealtime implements Pengangkut {
  readonly nama = 'Supabase';
  readonly utama = true;
  siap = false;
  private topik = new Set<string>();
  private kanal: RealtimeChannel | null = null;
  private selesai = false;
  private status = 'belum mulai';
  private ulang: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private klien: () => SupabaseClient,
    private onPesan: (topik: string, data: Uint8Array) => void,
    private onSiap: (siap: boolean) => void,
  ) {}

  langgan(topik: string): void {
    this.topik.add(topik);
  }

  mulai(): void {
    void this.sambung();
  }

  private ubahSiap(siap: boolean): void {
    if (siap === this.siap) return;
    this.siap = siap;
    this.onSiap(siap);
  }

  private async sambung(): Promise<void> {
    const hex = hexTopik([...this.topik][0] ?? '');
    if (!hex || this.selesai) return;
    const sb = this.klien();
    this.status = 'menyambung';
    try {
      // Kanal privat memakai JWT pengguna; pastikan token terbaru sudah dipasang.
      await sb.realtime.setAuth();
    } catch {
      // tetap coba; subscribe akan gagal bila token tidak sah
    }
    if (this.selesai) return;
    const kanal = sb.channel(`uc:${hex}`, { config: { private: true, broadcast: { self: false, ack: false } } });
    kanal.on('broadcast', { event: EVENT_RELAY }, (m: { payload?: { t?: unknown; d?: unknown } }) => {
      const p = m.payload;
      if (!p || typeof p.t !== 'string' || typeof p.d !== 'string' || !this.topik.has(p.t)) return;
      const data = dariBase64(p.d);
      if (data) this.onPesan(p.t, data);
    });
    this.kanal = kanal;
    kanal.subscribe((s) => {
      if (this.selesai || this.kanal !== kanal) return;
      this.status = s === 'SUBSCRIBED' ? 'tersambung' : s === 'CHANNEL_ERROR' ? 'ditolak/galat' : s.toLowerCase();
      this.ubahSiap(s === 'SUBSCRIBED');
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') this.jadwalUlang();
    });
  }

  private jadwalUlang(): void {
    if (this.selesai || this.ulang) return;
    this.ulang = setTimeout(() => {
      this.ulang = null;
      if (this.selesai) return;
      const lama = this.kanal;
      this.kanal = null;
      if (lama) void this.klien().removeChannel(lama);
      void this.sambung();
    }, JEDA_ULANG_MS);
  }

  terbit(topik: string, data: Uint8Array): boolean {
    const kanal = this.kanal;
    if (!this.siap || !kanal) return false;
    void kanal.send({ type: 'broadcast', event: EVENT_RELAY, payload: { t: topik, d: keBase64(data) } }).catch(() => {});
    return true;
  }

  hentikan(): void {
    this.selesai = true;
    if (this.ulang) clearTimeout(this.ulang);
    const kanal = this.kanal;
    this.kanal = null;
    this.ubahSiap(false);
    if (kanal) void this.klien().removeChannel(kanal);
  }

  keadaan(): string {
    return this.status;
  }
}

export function pembuatRealtime(klien: () => SupabaseClient): PembuatPengangkut {
  return (onPesan, onSiap) => new KlienRealtime(klien, onPesan, onSiap);
}
