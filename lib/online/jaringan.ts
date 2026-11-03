// Lapisan jaringan mode online. Hanya berjalan di browser.
// Topologi bintang: setiap pemain tersambung ke HP host lewat salah satu jalur:
// - "Langsung": WebRTC P2P (PeerJS). Broker publik 0.peerjs.com hanya untuk saling menemukan (signaling).
// - "Lewat relay": Metered Realtime (utama) plus beberapa broker MQTT publik (lihat relay.ts), saat jalur langsung
//   tidak bisa terbuka. Pemain menyiapkan relay sejak awal agar peralihan nyaris seketika.
// Host mendengarkan kedua jalur sejak awal; logika room (gabung, ambil alih sesi, chat) sama untuk keduanya.
// Welcome Metered juga bisa membawa server TURN (bila layanan TURN aktif di akun Metered); dipakai untuk WebRTC.
import type { DataConnection, Peer as PeerT, PeerOptions } from 'peerjs';
import { buatStateChat, gabungChat, GALAT_CHAT_CEPAT, lajuKlien, terimaChat, type PesanChat } from './chat';
import { rapikanAksiPemain, reduceHost, viewUntuk } from './host';
import { CEK_NEGOSIASI_MS, ICE_SERVERS, nasibNegosiasi, TUNGGU_AWAL_MS } from './ice';
import {
  BATAS_SENYAP_HOST_RELAY_MS, BATAS_SENYAP_RELAY_MS, INTERVAL_PING_RELAY_MS, JEDA_PONG_RELAY_MS, jedaHaloRelay, perluRelay,
  statusHostGabungan, TUNGGU_TURN_MS, type Diagnosa, type Jalur,
} from './jalur';
import type { PembuatSoketTeks } from './metered';
import type { Broker, PembuatSoket } from './mqtt';
import {
  buatIdRelay, daftarPengangkut, RelayMulti, topikHost, topikKlien, turunkanKunciRoom,
  type AmplopKeHost, type KunciRoom, type ModeRelay, type PembuatPengangkut,
} from './relay';
import { peerIdHost } from './room';
import {
  INTERVAL_PING_MS, VERSI_PROTOKOL,
  type Aksi, type AksiPemain, type PesanKeHost, type PesanKeKlien, type StateHost, type ViewPemain,
} from './types';

/** Hanya STUN publik gratis (lihat ice.ts). `config` PeerJS MENGGANTI default-nya, jadi daftar ini lengkap. */
export const OPSI_PEER: PeerOptions = {
  debug: 0,
  config: { iceServers: ICE_SERVERS },
};

/** Klien (jalur langsung) menganggap host hilang jika tidak ada pesan selama ini, lalu menyambung ulang. */
export const BATAS_SENYAP_HOST_MS = 8000;
const JEDA_ULANG_MS = 2500;

/** Dikirim ke koneksi lama saat id pemain yang sama tersambung dari tab atau HP lain. */
export const PESAN_SESI_DIGANTI = 'Sesi ini sekarang dipakai di tab atau HP lain. Untuk ikut sebagai pemain baru, gabung dengan nama berbeda.';

export type StatusJaringan = 'menyambung' | 'tersambung' | 'menyambungUlang' | 'hostTidakAda' | 'idDipakai' | 'gagal';

/** Satu jalur ke satu pemain, dilihat dari host. Sama untuk koneksi langsung maupun relay. */
export interface Saluran {
  readonly jalur: Jalur;
  terbuka(): boolean;
  kirim(p: PesanKeKlien): void;
  tutup(): void;
}

function saluranPeer(conn: DataConnection): Saluran {
  return {
    jalur: 'langsung',
    terbuka: () => conn.open,
    kirim: (p) => {
      try {
        if (conn.open) void conn.send(p);
      } catch {
        // Koneksi sedang putus; akan dikirim ulang saat tersambung lagi.
      }
    },
    tutup: () => conn.close({ flush: true }),
  };
}

