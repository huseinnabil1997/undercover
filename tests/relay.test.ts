import { afterEach, describe, expect, it, vi } from 'vitest';
import { BATAS_LANGSUNG_MS, paksaRelayDari, perluRelay, statusHostGabungan, teksJalur } from '../lib/online/jalur';
import { HostRoom, KlienRoom, type StatusJaringan } from '../lib/online/jaringan';
import { pesanMacet } from '../lib/online/macet';
import {
  KlienMqtt, PAKET_PING, paketConnect, paketPublish, paketSubscribe, PenguraiMqtt, type Broker, type PembuatSoket, type SoketMinimal,
} from '../lib/online/mqtt';
import {
  BROKER_RELAY, bukaSandi, buatIdRelay, idPesan, PenyaringDuplikat, RelayMulti, sandikan, topikHost, topikKlien, turunkanKunciRoom,
} from '../lib/online/relay';
import { buatStateHost } from '../lib/online/host';
import type { ViewPemain } from '../lib/online/types';

const ITER = 1000; // cepat untuk uji; produksi memakai ITERASI_PBKDF2

/* ------------------------------ Broker tiruan ------------------------------ */

function uraiPanjang(b: Uint8Array): { n: number; i: number } {
  let n = 0;
  let kali = 1;
  let i = 1;
  for (; ; i++) {
    n += (b[i] & 0x7f) * kali;
    kali *= 128;
    if ((b[i] & 0x80) === 0) break;
  }
  return { n, i: i + 1 };
}

/** Broker MQTT di memori: CONNECT/SUBSCRIBE/PUBLISH QoS 0, wildcard tidak didukung (tidak dipakai). */
class BrokerTiruan {
  mati = false;
  koneksi = new Set<SoketTiruan>();
  terbit = 0;
  constructor(public url: string) {}

  buat(): SoketTiruan {
    const s = new SoketTiruan(this);
    setTimeout(() => {
      if (this.mati) {
        s.readyState = 3;
        s.onerror?.({});
        return;
      }
      s.readyState = 1;
      this.koneksi.add(s);
      s.onopen?.({});
    }, 1);
    return s;
  }

  terima(s: SoketTiruan, b: Uint8Array): void {
    if (this.mati) return;
    const tipe = b[0] >> 4;
    const { i } = uraiPanjang(b);
    const isi = b.subarray(i);
    if (tipe === 1) s.balas(Uint8Array.of(0x20, 2, 0, 0));
    else if (tipe === 8) {
      const pt = (isi[2] << 8) | isi[3];
      s.langganan.add(new TextDecoder().decode(isi.subarray(4, 4 + pt)));
      s.balas(Uint8Array.of(0x90, 3, isi[0], isi[1], 0));
    } else if (tipe === 3) {
      const pt = (isi[0] << 8) | isi[1];
      const topik = new TextDecoder().decode(isi.subarray(2, 2 + pt));
      this.terbit++;
      for (const k of this.koneksi) if (k.langganan.has(topik)) k.balas(paketPublish(topik, isi.slice(2 + pt)));
    } else if (tipe === 12) s.balas(Uint8Array.of(0xd0, 0));
  }

  /** Broker tiba-tiba mati: semua koneksi tertutup. */
  matikan(): void {
    this.mati = true;
    for (const k of [...this.koneksi]) k.close();
  }
}

class SoketTiruan implements SoketMinimal {
  binaryType = 'blob';
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  langganan = new Set<string>();
  constructor(private broker: BrokerTiruan) {}
  send(data: Uint8Array): void {
    if (this.readyState !== 1) throw new Error('belum terbuka');
    const salin = data.slice();
    setTimeout(() => this.broker.terima(this, salin), 1);
  }
  balas(b: Uint8Array): void {
    setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: b.slice().buffer }), 1);
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.broker.koneksi.delete(this);
    setTimeout(() => this.onclose?.({}), 1);
  }
}

function jaringanTiruan(n: number) {
  const broker = Array.from({ length: n }, (_, i) => new BrokerTiruan(`wss://tiruan${i}.test/mqtt`));
  const daftar: Broker[] = broker.map((b) => ({ url: b.url }));
  const buatSoket: PembuatSoket = (url) => {
    const b = broker.find((x) => x.url === url);
    if (!b) throw new Error('tidak dikenal');
    return b.buat();
  };
  return { broker, daftar, buatSoket };
}

