import { afterEach, describe, expect, it, vi } from 'vitest';
import { BATAS_SENYAP_RELAY_MS, INTERVAL_PING_RELAY_MS, teksDiagnosa } from '../lib/online/jalur';
import { HostRoom, KlienRoom } from '../lib/online/jaringan';
import { dariBase64, iceDariWelcome, INTERVAL_CEK_MS, keBase64, KlienMetered, type PembuatSoketTeks, type SoketTeks } from '../lib/online/metered';
import { daftarPengangkut, RelayMulti, topikHost, topikKlien, turunkanKunciRoom } from '../lib/online/relay';
import { buatStateHost } from '../lib/online/host';
import { BATAS_OFFLINE_MS, type ViewPemain } from '../lib/online/types';

const ITER = 1000;
const KUNCI_UJI = 'pk_live_uji';

/* --------------------------- Server Metered tiruan --------------------------- */

interface Bingkai { type: string; [k: string]: unknown }

class MeteredTiruan {
  mati = false;
  /** Saat true, server berhenti menjawab apa pun (koneksi setengah mati). */
  bisu = false;
  koneksi = new Set<SoketTeksTiruan>();
  publish = 0;
  terakhirUrl = '';
  constructor(public ice: RTCIceServer[] | null = null, public tutupDengan: number | null = null) {}

  buat: PembuatSoketTeks = (url) => {
    this.terakhirUrl = url;
    const s = new SoketTeksTiruan(this);
    setTimeout(() => {
      if (this.mati) {
        s.readyState = 3;
        s.onerror?.({});
        s.onclose?.({ code: 1006 });
        return;
      }
      if (this.tutupDengan) {
        s.readyState = 3;
        s.onclose?.({ code: this.tutupDengan });
        return;
      }
      s.readyState = 1;
      this.koneksi.add(s);
      s.onopen?.({});
      s.balas({ type: 'welcome', peerId: 'peer_pk_x', expiresAt: null, serverTime: 0, maxMessageSize: 65536, ...(this.ice ? { metadata: { iceServers: this.ice } } : {}) });
    }, 1);
    return s;
  };

  terima(s: SoketTeksTiruan, m: Bingkai): void {
    if (this.mati || this.bisu) return;
    if (m.type === 'subscribe') {
      s.langganan.add(String(m.channel));
      s.balas({ type: 'presence', channel: m.channel, joined: [], left: [] });
    } else if (m.type === 'unsubscribe') {
      s.langganan.delete(String(m.channel));
      if (m.requestId) s.balas({ type: 'ack', requestId: m.requestId, ok: true });
    } else if (m.type === 'publish') {
      this.publish++;
      for (const k of this.koneksi) if (k !== s && k.langganan.has(String(m.channel))) k.balas({ type: 'message', channel: m.channel, from: 'x', data: m.data });
      if (m.requestId) s.balas({ type: 'ack', requestId: m.requestId, ok: true });
    }
  }

  matikan(kode = 1006): void {
    for (const k of [...this.koneksi]) k.tutupServer(kode);
  }
}

class SoketTeksTiruan implements SoketTeks {
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  langganan = new Set<string>();
  terkirim: Bingkai[] = [];
  constructor(private server: MeteredTiruan) {}
  send(data: string): void {
    if (this.readyState !== 1) throw new Error('belum terbuka');
    const m = JSON.parse(data) as Bingkai;
    this.terkirim.push(m);
    setTimeout(() => this.server.terima(this, m), 1);
  }
  balas(m: unknown): void {
    const t = JSON.stringify(m);
    setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: t }), 1);
  }
  tutupServer(kode: number): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.server.koneksi.delete(this);
    setTimeout(() => this.onclose?.({ code: kode }), 1);
  }
  close(): void {
    this.tutupServer(1000);
  }
}