export interface OpsiJaringan {
  /** Lewati WebRTC sama sekali (uji/diagnosis jalur relay). */
  paksaRelay?: boolean;
  /** Jalur relay yang dipakai: semua (bawaan), hanya Metered, atau hanya MQTT. */
  modeRelay?: ModeRelay;
  /** Untuk pengujian: daftar broker dan pembuat soket tiruan. */
  broker?: Broker[];
  buatSoket?: PembuatSoket;
  kunciMetered?: string;
  buatSoketMetered?: PembuatSoketTeks;
  /** Untuk pengujian: daftar jalur relay lengkap (mengganti semua opsi di atas). */
  pengangkut?: PembuatPengangkut[];
}

function pengangkutDari(o: OpsiJaringan): PembuatPengangkut[] {
  return o.pengangkut ?? daftarPengangkut({ mode: o.modeRelay, kunciMetered: o.kunciMetered, broker: o.broker, buatSoket: o.buatSoket, buatSoketMetered: o.buatSoketMetered });
}

async function buatPeer(id?: string, turn: RTCIceServer[] = []): Promise<PeerT> {
  const { Peer } = await import('peerjs');
  const opsi: PeerOptions = turn.length ? { ...OPSI_PEER, config: { iceServers: [...ICE_SERVERS, ...turn] } } : OPSI_PEER;
  return id ? new Peer(id, opsi) : new Peer(opsi);
}

const KUNCI_ADA_TURN = 'online:turn';

/** Sesi sebelumnya mendapat TURN dari Metered? (agar tidak menunggu welcome bila memang tidak ada TURN) */
function pernahAdaTurn(): boolean {
  try {
    return globalThis.localStorage?.getItem(KUNCI_ADA_TURN) !== '0';
  } catch {
    return true;
  }
}

function ingatTurn(ada: boolean): void {
  try {
    globalThis.localStorage?.setItem(KUNCI_ADA_TURN, ada ? '1' : '0');
  } catch {
    // abaikan
  }
}

/** Ambil server TURN dari welcome Metered (tunggu sebentar bila belum datang). Kosong jika tidak ada. */
async function ambilTurn(relay: RelayMulti | null): Promise<RTCIceServer[]> {
  const m = relay?.metered;
  if (!m) return [];
  if (m.iceServers) return m.iceServers;
  if (!pernahAdaTurn()) {
    // Tidak menunggu, tapi tetap catat hasil welcome nanti untuk sesi berikutnya.
    void m.tungguWelcome(30000).then((ice) => {
      if (m.adaWelcome()) ingatTurn(ice.length > 0);
    });
    return [];
  }
  const ice = await m.tungguWelcome(TUNGGU_TURN_MS);
  if (m.adaWelcome()) ingatTurn(ice.length > 0);
  return ice;
}

