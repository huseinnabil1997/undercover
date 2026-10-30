import { describe, expect, it } from 'vitest';
import { MAX_PEMAIN } from '../lib/game';
import { buatStateHost, reduceHost } from '../lib/online/host';
import { HostRoom, PESAN_SESI_DIGANTI } from '../lib/online/jaringan';
import { aktifDiHalamanLain, BATAS_AKTIF_MS, bolehTawarkanLanjut, type SesiOnline } from '../lib/online/sesi';
import { VERSI_PROTOKOL, type Aksi, type PesanKeHost, type PesanKeKlien, type StateHost } from '../lib/online/types';

// Regresi: room online harus menampung host + banyak pemain, bukan hanya host + 1.

const now = 1000;
const jalan = (s: StateHost, ...aksi: Aksi[]) => aksi.reduce((x, a) => reduceHost(x, a, { now, rng: () => 0.5 }).state, s);
const awal = () => buatStateHost('ABCDE', 'h', 'Host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'] }, now);
const gabung = (id: string, nama: string, token = `tok-${id}`): Aksi => ({ jenis: 'gabung', id, nama, token });

describe('reducer room: banyak pemain', () => {
  it('host + 3 pemain dengan id berbeda semuanya masuk dan online', () => {
    const s = jalan(awal(), gabung('pA', 'Andi'), gabung('pB', 'Budi'), gabung('pC', 'Citra'));
    expect(s.pemain.map((p) => [p.id, p.online])).toEqual([['h', true], ['pA', true], ['pB', true], ['pC', true]]);
  });

  it('bisa sampai MAX_PEMAIN, pemain berikutnya ditolak karena penuh', () => {
    let s = awal();
    for (let i = 1; i < MAX_PEMAIN; i++) s = jalan(s, gabung(`p${i}`, `Pemain ${i}`));
    expect(s.pemain).toHaveLength(MAX_PEMAIN);
    const r = reduceHost(s, gabung('lebih', 'Kelebihan'), { now });
    expect(r.tolak).toMatch(/penuh/);
    expect(r.state.pemain).toHaveLength(MAX_PEMAIN);
  });

  it('putus atau keluar satu pemain tidak menghapus pemain lain', () => {
    let s = jalan(awal(), gabung('pA', 'Andi'), gabung('pB', 'Budi'), gabung('pC', 'Citra'));
    s = jalan(s, { jenis: 'putus', id: 'pB' });
    expect(s.pemain.map((p) => [p.id, p.online])).toEqual([['h', true], ['pA', true], ['pB', false], ['pC', true]]);
    s = jalan(s, { jenis: 'keluar', dari: 'pA' });
    expect(s.pemain.map((p) => p.id)).toEqual(['h', 'pB', 'pC']);
  });

  it('rejoin dengan id dan token yang sama tidak menggandakan pemain', () => {
    let s = jalan(awal(), gabung('pA', 'Andi'), gabung('pB', 'Budi'), { jenis: 'putus', id: 'pA' });
    s = jalan(s, gabung('pA', 'Andi'));
    expect(s.pemain.filter((p) => p.id === 'pA')).toHaveLength(1);
    expect(s.pemain.find((p) => p.id === 'pA')!.online).toBe(true);
    expect(s.pemain).toHaveLength(3);
    const r = reduceHost(s, gabung('pA', 'Andi', 'token-lain'), { now });
    expect(r.tolak).toBeTruthy();
  });
});

// Koneksi palsu dengan handler, agar 'close' bisa disimulasikan.
function koneksiPalsu() {
  const handler: Record<string, Array<() => void>> = {};
  return {
    open: true,
    terkirim: [] as PesanKeKlien[],
    send(p: PesanKeKlien) { this.terkirim.push(p); },
    close() { this.open = false; },
    on(ev: string, fn: () => void) { (handler[ev] ??= []).push(fn); },
    picu(ev: string) { for (const fn of handler[ev] ?? []) fn(); },
  };
}
type Palsu = ReturnType<typeof koneksiPalsu>;

function siapkanHost() {
  let state: StateHost = awal();
  const host = new HostRoom(state, { onState: (s) => { state = s; }, onStatus: () => {} });
  const priv = host as unknown as { terimaKoneksi(c: Palsu): void; terimaPesan(c: Palsu, p: PesanKeHost): void };
  const sambung = (id: string, nama: string, token = `tok-${id}`) => {
    const c = koneksiPalsu();
    priv.terimaKoneksi(c);
    priv.terimaPesan(c, { t: 'halo', v: VERSI_PROTOKOL, id, nama, token });
    return c;
  };
  return { sambung, state: () => state };
}

