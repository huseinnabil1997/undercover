import { describe, expect, it } from 'vitest';
import { buatStateHost, reduceHost, viewUntuk, type Konteks } from '../lib/online/host';
import type { Aksi, StateHost } from '../lib/online/types';
import { EFEK, lamaEfek } from '../lib/umpan/nada';
import { rapikanUmpan, statusIzin, UMPAN_BAWAAN, TEKS_IZIN, PILIHAN_VOLUME } from '../lib/umpan/pengaturan';
import {
  kunciGiliran, menangkah, PERISTIWA_NOTIFIKASI, peristiwaLokal, peristiwaOnline, perluNotifikasi, pilihUtama,
  POLA_GETAR, TEKS_NOTIFIKASI, type Peristiwa,
} from '../lib/umpan/peristiwa';

const PASANGAN = { civilian: 'APEL', undercover: 'PIR', sumber: 'Uji' };
const ctx = (): Konteks => ({ now: 1000, rng: () => 0.3 });
const jalan = (s: StateHost, ...aksi: Aksi[]) => aksi.reduce((x, a) => reduceHost(x, a, ctx()).state, s);

function room(n = 5, mrWhite = 0): StateHost {
  let s = buatStateHost('ABCDE', 'h', 'Host', { komposisi: { undercover: 1, mrWhite }, kategori: ['klasik'] }, 1000);
  for (let i = 1; i < n; i++) s = jalan(s, { jenis: 'gabung', id: `p${i}`, nama: `Pemain ${i}` });
  return s;
}

/** Semua peristiwa per pemain dari satu transisi state. */
function transisi(a: StateHost, b: StateHost): Record<string, Peristiwa[]> {
  return Object.fromEntries(b.pemain.map((p) => [p.id, peristiwaOnline(viewUntuk(a, p.id), viewUntuk(b, p.id))]));
}