function turnDari(relay: RelayMulti | null): boolean | null {
  const ice = relay?.metered?.iceServers;
  return ice ? ice.length > 0 : null;
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
  private koneksi = new Map<string, Saluran>();
  private pemilikKoneksi = new Map<Saluran, string>();
  private relay: RelayMulti | null = null;
  private kunciRelay: KunciRoom | null = null;
  private siapRelay: Promise<void> = Promise.resolve();
  private turn: RTCIceServer[] = [];
  private saluranRelay = new Map<string, { s: Saluran; terakhir: number; kirimTerakhir: number }>();
  private statusLangsung: { s: StatusJaringan; info?: string } = { s: 'menyambung' };
  private brokerRelay = 0;
  private terkirim = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Pemicu tepat waktu untuk tenggat langkah saat ini (tick 2 detik tetap jadi cadangan). */
  private timerTenggat: ReturnType<typeof setTimeout> | null = null;
  private tenggatTerjadwal: string | null = null;
  private selesai = false;
  private percobaan = 0;
  /** Chat hanya di memori: hilang saat room ditutup atau HP host refresh. */
  private chat = buatStateChat();

  constructor(public state: StateHost, private dengar: PendengarHost, private opsi: OpsiJaringan = {}) {}

  async mulai(): Promise<void> {
    this.dengar.onStatus('menyambung');
    this.dengar.onState(this.state);
    this.dengar.onChat?.(this.chat.pesan);
    this.timer = setInterval(() => {
      this.kedaluwarsaRelay();
      this.dispatch({ jenis: 'tick' });
    }, 2000);
    this.jadwalkanTenggat();
    this.siapRelay = this.mulaiRelay();
    if (this.opsi.paksaRelay) return;
    // Relay gagal disiapkan (mis. crypto.subtle tidak ada di http biasa): jalur langsung tetap jalan.
    await this.siapRelay.catch(() => {});
    this.turn = await ambilTurn(this.relay);
    await this.sambung();
  }

  /** Status ke UI: room terbuka bila jalur langsung ATAU minimal satu broker relay siap. */
  private ubahLangsung(s: StatusJaringan, info?: string): void {
    this.statusLangsung = { s, info };
    this.laporStatus();
  }

  private laporStatus(): void {
    if (this.selesai) return;
    const s = statusHostGabungan(this.statusLangsung.s, this.brokerRelay);
    this.dengar.onStatus(s, s === this.statusLangsung.s ? this.statusLangsung.info : undefined);
  }

  /** Dengarkan topik host di semua broker relay sejak awal, agar pemain bisa gabung walau WebRTC/PeerJS mati. */
  private async mulaiRelay(): Promise<void> {
    const kunci = await turunkanKunciRoom(this.state.kode);
    if (this.selesai) return;
    this.kunciRelay = kunci;
    this.relay = new RelayMulti(kunci, (isi) => this.terimaRelay(isi), (n) => {
      this.brokerRelay = n;
      this.laporStatus();
    }, pengangkutDari(this.opsi));
    this.relay.mulai(topikHost(kunci));
  }

  private terimaRelay(isi: unknown): void {
    const a = isi as AmplopKeHost;
    if (!a || typeof a !== 'object' || typeof a.f !== 'string' || !/^[0-9a-f]{8,32}$/.test(a.f)) return;
    let e = this.saluranRelay.get(a.f);
    if (a.tutup) {
      e?.s.tutup();
      return;
    }
    if (!e) {
      const rid = a.f;
      const relay = this.relay;
      const kunci = this.kunciRelay;
      if (!relay || !kunci) return;
      const s: Saluran = {
        jalur: 'relay',
        terbuka: () => this.saluranRelay.get(rid)?.s === s && this.brokerRelay > 0,
        kirim: (p) => {
          const masuk = this.saluranRelay.get(rid);
          const t = Date.now();
          // Hemat kuota: pesan apa pun dari host sudah cukup sebagai tanda hidup, pong tidak perlu.
          if (p.t === 'pong' && masuk && t - masuk.kirimTerakhir < JEDA_PONG_RELAY_MS) return;
          if (masuk) masuk.kirimTerakhir = t;
          void relay.kirim(topikKlien(kunci, rid), { d: p });
        },
        tutup: () => {
          if (this.saluranRelay.get(rid)?.s === s) this.saluranRelay.delete(rid);
          this.lepasSaluran(s);
        },
      };
      e = { s, terakhir: 0, kirimTerakhir: 0 };
      this.saluranRelay.set(rid, e);
    }
    e.terakhir = Date.now();
    this.terimaPesan(e.s, a.d as PesanKeHost);
  }

  private kedaluwarsaRelay(): void {
    const t = Date.now();
    for (const e of [...this.saluranRelay.values()]) {
      if (t - e.terakhir > BATAS_SENYAP_RELAY_MS) {
        e.s.tutup();
        continue;
      }
      // Pemain relay ping lebih jarang dari batas offline umum; selama saluran relay hidup, anggap terlihat.
      const id = this.pemilikKoneksi.get(e.s);
      if (id && this.koneksi.get(id) === e.s) this.dispatch({ jenis: 'terlihat', id });
    }
  }

  /** Jejak jalur untuk layar "Coba lagi". */
  diagnosa(): Diagnosa {
    const l = this.opsi.paksaRelay ? 'dilewati (mode relay)'
      : this.statusLangsung.s === 'tersambung' ? 'server PeerJS tersambung'
        : this.statusLangsung.s === 'menyambung' ? 'menyambung ke server PeerJS'
          : this.statusLangsung.s === 'idDipakai' ? 'kode masih dipakai sesi lain'
            : `gagal (${this.statusLangsung.info ?? this.statusLangsung.s})`;
    return { langsung: l, turn: turnDari(this.relay), relay: this.relay?.ringkasan() ?? null };
  }

  private async sambung(): Promise<void> {
    if (this.selesai) return;
    const peer = await buatPeer(peerIdHost(this.state.kode), this.turn);
    if (this.selesai) {
      peer.destroy();
      return;
    }
    this.peer = peer;
    peer.on('open', () => {
      this.percobaan = 0;
      this.ubahLangsung('tersambung');
    });
    peer.on('connection', (conn) => this.terimaKoneksi(conn));
    peer.on('disconnected', () => {
      if (this.selesai || peer.destroyed) return;
      this.ubahLangsung('menyambungUlang');
      setTimeout(() => !this.selesai && !peer.destroyed && peer.reconnect(), 1000);
    });
    peer.on('error', (err) => {
      if (this.selesai) return;
      if (err.type === 'unavailable-id') {
        // Biasanya id lama (sebelum refresh) belum dilepas broker. Coba klaim lagi sebentar lagi.
        peer.destroy();
        this.percobaan++;
        this.ubahLangsung('idDipakai', String(this.percobaan));
        setTimeout(() => void this.sambung(), Math.min(10000, 2000 + this.percobaan * 1000));
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
        this.ubahLangsung('menyambungUlang', err.type);
        if (peer.disconnected && !peer.destroyed) setTimeout(() => !this.selesai && !peer.destroyed && peer.reconnect(), JEDA_ULANG_MS);
      } else if (err.type === 'browser-incompatible') {
        this.ubahLangsung('gagal', 'Browser ini tidak mendukung WebRTC.');
      }
    });
  }

  private terimaKoneksi(conn: DataConnection): void {
    const s = saluranPeer(conn);
    conn.on('data', (data) => this.terimaPesan(s, data as PesanKeHost));
    conn.on('close', () => this.lepasSaluran(s));
    conn.on('error', () => this.lepasSaluran(s));
  }

  /** Saluran tertutup (putus, pemain keluar, atau diganti). Pemain ditandai putus hanya jika ini saluran aktifnya. */
  private lepasSaluran(s: Saluran): void {
    const id = this.pemilikKoneksi.get(s);
    this.pemilikKoneksi.delete(s);
    if (id && this.koneksi.get(id) === s) {
      this.koneksi.delete(id);
      this.terkirim.delete(id);
      this.dispatch({ jenis: 'putus', id });
    }
  }

  private kirim(s: Saluran, pesan: PesanKeKlien): void {
    s.kirim(pesan);
  }

  private terimaPesan(conn: Saluran, pesan: PesanKeHost): void {
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
        setTimeout(() => conn.tutup(), 500);
        return;
      }
      const lama = this.koneksi.get(pesan.id);
      if (lama && lama !== conn) {
        this.pemilikKoneksi.delete(lama);
        // Beri tahu koneksi lama agar berhenti. Tanpa ini dua tab dengan id sama saling menendang
        // (tersambung ulang bergantian) sehingga pemain lain terlihat tidak bisa masuk.
        this.kirim(lama, { t: 'tolak', alasan: PESAN_SESI_DIGANTI, ganti: true });
        lama.tutup();
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
      // Teks dikembalikan ke pengirim agar bisa dimasukkan lagi ke kolom input.
      if (tolak) this.kirim(conn, { t: 'tolak', alasan: tolak, chat: true, ...(typeof pesan.teks === 'string' ? { teks: pesan.teks.slice(0, 400) } : {}) });
      return;
    }
    if (pesan.t === 'aksi') {
      this.dispatch({ jenis: 'terlihat', id });
      const aksi = rapikanAksiPemain(pesan.aksi);
      if (!aksi) return;
      const r = reduceHost(this.state, { ...aksi, dari: id }, { now: Date.now() });
      // Galat petunjuk (mis. memuat kata rahasia) hanya dikirim ke pengirimnya.
      if (r.tolak) this.kirim(conn, { t: 'tolak', alasan: r.tolak, ...(aksi.jenis === 'petunjuk' ? { petunjuk: true } : {}) });
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
    this.jadwalkanTenggat();
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
      if (this.terkirim.get(id) === this.state.seq || !conn.terbuka()) continue;
      this.terkirim.set(id, this.state.seq);
      this.kirim(conn, { t: 'view', view: viewUntuk(this.state, id) });
    }
  }

  /** Pasang ulang pemicu hanya jika tenggat berganti; reducer yang memutuskan apakah waktu benar-benar habis. */
  private jadwalkanTenggat(): void {
    const t = this.state.game?.tenggat;
    const kunci = t && !this.selesai ? `${t.kunci}@${t.sampai}` : null;
    if (kunci === this.tenggatTerjadwal) return;
    if (this.timerTenggat) clearTimeout(this.timerTenggat);
    this.timerTenggat = null;
    this.tenggatTerjadwal = kunci;
    if (!t || !kunci) return;
    this.timerTenggat = setTimeout(() => {
      this.timerTenggat = null;
      this.tenggatTerjadwal = null;
      if (!this.selesai) this.dispatch({ jenis: 'tick' });
    }, Math.max(0, t.sampai - Date.now()) + 30);
  }

  hentikan(): void {
    this.selesai = true;
    if (this.timer) clearInterval(this.timer);
    if (this.timerTenggat) clearTimeout(this.timerTenggat);
    for (const c of this.koneksi.values()) c.tutup();
    this.relay?.hentikan();
    this.peer?.destroy();
  }
}