const tunggu = async (cek: () => boolean, ms = 5000) => {
  const akhir = Date.now() + ms;
  while (!cek()) {
    if (Date.now() > akhir) throw new Error('waktu habis');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/* -------------------------------- KlienMetered ------------------------------- */

describe('KlienMetered', () => {
  it('base64 bolak-balik untuk data biner, termasuk yang besar', () => {
    const b = new Uint8Array(70000).map((_, i) => (i * 31) % 256);
    expect(dariBase64(keBase64(b))).toEqual(b);
  });

  it('iceServers dari welcome hanya diambil bila bentuknya benar', () => {
    expect(iceDariWelcome({ type: 'welcome' })).toEqual([]);
    expect(iceDariWelcome({ metadata: { iceServers: [{ urls: 'turn:a', username: 'u', credential: 'c' }, { urls: 5 }, null] } })).toEqual([{ urls: 'turn:a', username: 'u', credential: 'c' }]);
  });

  it('subscribe setelah welcome, publish sebagai base64, kunci lewat query, pengirim tidak menerima gema', async () => {
    const srv = new MeteredTiruan([{ urls: ['turn:t.test:80'], username: 'u', credential: 'c' }]);
    const masukA: Array<[string, Uint8Array]> = [];
    const masukB: Array<[string, Uint8Array]> = [];
    const a = new KlienMetered(KUNCI_UJI, (t, d) => masukA.push([t, d]), () => {}, srv.buat);
    const b = new KlienMetered(KUNCI_UJI, (t, d) => masukB.push([t, d]), () => {}, srv.buat);
    a.langgan('uc/h');
    b.langgan('uc/h');
    a.mulai();
    b.mulai();
    expect(await a.tungguWelcome(1000)).toEqual([{ urls: ['turn:t.test:80'], username: 'u', credential: 'c' }]);
    await tunggu(() => a.siap && b.siap);
    expect(srv.terakhirUrl).toBe('wss://rms.metered.ca/v1?key=pk_live_uji');
    await new Promise((r) => setTimeout(r, 20));
    expect(a.terbit('uc/h', Uint8Array.of(1, 2, 255))).toBe(true);
    await tunggu(() => masukB.length === 1);
    expect(masukB[0][0]).toBe('uc/h');
    expect(Array.from(masukB[0][1])).toEqual([1, 2, 255]);
    await new Promise((r) => setTimeout(r, 20));
    expect(masukA).toEqual([]);
    expect(a.terkirim).toBe(1);
    expect(a.keadaan()).toBe('tersambung');
    a.hentikan();
    b.hentikan();
  });

  it('tidak menyambung ulang bila kunci ditolak (4001), dan alasannya terlihat', async () => {
    const srv = new MeteredTiruan(null, 4001);
    const k = new KlienMetered(KUNCI_UJI, () => {}, () => {}, srv.buat);
    k.mulai();
    expect(await k.tungguWelcome(1000)).toEqual([]);
    await tunggu(() => k.keadaan().startsWith('ditolak'));
    expect(k.keadaan()).toBe('ditolak (tutup 4001)');
    expect(k.adaWelcome()).toBe(false);
  });

  it('menyambung ulang setelah putus dan berlangganan ulang; koneksi bisu terdeteksi lewat cek gratis', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      const srv = new MeteredTiruan();
      const siap: boolean[] = [];
      const k = new KlienMetered(KUNCI_UJI, () => {}, (s) => siap.push(s), srv.buat);
      k.langgan('uc/k/1');
      k.mulai();
      await vi.advanceTimersByTimeAsync(20);
      expect(k.siap).toBe(true);
      srv.matikan(1006);
      await vi.advanceTimersByTimeAsync(20);
      expect(k.siap).toBe(false);
      expect(k.keadaan()).toBe('menyambung (tutup 1006)');
      await vi.advanceTimersByTimeAsync(2000);
      expect(k.siap).toBe(true);
      expect([...srv.koneksi][0].langganan.has('uc/k/1')).toBe(true);
      // Cek hidup memakai unsubscribe (tidak dihitung kuota), bukan publish.
      await vi.advanceTimersByTimeAsync(INTERVAL_CEK_MS + 50);
      expect(srv.publish).toBe(0);
      expect(k.siap).toBe(true);
      srv.bisu = true;
      await vi.advanceTimersByTimeAsync(INTERVAL_CEK_MS + 11000);
      // Koneksi bisu diputus sendiri lalu disambung ulang.
      expect(siap.slice(0, 4)).toEqual([true, false, true, false]);
      srv.bisu = false;
      await vi.advanceTimersByTimeAsync(5000);
      expect(k.siap).toBe(true);
      k.hentikan();
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ------------------------- RelayMulti dengan Metered ------------------------- */

describe('RelayMulti dengan Metered', () => {
  it('Metered di urutan pertama, MQTT tetap ikut; ringkasan menunjukkan jalur yang mengantar', async () => {
    const srv = new MeteredTiruan();
    const k = await turunkanKunciRoom('METER', ITER);
    const masuk: unknown[] = [];
    const opsi = { kunciMetered: KUNCI_UJI, buatSoketMetered: srv.buat, broker: [] };
    const a = new RelayMulti(k, (x) => masuk.push(x), () => {}, daftarPengangkut(opsi));
    const b = new RelayMulti(k, () => {}, () => {}, daftarPengangkut(opsi));
    a.mulai(topikHost(k));
    b.mulai(topikKlien(k, 'b1'));
    await tunggu(() => a.jumlah() === 1 && b.jumlah() === 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(await b.kirim(topikHost(k), { n: 1 })).toBe(true);
    await tunggu(() => masuk.length === 1);
    expect(masuk).toEqual([{ n: 1 }]);
    expect(a.ringkasan()).toMatchObject({ metered: 'tersambung', mqttSiap: 0, mqttTotal: 0, masuk: { Metered: 1 } });
    expect(b.ringkasan().terbitMetered).toBe(1);
    // Isi di server Metered terenkripsi: tidak memuat teks asli.
    const bingkai = [...srv.koneksi].flatMap((s) => s.terkirim).find((m) => m.type === 'publish');
    expect(String(bingkai?.channel)).toMatch(/^undercover-hn\/r1\/[0-9a-f]{32}\/h$/);
    expect(atob(String(bingkai?.data))).not.toContain('"n"');
    a.hentikan();
    b.hentikan();
  });

  it('tanpa kunci Metered, atau dengan soket MQTT tiruan saja, Metered tidak dipakai', () => {
    expect(daftarPengangkut({ kunciMetered: '', broker: [] })).toHaveLength(0);
    expect(daftarPengangkut({ buatSoket: () => { throw new Error('x'); }, broker: [{ url: 'wss://a.test' }] })).toHaveLength(1);
    expect(daftarPengangkut({ kunciMetered: KUNCI_UJI, mode: 'mqtt', broker: [{ url: 'wss://a.test' }] })).toHaveLength(1);
    expect(daftarPengangkut({ kunciMetered: KUNCI_UJI, mode: 'metered' })).toHaveLength(1);
  });
});

/* ------------------------------ Teks diagnosa ------------------------------ */

describe('teks diagnosa layar Coba lagi', () => {
  it('mencantumkan jalur Langsung, Metered, MQTT, TURN, dan Host tanpa tanda pisah panjang', () => {
    const t = teksDiagnosa({
      langsung: 'gagal (peer-unavailable)',
      turn: false,
      relay: { metered: 'tersambung', mqttSiap: 3, mqttTotal: 5, masuk: { Metered: 2, 'a.test': 1 }, terbitMetered: 4 },
      host: 'belum menjawab lewat relay',
    });
    expect(t).toEqual([
      'Langsung: gagal (peer-unavailable)',
      'Metered: tersambung, 2 pesan masuk',
      'MQTT: 3/5 broker, 1 pesan masuk',
      'TURN: tidak ada',
      'Host: belum menjawab lewat relay',
    ]);
    for (const b of t) expect(b).not.toMatch(/[\u2013\u2014]/);
    expect(teksDiagnosa({ langsung: 'menyiapkan', turn: null, relay: null })).toContain('Metered: belum dimulai');
  });
});

/* ------------------------- Host + 2 pemain lewat Metered ------------------------- */

describe('HostRoom dan KlienRoom hanya lewat Metered', () => {
  const dihentikan: { hentikan(): void }[] = [];
  afterEach(() => {
    for (const x of dihentikan.splice(0)) x.hentikan();
  });

  it('gabung dan main lewat Metered saja; saat diam, volume pesan rendah dan pemain tetap online', async () => {
    // Jam palsu yang tetap berjalan seiring waktu nyata, supaya interval ping ikut terkendali.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], shouldAdvanceTime: true });
    try {
      const srv = new MeteredTiruan();
      const opsi = { paksaRelay: true, modeRelay: 'metered' as const, kunciMetered: KUNCI_UJI, buatSoketMetered: srv.buat };
      const state = buatStateHost('METRD', 'h', 'Host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'] }, Date.now());
      let stateHost = state;
      const statusHost: string[] = [];
      const host = new HostRoom(state, { onState: (s) => (stateHost = s), onStatus: (s) => statusHost.push(s) }, opsi);
      dihentikan.push(host);
      await host.mulai();
      await tunggu(() => statusHost.includes('tersambung'));
      const pemain = ['p1', 'p2'].map((id) => {
        const v: { view: ViewPemain | null } = { view: null };
        const k = new KlienRoom('metrd', { id, nama: 'N' + id, token: 't' + id }, { onView: (x) => (v.view = x), onStatus: () => {}, onTolak: () => {} }, opsi);
        dihentikan.push(k);
        return { k, v };
      });
      for (const p of pemain) await p.k.mulai();
      await tunggu(() => pemain.every((p) => p.v.view?.pemain.length === 3), 10000);
      expect(host.diagnosa().relay?.metered).toBe('tersambung');
      expect(pemain[0].k.diagnosa().relay?.masuk.Metered).toBeGreaterThan(0);
      expect(teksDiagnosa(pemain[0].k.diagnosa())).toContain('Host: menjawab');
      host.dispatch({ jenis: 'mulai', pasangan: { civilian: 'Kopi', undercover: 'Teh', sumber: 'Uji' }, dari: 'h' });
      await tunggu(() => pemain.every((p) => !!p.v.view?.game));
      expect(pemain[0].k.kirim({ jenis: 'siap' })).toBe(true);
      await tunggu(() => stateHost.game?.siap.includes('p1') === true);

      // Diam 45 detik: ping relay tiap 10 detik, pemain tetap online melewati batas offline umum.
      {
        const awal = srv.publish;
        for (let i = 0; i < 45; i++) {
          await vi.advanceTimersByTimeAsync(1000);
          for (let j = 0; j < 3; j++) await new Promise((r) => setImmediate(r));
        }
        const per45 = srv.publish - awal;
        // 2 pemain x (4-5 ping + 4-5 pong) per 45 detik; jalur langsung dulu 15 ping + 15 pong per pemain.
        expect(per45).toBeGreaterThanOrEqual(8);
        expect(per45).toBeLessThanOrEqual(26);
        expect(45000).toBeGreaterThan(BATAS_OFFLINE_MS);
        expect(stateHost.pemain.filter((p) => p.id !== 'h').every((p) => p.online)).toBe(true);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(INTERVAL_PING_RELAY_MS).toBeGreaterThanOrEqual(10000);
    expect(BATAS_SENYAP_RELAY_MS).toBeGreaterThan(INTERVAL_PING_RELAY_MS * 2);
  }, 30000);
});