const tunggu = async (cek: () => boolean, ms = 5000) => {
  const akhir = Date.now() + ms;
  while (!cek()) {
    if (Date.now() > akhir) throw new Error('waktu habis');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/* --------------------------------- Codec --------------------------------- */

describe('codec MQTT minimal', () => {
  it('CONNECT memuat protokol MQTT 3.1.1, clean session, username dan password', () => {
    const b = paketConnect({ clientId: 'uc1', username: 'public', password: 'public', keepAlive: 30 });
    expect(b[0]).toBe(0x10);
    const { n, i } = uraiPanjang(b);
    expect(b.length).toBe(i + n);
    expect(new TextDecoder().decode(b.subarray(i + 2, i + 6))).toBe('MQTT');
    expect(b[i + 6]).toBe(4);
    expect(b[i + 7]).toBe(0x02 | 0x80 | 0x40);
  });

  it('SUBSCRIBE memakai flag 0x82 dan QoS 0', () => {
    const b = paketSubscribe(7, 'a/b');
    expect(b[0]).toBe(0x82);
    expect(b[b.length - 1]).toBe(0);
  });

  it('PUBLISH besar (panjang varint multi-byte) terurai utuh, walau terpotong dan bergabung', () => {
    const data = new Uint8Array(70000).map((_, i) => i % 251);
    const satu = paketPublish('undercover-hn/r1/x/h', data);
    const dua = paketPublish('t2', Uint8Array.of(1, 2, 3));
    const semua = new Uint8Array(satu.length + dua.length + 2);
    semua.set(satu, 0);
    semua.set(dua, satu.length);
    semua.set(Uint8Array.of(0xd0, 0), satu.length + dua.length);
    const p = new PenguraiMqtt();
    const hasil = [...p.tambah(semua.subarray(0, 3)), ...p.tambah(semua.subarray(3, 50000)), ...p.tambah(semua.subarray(50000))];
    expect(hasil.map((x) => x.jenis)).toEqual(['publish', 'publish', 'pingresp']);
    const a = hasil[0];
    expect(a.jenis === 'publish' && a.topik).toBe('undercover-hn/r1/x/h');
    expect(a.jenis === 'publish' && Array.from(a.data)).toEqual(Array.from(data));
    expect(PAKET_PING).toEqual(Uint8Array.of(0xc0, 0));
  });

  it('CONNACK ditolak atau diterima terbaca kodenya', () => {
    const p = new PenguraiMqtt();
    expect(p.tambah(Uint8Array.of(0x20, 2, 0, 5))).toEqual([{ jenis: 'connack', kode: 5 }]);
  });
});

/* --------------------------------- Kripto -------------------------------- */

describe('enkripsi room', () => {
  it('pulang-pergi AES-GCM, kunci room lain gagal (null), topik tidak memuat kode', async () => {
    const k = await turunkanKunciRoom('ABCDE', ITER);
    const k2 = await turunkanKunciRoom('abcde', ITER);
    const lain = await turunkanKunciRoom('ABCDF', ITER);
    expect(k.topik).toBe(k2.topik);
    expect(k.topik).not.toBe(lain.topik);
    expect(k.topik.toUpperCase()).not.toContain('ABCDE');
    expect(topikHost(k)).toMatch(/^undercover-hn\/r1\/[0-9a-f]{32}\/h$/);
    const isi = { t: 'view', kata: 'Bakso rahasia' };
    const data = await sandikan(k.kunci, isi);
    expect(new TextDecoder().decode(data)).not.toContain('Bakso');
    expect(await bukaSandi(k2.kunci, data)).toEqual(isi);
    expect(await bukaSandi(lain.kunci, data)).toBeNull();
    const rusak = data.slice();
    rusak[20] ^= 1;
    expect(await bukaSandi(k.kunci, rusak)).toBeNull();
    expect(await bukaSandi(k.kunci, Uint8Array.of(1, 2))).toBeNull();
    expect(idPesan(data)).toHaveLength(24);
    expect(idPesan(await sandikan(k.kunci, isi))).not.toBe(idPesan(data));
  });

  it('id relay acak 16 hex', () => {
    expect(buatIdRelay()).toMatch(/^[0-9a-f]{16}$/);
    expect(buatIdRelay()).not.toBe(buatIdRelay());
  });
});

describe('PenyaringDuplikat', () => {
  it('menolak id yang sama, lupa yang terlama saat penuh', () => {
    const s = new PenyaringDuplikat(3);
    expect(s.baru('a')).toBe(true);
    expect(s.baru('a')).toBe(false);
    s.baru('b');
    s.baru('c');
    s.baru('d');
    expect(s.baru('b')).toBe(false);
    expect(s.baru('a')).toBe(true);
  });
});

describe('daftar broker', () => {
  it('maksimal 5 broker, semua WSS', () => {
    expect(BROKER_RELAY.length).toBeGreaterThanOrEqual(2);
    expect(BROKER_RELAY.length).toBeLessThanOrEqual(5);
    for (const b of BROKER_RELAY) expect(b.url.startsWith('wss://')).toBe(true);
  });
});

/* ------------------------------ Multi-broker ----------------------------- */

describe('RelayMulti', () => {
  it('pesan dikirim ke semua broker tapi diterima sekali, dan tetap jalan saat satu broker mati', async () => {
    const { broker, daftar, buatSoket } = jaringanTiruan(3);
    broker[2].mati = true; // satu broker sudah mati dari awal
    const k = await turunkanKunciRoom('QWERT', ITER);
    const masukA: unknown[] = [];
    const masukB: unknown[] = [];
    const a = new RelayMulti(k, (x) => masukA.push(x), () => {}, daftar, buatSoket);
    const b = new RelayMulti(k, (x) => masukB.push(x), () => {}, daftar, buatSoket);
    a.mulai(topikHost(k));
    b.mulai(topikKlien(k, 'b1'));
    await tunggu(() => a.jumlah() === 2 && b.jumlah() === 2);
    await new Promise((r) => setTimeout(r, 20)); // SUBACK
    expect(await b.kirim(topikHost(k), { n: 1 })).toBe(true);
    await tunggu(() => masukA.length === 1);
    expect(broker[0].terbit + broker[1].terbit).toBe(2);
    await new Promise((r) => setTimeout(r, 30));
    expect(masukA).toEqual([{ n: 1 }]);

    broker[0].matikan();
    await tunggu(() => a.jumlah() === 1);
    expect(await a.kirim(topikKlien(k, 'b1'), { n: 2 })).toBe(true);
    await tunggu(() => masukB.length === 1);
    expect(masukB).toEqual([{ n: 2 }]);
    // Gema pesan sendiri tidak diproses.
    expect(masukA).toEqual([{ n: 1 }]);

    broker[1].matikan();
    await tunggu(() => a.jumlah() === 0);
    expect(await a.kirim(topikKlien(k, 'b1'), { n: 3 })).toBe(false);
    a.hentikan();
    b.hentikan();
  });

  it('KlienMqtt menyambung ulang dan berlangganan ulang setelah broker hidup lagi', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      const { broker, buatSoket } = jaringanTiruan(1);
      const masuk: string[] = [];
      const siap: boolean[] = [];
      const k = new KlienMqtt({ url: broker[0].url }, (t) => masuk.push(t), (s) => siap.push(s), buatSoket);
      k.langgan('x/1');
      k.mulai();
      await vi.advanceTimersByTimeAsync(20);
      expect(k.siap).toBe(true);
      broker[0].matikan();
      await vi.advanceTimersByTimeAsync(20);
      expect(k.siap).toBe(false);
      broker[0].mati = false;
      await vi.advanceTimersByTimeAsync(4000);
      expect(k.siap).toBe(true);
      expect(siap).toEqual([true, false, true]);
      const lain = new KlienMqtt({ url: broker[0].url }, () => {}, () => {}, buatSoket);
      lain.mulai();
      await vi.advanceTimersByTimeAsync(20);
      lain.terbit('x/1', Uint8Array.of(9));
      await vi.advanceTimersByTimeAsync(20);
      expect(masuk).toEqual(['x/1']);
      k.hentikan();
      lain.hentikan();
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ------------------------------ Keputusan jalur ----------------------------- */

describe('keputusan pindah ke relay', () => {
  it('pindah saat dipaksa, saat galat jaringan/PeerJS, atau saat jalur langsung tak terbuka tepat waktu', () => {
    expect(perluRelay({ lamaMs: 0, adaView: false, paksaRelay: true })).toBe(true);
    expect(perluRelay({ lamaMs: 0, adaView: false })).toBe(false);
    expect(perluRelay({ lamaMs: BATAS_LANGSUNG_MS - 1, adaView: false })).toBe(false);
    expect(perluRelay({ lamaMs: BATAS_LANGSUNG_MS, adaView: false })).toBe(true);
    for (const g of ['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible', 'peer-unavailable', 'webrtc']) {
      expect(perluRelay({ lamaMs: 0, galat: g, adaView: false })).toBe(true);
    }
    expect(perluRelay({ lamaMs: 0, galat: 'disconnected', adaView: false })).toBe(false);
    // Koneksi langsung yang sedang hidup tidak dipindah.
    expect(perluRelay({ lamaMs: 60000, galat: 'network', adaView: true })).toBe(false);
  });

  it('batas jalur langsung memberi relay waktu sebelum layar macet 15 detik', () => {
    expect(BATAS_LANGSUNG_MS).toBeLessThanOrEqual(10000);
  });

  it('status host terbuka jika salah satu jalur siap; bentrok kode tetap dilaporkan', () => {
    const s: StatusJaringan[] = ['menyambung', 'menyambungUlang', 'gagal', 'hostTidakAda'];
    for (const x of s) {
      expect(statusHostGabungan(x, 0)).toBe(x);
      expect(statusHostGabungan(x, 2)).toBe('tersambung');
    }
    expect(statusHostGabungan('tersambung', 0)).toBe('tersambung');
    expect(statusHostGabungan('idDipakai', 5)).toBe('idDipakai');
  });

  it('teks indikator dan flag paksa relay', () => {
    expect(teksJalur('langsung')).toBe('Langsung');
    expect(teksJalur('relay')).toBe('Lewat relay');
    expect(paksaRelayDari('?jalur=relay', null)).toBe(true);
    expect(paksaRelayDari('', 'relay')).toBe(true);
    expect(paksaRelayDari('?x=1', null)).toBe(false);
  });

  it('pesan macet khusus relay', () => {
    expect(pesanMacet(false, 'ABCDE', 'hostTidakAda', 'relay')).toContain('relay');
    expect(pesanMacet(false, 'ABCDE', 'menyambungUlang', 'relay-putus')).toContain('relay');
    expect(pesanMacet(false, 'ABCDE', 'hostTidakAda', 'relay')).not.toContain('\u2014');
  });
});

/* ------------------------ Host + 2 pemain lewat relay ------------------------ */

describe('HostRoom dan KlienRoom lewat relay (tanpa WebRTC)', () => {
  const dihentikan: { hentikan(): void }[] = [];
  afterEach(() => {
    for (const x of dihentikan.splice(0)) x.hentikan();
  });

  it('gabung, main satu aksi, ambil alih sesi, dan keluar, semuanya lewat 2 broker (1 mati)', async () => {
    const { broker, daftar, buatSoket } = jaringanTiruan(3);
    broker[1].mati = true;
    const opsi = { paksaRelay: true, broker: daftar, buatSoket };
    const state = buatStateHost('RELAY', 'h', 'Host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'] }, Date.now());
    const statusHost: StatusJaringan[] = [];
    let stateHost = state;
    const host = new HostRoom(state, { onState: (s) => (stateHost = s), onStatus: (s) => statusHost.push(s) }, opsi);
    dihentikan.push(host);
    await host.mulai();
    await tunggu(() => statusHost.includes('tersambung'));

    const buatPemain = (id: string, nama: string) => {
      const v: { view: ViewPemain | null; status: string[]; jalur: string[]; diganti: string | null } = { view: null, status: [], jalur: [], diganti: null };
      const k = new KlienRoom('relay', { id, nama, token: 't-' + id }, {
        onView: (x) => (v.view = x),
        onStatus: (s, info) => v.status.push(`${s}:${info ?? ''}`),
        onTolak: () => {},
        onJalur: (j) => v.jalur.push(j),
        onDiganti: (a) => (v.diganti = a),
      }, opsi);
      dihentikan.push(k);
      return { k, v };
    };
    const a = buatPemain('p1', 'Ani');
    const b = buatPemain('p2', 'Budi');
    await a.k.mulai();
    await b.k.mulai();
    await tunggu(() => a.v.view?.pemain.length === 3 && b.v.view?.pemain.length === 3);
    expect(a.v.jalur).toEqual(['relay']);
    expect(a.v.status).toContain('tersambung:relay');
    expect(a.k.jalur).toBe('relay');

    const r = host.dispatch({ jenis: 'mulai', pasangan: { civilian: 'Kopi', undercover: 'Teh', sumber: 'Uji' }, dari: 'h' });
    expect(r).toBeUndefined();
    await tunggu(() => !!a.v.view?.game && !!b.v.view?.game);
    // Hanya kata sendiri yang terlihat.
    expect([a.v.view?.game?.kata, b.v.view?.game?.kata].every((x) => x === 'Kopi' || x === 'Teh')).toBe(true);
    expect(a.k.kirim({ jenis: 'siap' })).toBe(true);
    await tunggu(() => stateHost.game?.siap.includes('p1') === true);
    await tunggu(() => b.v.view?.game?.siap.includes('p1') === true);

    // Broker lain mati di tengah permainan: tetap jalan lewat broker tersisa.
    broker[0].matikan();
    expect(b.k.kirim({ jenis: 'siap' })).toBe(true);
    await tunggu(() => a.v.view?.game?.siap.includes('p2') === true);

    // Tab kedua dengan id p1 mengambil alih; tab lama diberi tahu dan berhenti.
    const a2 = buatPemain('p1', 'Ani');
    await a2.k.mulai();
    await tunggu(() => a.v.diganti !== null && !!a2.v.view);
    expect(a2.v.view?.saya).toBe('p1');

    // Keluar menutup saluran relay segera (pemain ditandai offline tanpa menunggu senyap).
    b.k.hentikan();
    await tunggu(() => stateHost.pemain.find((p) => p.id === 'p2')?.online === false);
  }, 20000);
});