/* ---------------------------------- Klien --------------------------------- */

export interface PendengarKlien {
  onView: (v: ViewPemain) => void;
  onStatus: (s: StatusJaringan, info?: string) => void;
  onTolak: (alasan: string, saatGabung: boolean) => void;
  onChat?: (pesan: PesanChat[]) => void;
  /** Pesan chat ditolak host; `teks` adalah isi pesan yang ditolak (untuk dikembalikan ke kolom input). */
  onTolakChat?: (alasan: string, teks?: string) => void;
  onTolakPetunjuk?: (alasan: string) => void;
  /** Id ini diambil alih koneksi lain (tab atau HP lain). Klien sudah dihentikan. */
  onDiganti?: (alasan: string) => void;
  /** Jalur berpindah (mis. dari langsung ke relay). */
  onJalur?: (j: Jalur) => void;
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
  private lajuChat: number[] = [];
  private mulaiMs = 0;
  /** Jalur aktif. Sekali pindah ke relay, sesi ini tetap di relay (Coba lagi memulai dari jalur langsung). */
  jalur: Jalur = 'langsung';
  private relay: RelayMulti | null = null;
  private kunciRelay: KunciRoom | null = null;
  private readonly rid = buatIdRelay();
  private haloRelayTerakhir = 0;
  private relayMulaiMs = 0;
  private pingRelayTerakhir = 0;
  private siapRelay: Promise<void> | null = null;
  private turn: RTCIceServer[] = [];
  /** Keadaan jalur langsung terakhir untuk diagnosa. */
  private langsung = 'belum dicoba';