describe('pengaturan suara & notifikasi', () => {
  it('nilai rusak atau kosong kembali ke bawaan; notifikasi bawaan mati (opt-in)', () => {
    expect(rapikanUmpan(null)).toEqual(UMPAN_BAWAAN);
    expect(rapikanUmpan('x')).toEqual(UMPAN_BAWAAN);
    expect(UMPAN_BAWAAN.notifikasi).toBe(false);
    expect(rapikanUmpan({ suara: false, getar: 'ya', notifikasi: true, volume: 9 })).toEqual({ suara: false, getar: true, notifikasi: true, volume: 1 });
    expect(rapikanUmpan({ volume: -2 }).volume).toBe(0);
    expect(rapikanUmpan({ volume: Number.NaN }).volume).toBe(UMPAN_BAWAAN.volume);
    expect(PILIHAN_VOLUME).toContain(UMPAN_BAWAAN.volume);
  });

  it('status izin: iPhone wajib dipasang ke Layar Utama, lalu ikut izin browser', () => {
    expect(statusIzin({ adaApi: false, izin: null, ios: true, terpasang: false })).toBe('perluPasang');
    expect(statusIzin({ adaApi: true, izin: 'default', ios: true, terpasang: true })).toBe('didukung');
    expect(statusIzin({ adaApi: true, izin: 'granted', ios: false, terpasang: false })).toBe('diizinkan');
    expect(statusIzin({ adaApi: true, izin: 'denied', ios: false, terpasang: false })).toBe('diblokir');
    expect(statusIzin({ adaApi: false, izin: null, ios: false, terpasang: false })).toBe('tidakDidukung');
    for (const t of Object.values(TEKS_IZIN)) expect(t).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('efek suara', () => {
  it('setiap peristiwa punya efek pendek dan tidak terlalu keras', () => {
    for (const [p, nada] of Object.entries(EFEK)) {
      expect(nada.length, p).toBeGreaterThan(0);
      expect(lamaEfek(nada), p).toBeLessThanOrEqual(1.1);
      for (const n of nada) {
        expect(n.g).toBeGreaterThan(0);
        expect(n.g).toBeLessThanOrEqual(0.6);
        expect(n.f).toBeGreaterThan(80);
        expect(n.f).toBeLessThan(5000);
      }
    }
  });

  it('giliran lebih menonjol daripada momen lain (lebih keras dan getar lebih panjang)', () => {
    const puncak = (p: Peristiwa) => Math.max(...EFEK[p].map((n) => n.g));
    const getar = (p: Peristiwa) => (POLA_GETAR[p] ?? []).reduce((a, b) => a + b, 0);
    for (const p of ['gabung', 'mulai', 'vote', 'eliminasi', 'aman', 'chat', 'oper', 'buka'] as Peristiwa[]) {
      expect(puncak('giliranmu')).toBeGreaterThan(puncak(p));
      expect(getar('giliranmu')).toBeGreaterThan(getar(p));
    }
    expect(POLA_GETAR.chat).toBeUndefined();
    expect(POLA_GETAR.gabung).toBeUndefined();
  });
});

describe('notifikasi hanya saat giliran pemain itu', () => {
  it('hanya giliranmu dan tebakan Mr. White yang memicu notifikasi, dengan teks', () => {
    expect([...PERISTIWA_NOTIFIKASI].sort()).toEqual(['giliranmu', 'tebakMrWhite']);
    for (const p of Object.keys(EFEK) as Peristiwa[]) {
      expect(perluNotifikasi(p), p).toBe(p === 'giliranmu' || p === 'tebakMrWhite');
    }
    for (const p of PERISTIWA_NOTIFIKASI) expect(TEKS_NOTIFIKASI[p]?.judul).toBeTruthy();
    for (const t of Object.values(TEKS_NOTIFIKASI)) expect(`${t!.judul} ${t!.isi}`).not.toMatch(/[\u2013\u2014]/);
  });

  it('alur online: giliranmu hanya untuk pembicara saat itu, sekali per giliran', () => {
    const lobby = room(5);
    let s = jalan(lobby, { jenis: 'gabung', id: 'p5', nama: 'Baru' });
    expect(transisi(lobby, s).h).toEqual(['gabung']);
    s = lobby;
    const mulai = jalan(s, { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' });
    for (const ev of Object.values(transisi(s, mulai))) expect(ev).toEqual(['mulai']);
    const diskusi = jalan(mulai, { jenis: 'mulaiDiskusi', dari: 'h' });
    const urutan = diskusi.game!.urutan;
    let ev = transisi(mulai, diskusi);
    const notifikasi = (e: Record<string, Peristiwa[]>) => Object.keys(e).filter((id) => e[id].some(perluNotifikasi));
    expect(notifikasi(ev)).toEqual([urutan[0]]);
    expect(ev[urutan[0]]).toEqual(['giliranmu']);
    // Render ulang / seq baru tanpa pindah giliran: tidak berbunyi lagi.
    const sama = jalan(diskusi, { jenis: 'terlihat', id: 'p1' });
    expect(Object.values(transisi(diskusi, sama)).flat()).toEqual([]);
    // Giliran pindah ke pemain kedua.
    const kedua = jalan(diskusi, { jenis: 'petunjuk', teks: 'merah', dari: urutan[0] });
    ev = transisi(diskusi, kedua);
    expect(notifikasi(ev)).toEqual([urutan[1]]);
    // Vote mulai: bunyi halus untuk semua, tanpa notifikasi.
    const vote = jalan(kedua, { jenis: 'mulaiVote', dari: 'h' });
    ev = transisi(kedua, vote);
    expect(notifikasi(ev)).toEqual([]);
    expect(new Set(Object.values(ev).map((e) => pilihUtama(e)))).toEqual(new Set(['vote']));
  });

  it('view pertama setelah menyambung ulang tetap memberi tahu jika sedang giliranmu', () => {
    const s = jalan(room(5), { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' }, { jenis: 'mulaiDiskusi', dari: 'h' });
    const id = s.game!.urutan[0];
    expect(peristiwaOnline(null, viewUntuk(s, id))).toEqual(['giliranmu']);
    const lain = s.game!.urutan[1];
    expect(peristiwaOnline(null, viewUntuk(s, lain))).toEqual([]);
  });

  it('Mr. White yang tereliminasi mendapat giliran menebak; pemain lain hanya bunyi eliminasi', () => {
    let s = jalan(room(5, 1), { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' }, { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    const mw = s.game!.peserta.find((id) => s.game!.peran[id] === 'mrwhite')!;
    const sebelum = s;
    s = jalan(s, ...s.game!.peserta.map((id): Aksi => ({ jenis: 'vote', dari: id, target: id === mw ? s.game!.peserta.find((x) => x !== mw)! : mw })));
    expect(s.game!.tereliminasi).toBe(mw);
    const ev = transisi(sebelum, s);
    expect(pilihUtama(ev[mw])).toBe('tebakMrWhite');
    for (const id of s.game!.peserta.filter((x) => x !== mw)) {
      expect(ev[id]).toEqual(['eliminasi']);
    }
    expect(kunciGiliran(viewUntuk(s, mw))).toMatch(/^tebak-/);
  });

  it('hasil: menang/kalah sesuai tim pemain', () => {
    let s = jalan(room(5), { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' }, { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    const uc = s.game!.peserta.find((id) => s.game!.peran[id] === 'undercover')!;
    const sebelum = s;
    s = jalan(s, ...s.game!.peserta.map((id): Aksi => ({ jenis: 'vote', dari: id, target: id === uc ? s.game!.peserta.find((x) => x !== uc)! : uc })));
    s = jalan(s, { jenis: 'lanjut', dari: 'h' });
    expect(s.game!.fase).toBe('hasil');
    const ev = transisi(sebelum, s);
    expect(ev[uc]).toContain('kalah');
    for (const id of s.game!.peserta.filter((x) => x !== uc)) expect(ev[id]).toContain('menang');
    expect(menangkah(viewUntuk(s, uc))).toBe(false);
  });
});

describe('isyarat mode lokal (satu HP)', () => {
  it('pergantian giliran diberi isyarat jelas, kunci berubah tepat sekali per momen', () => {
    expect(peristiwaLokal({ jenis: 'serah', idx: 0, terbuka: false })).toEqual({ kunci: 'serah-0', p: 'mulai' });
    expect(peristiwaLokal({ jenis: 'serah', idx: 2, terbuka: false }).p).toBe('oper');
    expect(peristiwaLokal({ jenis: 'serah', idx: 2, terbuka: true }).p).toBe('buka');
    const g1 = peristiwaLokal({ jenis: 'diskusi', ronde: 1, giliran: 0 });
    const g2 = peristiwaLokal({ jenis: 'diskusi', ronde: 1, giliran: 1 });
    expect(g1.p).toBe('giliranLokal');
    expect(g1.kunci).not.toBe(g2.kunci);
    expect(peristiwaLokal({ jenis: 'vote', ronde: 1 }).p).toBe('vote');
    expect(peristiwaLokal({ jenis: 'terungkap', ronde: 1, idx: 3 }).p).toBe('eliminasi');
    expect(peristiwaLokal({ jenis: 'aman', ronde: 2 }).p).toBe('aman');
    expect(peristiwaLokal({ jenis: 'hasil' }).p).toBe('menang');
    expect(perluNotifikasi('giliranLokal')).toBe(false);
  });
});
