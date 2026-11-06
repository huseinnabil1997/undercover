import { describe, expect, it } from 'vitest';
import { buatStateHost, reduceHost, viewUntuk } from '../lib/online/host';
import { metaRoomPublik, publikDariPengaturan, statusRoomPublik } from '../lib/online/metaPublik';
import type { Aksi, StateHost } from '../lib/online/types';

const now = 1000;
const jalan = (s: StateHost, ...aksi: Aksi[]) => aksi.reduce((x, a) => reduceHost(x, a, { now, rng: () => 0.5 }).state, s);
const pengaturan = { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'], sumberKata: 'kamus' as const, publik: false };

describe('meta room publik', () => {
  it('hanya field aman (bukan kata/peran) dan status lobby di awal', () => {
    const s = buatStateHost('ABCDE', 'h', 'Host', pengaturan, now);
    const m = metaRoomPublik(s, 'HostSaya');
    expect(m.host).toBe('HostSaya');
    expect(m.jumlah).toBe(1);
    expect(m.status).toBe('lobby');
    expect(m.sumber).toBe('Kamus kita');
    expect(JSON.stringify(m)).not.toMatch(/peran|civilian|undercover/i);
  });

  it('room match selalu publik; room biasa mengikuti flag', () => {
    expect(publikDariPengaturan({ ...pengaturan, publik: false }, 6)).toBe(true);
    expect(publikDariPengaturan({ ...pengaturan, publik: true })).toBe(true);
    expect(publikDariPengaturan({ ...pengaturan, publik: false })).toBe(false);
    expect(publikDariPengaturan(pengaturan)).toBe(false);
  });
});

describe('gabung mid-game sebagai penonton', () => {
  it('pemain baru setelah Mulai tidak ikut ronde ini (ikut false) dan tetap di daftar', () => {
    let s = buatStateHost('ABCDE', 'h', 'Host', pengaturan, now);
    s = jalan(s, { jenis: 'gabung', id: 'p1', nama: 'Budi' }, { jenis: 'gabung', id: 'p2', nama: 'Caca' }, { jenis: 'gabung', id: 'p3', nama: 'Dedi' });
    const mulai = reduceHost(s, {
      jenis: 'mulai',
      dari: 'h',
      pasangan: { civilian: 'Kopi', undercover: 'Teh', sumber: 'Klasik' },
    }, { now, rng: () => 0.5 });
    s = mulai.state;
    expect(s.game?.fase).toBe('kata');
    s = jalan(s, { jenis: 'gabung', id: 'p4', nama: 'Eka' });
    expect(s.pemain.some((p) => p.id === 'p4')).toBe(true);
    const v = viewUntuk(s, 'p4', now);
    expect(v.game?.ikut).toBe(false);
    expect(statusRoomPublik(s)).toBe('main');
  });
});