  constructor(
    private kode: string,
    private identitas: { id: string; nama: string; token: string },
    private dengar: PendengarKlien,
    private opsi: OpsiJaringan = {},
  ) {}

  async mulai(): Promise<void> {
    this.dengar.onStatus('menyambung');
    this.mulaiMs = Date.now();
    this.timer = setInterval(() => this.detak(), INTERVAL_PING_MS);
    // Relay disiapkan sejak awal (tanpa mengirim apa pun) agar peralihan cepat, dan untuk mengambil TURN dari Metered.
    this.siapkanRelay();
    if (perluRelay({ lamaMs: 0, adaView: false, paksaRelay: this.opsi.paksaRelay })) {
      this.langsung = 'dilewati (mode relay)';
      void this.keRelay();
      return;
    }
    this.langsung = 'menyiapkan';
    await this.siapRelay?.catch(() => {});
    if (this.berhentiLangsung()) return;
    this.turn = await ambilTurn(this.relay);
    if (this.berhentiLangsung()) return;
    this.langsung = 'menyambung ke server PeerJS';
    let peer: PeerT;
    try {
      peer = await buatPeer(undefined, this.turn);
    } catch {
      this.langsung = 'gagal (PeerJS tidak termuat)';
      void this.keRelay();
      return;
    }
    if (this.selesai || this.jalur === 'relay') {
      peer.destroy();
      return;
    }
    this.peer = peer;
    peer.on('open', () => this.hubungi());
    peer.on('disconnected', () => {
      if (!this.selesai && !peer.destroyed && this.jalur === 'langsung') setTimeout(() => !this.selesai && !peer.destroyed && peer.reconnect(), 1000);
    });
    peer.on('error', (err) => {
      if (this.selesai || this.jalur === 'relay') return;
      this.langsung = `gagal (${err.type})`;
      if (perluRelay({ lamaMs: this.lamaTanpaHost(), galat: err.type, adaView: !!this.conn?.open })) {
        void this.keRelay();
      } else if (err.type === 'peer-unavailable') {
        this.dengar.onStatus('hostTidakAda');
        this.ulangNanti(3000);
      } else {
        this.dengar.onStatus('menyambungUlang', err.type);
        this.ulangNanti(JEDA_ULANG_MS);
      }
    });
  }