const viewTerakhir = (c: Palsu) => {
  const v = c.terkirim.filter((p): p is Extract<PesanKeKlien, { t: 'view' }> => p.t === 'view').at(-1);
  return v?.view;
};
const namaDiView = (c: Palsu) => {
  const v = viewTerakhir(c) as unknown as { pemain: { nama: string; online: boolean }[] } | undefined;
  return v?.pemain.map((p) => `${p.nama}${p.online ? '+' : '-'}`);
};

describe('HostRoom: koneksi per pemain', () => {
  it('3 koneksi tersimpan terpisah dan semuanya menerima view terbaru', () => {
    const { sambung, state } = siapkanHost();
    const a = sambung('pA', 'Andi');
    const b = sambung('pB', 'Budi');
    const c = sambung('pC', 'Citra');
    expect(state().pemain.map((p) => p.nama)).toEqual(['Host', 'Andi', 'Budi', 'Citra']);
    for (const k of [a, b, c]) expect(namaDiView(k)).toEqual(['Host+', 'Andi+', 'Budi+', 'Citra+']);
    expect([a, b, c].every((k) => k.open)).toBe(true);
  });

  it('koneksi satu pemain putus tidak memutus pemain lain', () => {
    const { sambung, state } = siapkanHost();
    const a = sambung('pA', 'Andi');
    const b = sambung('pB', 'Budi');
    const c = sambung('pC', 'Citra');
    b.open = false;
    b.picu('close');
    expect(state().pemain.map((p) => `${p.nama}${p.online ? '+' : '-'}`)).toEqual(['Host+', 'Andi+', 'Budi-', 'Citra+']);
    for (const k of [a, c]) expect(namaDiView(k)).toEqual(['Host+', 'Andi+', 'Budi-', 'Citra+']);
    // Budi tersambung ulang dengan sesi tersimpan (id + token sama).
    const b2 = sambung('pB', 'Budi');
    expect(namaDiView(b2)).toEqual(['Host+', 'Andi+', 'Budi+', 'Citra+']);
    expect(state().pemain).toHaveLength(4);
  });

  it('id sama dari tab lain: koneksi lama diberi tahu (ganti) lalu ditutup, pemain lain tetap', () => {
    const { sambung, state } = siapkanHost();
    const lama = sambung('pA', 'Andi');
    const b = sambung('pB', 'Budi');
    const baru = sambung('pA', 'Andi');
    expect(lama.terkirim.at(-1)).toEqual({ t: 'tolak', alasan: PESAN_SESI_DIGANTI, ganti: true });
    expect(lama.open).toBe(false);
    // Event close dari koneksi lama tidak boleh membuat pemain itu offline (koneksinya sudah diganti).
    lama.picu('close');
    expect(state().pemain.map((p) => `${p.nama}${p.online ? '+' : '-'}`)).toEqual(['Host+', 'Andi+', 'Budi+']);
    expect(baru.open).toBe(true);
    expect(namaDiView(b)).toEqual(['Host+', 'Andi+', 'Budi+']);
  });
});

describe('sesi: tombol Lanjut dan tanda tab aktif', () => {
  const sesi: SesiOnline = { kode: 'ABCDE', id: 'pA', nama: 'Andi', token: 't', host: false, waktu: 1 };

  it('tanda aktif dari halaman lain yang masih segar berarti sesi sedang dipakai', () => {
    expect(aktifDiHalamanLain({ halaman: 'lain', waktu: 10_000 }, 'ini', 10_000 + 1000)).toBe(true);
    expect(aktifDiHalamanLain({ halaman: 'ini', waktu: 10_000 }, 'ini', 10_000 + 1000)).toBe(false);
    expect(aktifDiHalamanLain({ halaman: 'lain', waktu: 10_000 }, 'ini', 10_000 + BATAS_AKTIF_MS + 1)).toBe(false);
    expect(aktifDiHalamanLain(null, 'ini', 0)).toBe(false);
    expect(aktifDiHalamanLain('rusak', 'ini', 0)).toBe(false);
  });

  it('Lanjut disembunyikan jika sesi dipakai tab lain atau link undangan untuk room lain', () => {
    expect(bolehTawarkanLanjut(sesi, null, false)).toBe(true);
    expect(bolehTawarkanLanjut(sesi, 'ABCDE', false)).toBe(true);
    expect(bolehTawarkanLanjut(sesi, 'ABCDE', true)).toBe(false);
    expect(bolehTawarkanLanjut(sesi, 'ZZZZZ', false)).toBe(false);
    expect(bolehTawarkanLanjut(null, null, false)).toBe(false);
  });
});