  /** Jalur langsung tidak perlu dilanjutkan (dihentikan atau sudah pindah ke relay). */
  private berhentiLangsung(): boolean {
    return this.selesai || this.jalur === 'relay';
  }

  /** Lama tanpa data dari host sejak mulai atau pesan terakhir. */
  private lamaTanpaHost(): number {
    return Date.now() - Math.max(this.mulaiMs, this.terakhirDengar);
  }

  private terbuka(): boolean {
    if (this.jalur === 'relay') return !!this.relay && this.relay.jumlah() > 0 && this.sudahView && Date.now() - this.terakhirDengar < BATAS_SENYAP_HOST_RELAY_MS;
    return !!this.conn?.open;
  }

  /** Turunkan kunci room lalu sambungkan jalur relay dan dengarkan topik sendiri. Belum mengirim apa pun. */
  private siapkanRelay(): void {
    if (this.siapRelay) return;
    this.siapRelay = (async () => {
      const kunci = this.kunciRelay ?? await turunkanKunciRoom(this.kode);
      if (this.selesai) return;
      this.kunciRelay = kunci;
      const relay = new RelayMulti(kunci, (isi) => {
        if (this.jalur !== 'relay' || relay !== this.relay) return;
        const d = (isi as { d?: unknown } | null)?.d;
        if (d && typeof d === 'object') this.terima(d as PesanKeKlien);
      }, (n) => {
        if (this.selesai || this.jalur !== 'relay' || relay !== this.relay) return;
        if (n > 0 && !this.sudahView) this.haloRelay(true);
        if (n === 0) this.dengar.onStatus('menyambungUlang', 'relay-putus');
      }, pengangkutDari(this.opsi));
      this.relay = relay;
      relay.mulai(topikKlien(kunci, this.rid));
    })();
  }

  /** Jalur langsung sudah jalan: lepas relay yang disiapkan (hemat koneksi Metered). Dibuat lagi bila perlu. */
  private lepasRelaySiaga(): void {
    if (this.jalur !== 'langsung' || !this.siapRelay) return;
    const tunggu = this.siapRelay;
    this.siapRelay = null;
    void tunggu.then(() => {
      if (this.siapRelay || this.jalur !== 'langsung') return;
      this.relay?.hentikan();
      this.relay = null;
    }, () => {});
  }

  /** Jejak jalur untuk layar "Coba lagi". */
  diagnosa(): Diagnosa {
    let l = this.langsung;
    const conn = this.conn;
    if (this.jalur === 'langsung' && conn && !conn.open) l = `menunggu host (ICE ${conn.peerConnection?.iceConnectionState ?? 'baru'})`;
    else if (this.jalur === 'langsung' && conn?.open) l = 'terbuka';
    const host = this.sudahView ? 'menjawab' : this.jalur === 'relay' ? 'belum menjawab lewat relay' : 'belum menjawab';
    return { langsung: l, turn: turnDari(this.relay), relay: this.relay?.ringkasan() ?? null, host };
  }

  /** Pindah ke jalur relay: tutup PeerJS, pakai relay yang sudah disiapkan, kirim salam ke host. */
  private async keRelay(): Promise<void> {
    if (this.jalur === 'relay' || this.selesai) return;
    this.jalur = 'relay';
    this.relayMulaiMs = Date.now();
    const conn0 = this.conn;
    if (conn0 && !conn0.open && this.langsung.startsWith('menyambung')) this.langsung = `gagal (ICE ${conn0.peerConnection?.iceConnectionState ?? 'baru'})`;
    else if (this.langsung === 'menyambung ke server PeerJS' || this.langsung === 'terbuka') this.langsung = 'tidak ada jawaban host';
    if (this.jadwalUlang) clearTimeout(this.jadwalUlang);
    this.jadwalUlang = null;
    const conn = this.conn;
    this.conn = null;
    conn?.close();
    this.peer?.destroy();
    this.peer = null;
    this.sudahView = false;
    this.dengar.onJalur?.('relay');
    this.dengar.onStatus('menyambung', 'relay');
    this.siapkanRelay();
    try {
      await this.siapRelay;
    } catch {
      this.dengar.onStatus('menyambungUlang', 'relay-putus');
      return;
    }
    if (this.selesai) return;
    if (this.relay && this.relay.jumlah() > 0 && !this.sudahView) this.haloRelay(true);
  }

  private haloRelay(segera = false): void {
    const t = Date.now();
    if (!segera && t - this.haloRelayTerakhir < jedaHaloRelay(t - this.relayMulaiMs)) return;
    this.haloRelayTerakhir = t;
    this.kirimMentah({ t: 'halo', v: VERSI_PROTOKOL, ...this.identitas });
  }

  private detak(): void {
    if (this.selesai) return;
    if (this.jalur === 'relay') {
      if (!this.relay || this.relay.jumlah() === 0) return;
      const t = Date.now();
      if (!this.sudahView || t - this.terakhirDengar > BATAS_SENYAP_HOST_RELAY_MS) {
        // Belum dijawab atau host diam: ulangi salam (host memperlakukannya sebagai sambung ulang).
        if (this.sudahView) {
          this.sudahView = false;
          this.dengar.onStatus('menyambungUlang', 'relay');
        } else if (t - this.mulaiMs > BATAS_SENYAP_HOST_MS * 2) {
          this.dengar.onStatus('hostTidakAda', 'relay');
        }
        this.haloRelay();
      } else if (t - this.pingRelayTerakhir >= INTERVAL_PING_RELAY_MS) {
        // Ping relay jarang (hemat kuota Metered); view/chat dari host juga dihitung sebagai tanda hidup.
        this.pingRelayTerakhir = t;
        this.kirimMentah({ t: 'ping' });
      }
      return;
    }
    if (this.conn?.open) {
      this.kirimMentah({ t: 'ping' });
      if (Date.now() - this.terakhirDengar > BATAS_SENYAP_HOST_MS) {
        // Host diam terlalu lama (mis. HP host terkunci atau refresh): sambung ulang.
        this.dengar.onStatus('menyambungUlang', 'senyap');
        this.conn.close();
        this.conn = null;
        this.ulangNanti(500);
      }
    } else if (perluRelay({ lamaMs: this.lamaTanpaHost(), adaView: false })) {
      // Jalur langsung belum juga terbuka: jangan biarkan pemain menunggu, pakai relay.
      void this.keRelay();
    }
  }

  private ulangNanti(ms: number): void {
    if (this.jadwalUlang || this.selesai || this.jalur === 'relay') return;
    this.jadwalUlang = setTimeout(() => {
      this.jadwalUlang = null;
      this.hubungi();
    }, ms);
  }

  private hubungi(): void {
    const peer = this.peer;
    if (this.selesai || !peer || peer.destroyed || this.jalur === 'relay') return;
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
      if (conn !== this.conn) return;
      this.langsung = 'terbuka';
      this.terakhirDengar = Date.now();
      this.kirimMentah({ t: 'halo', v: VERSI_PROTOKOL, ...this.identitas });
    });
    conn.on('data', (data) => {
      if (conn !== this.conn) return;
      this.terima(data as PesanKeKlien);
    });
    const putus = () => {
      if (conn !== this.conn || this.selesai) return;
      this.conn = null;
      this.dengar.onStatus('menyambungUlang');
      this.ulangNanti(JEDA_ULANG_MS);
    };
    conn.on('close', putus);
    conn.on('error', putus);
    // Jika koneksi tidak pernah terbuka, coba lagi. Tapi jangan memutus negosiasi ICE yang masih berjalan
    // (jaringan seluler bisa butuh lebih dari 12 detik); hanya ulang bila gagal, macet total, atau lewat batas keras.
    const mulaiNego = Date.now();
    const periksa = () => {
      if (conn !== this.conn || conn.open || this.selesai) return;
      const ice = conn.peerConnection?.iceConnectionState;
      if (nasibNegosiasi(ice, Date.now() - mulaiNego) === 'tunggu') {
        setTimeout(periksa, CEK_NEGOSIASI_MS);
        return;
      }
      this.langsung = `gagal (ICE ${ice ?? 'baru'}, waktu habis)`;
      conn.close();
      this.conn = null;
      this.dengar.onStatus('menyambungUlang', 'timeout');
      this.ulangNanti(500);
    };
    setTimeout(periksa, TUNGGU_AWAL_MS);
  }

  /** Pesan dari host, lewat jalur mana pun. */
  private terima(p: PesanKeKlien): void {
    if (this.selesai || !p || typeof p !== 'object') return;
    this.terakhirDengar = Date.now();
    if (p.t === 'view') {
      if (!p.view || typeof p.view.seq !== 'number') return;
      // Setelah tersambung ulang, terima view pertama apa pun (host bisa saja baru dipulihkan).
      // Di jalur relay, view lama yang datang terlambat dari broker lain diabaikan lewat seq.
      if (!this.sudahView || p.view.seq >= this.seq) {
        this.sudahView = true;
        this.seq = p.view.seq;
        if (this.jalur === 'langsung') this.lepasRelaySiaga();
        this.dengar.onStatus('tersambung', this.jalur);
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
      if (p.ganti) {
        this.hentikan();
        if (this.dengar.onDiganti) this.dengar.onDiganti(p.alasan);
        else this.dengar.onTolak(p.alasan, true);
        return;
      }
      if (p.chat && this.dengar.onTolakChat) this.dengar.onTolakChat(p.alasan, typeof p.teks === 'string' ? p.teks : undefined);
      else if (p.petunjuk && this.dengar.onTolakPetunjuk) this.dengar.onTolakPetunjuk(p.alasan);
      else this.dengar.onTolak(p.alasan, !this.sudahView);
    }
  }

  private kirimMentah(p: PesanKeHost): void {
    if (this.jalur === 'relay') {
      if (this.relay && this.kunciRelay) void this.relay.kirim(topikHost(this.kunciRelay), { f: this.rid, d: p } satisfies AmplopKeHost);
      return;
    }
    try {
      if (this.conn?.open) void this.conn.send(p);
    } catch {
      // abaikan, akan tersambung ulang
    }
  }

  /** Kirim chat. Mengembalikan alasan gagal (belum tersambung / terlalu cepat), atau undefined jika terkirim. */
  kirimChat(teks: string): string | undefined {
    if (!this.terbuka()) return 'Belum tersambung ke host. Coba lagi sebentar.';
    const laju = lajuKlien(this.lajuChat, Date.now());
    if (!laju) return GALAT_CHAT_CEPAT;
    this.lajuChat = laju;
    this.kirimMentah({ t: 'chat', teks });
    return undefined;
  }

  kirim(aksi: AksiPemain): boolean {
    if (!this.terbuka()) return false;
    this.kirimMentah({ t: 'aksi', aksi });
    return true;
  }

  hentikan(): void {
    if (!this.selesai && this.jalur === 'relay' && this.relay && this.kunciRelay) {
      // Beri tahu host agar pemain langsung ditandai keluar (tanpa menunggu batas senyap).
      const relay = this.relay;
      void relay.kirim(topikHost(this.kunciRelay), { f: this.rid, d: null, tutup: true } satisfies AmplopKeHost).finally(() => setTimeout(() => relay.hentikan(), 300));
    } else {
      this.relay?.hentikan();
    }
    this.selesai = true;
    if (this.timer) clearInterval(this.timer);
    if (this.jadwalUlang) clearTimeout(this.jadwalUlang);
    this.conn?.close();
    this.peer?.destroy();
  }
}
