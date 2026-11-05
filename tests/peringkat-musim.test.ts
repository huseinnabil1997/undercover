import { describe, expect, it } from 'vitest';
import {
  agregatMusim, awalBulanBerikutnyaWib, awalBulanWib, bolehFrame, dalamMusim,
  keteranganSlot, kodeMusim, labelMusim, musimSebelumnya, pesanMasukTop3,
  pilihGelarDefault, slotBaruMasuk, teksGelar, top3Kategori, top3Semua,
  type BarisMain,
} from '../lib/peringkatMusim';

/** 15 Nov 2026 12:00 WIB = 05:00 UTC. */
const TENGAH_NOV = Date.parse('2026-11-15T05:00:00Z');
/** 31 Okt 2026 23:30 WIB = 16:30 UTC. */
const AKHIR_OKT = Date.parse('2026-10-31T16:30:00Z');
/** 1 Nov 2026 00:30 WIB = 2026-10-31 17:30 UTC. */
const AWAL_NOV = Date.parse('2026-10-31T17:30:00Z');

function baris(userId: string, peran: BarisMain['peran'], menang: boolean, t: number): BarisMain {
  return { userId, peran, menang, waktu: t };
}

describe('batas bulan Asia/Jakarta', () => {
  it('kode dan label musim', () => {
    expect(kodeMusim(TENGAH_NOV)).toBe('2026-11');
    expect(labelMusim('2026-11')).toBe('Nov 2026');
    expect(labelMusim('2026-10')).toBe('Okt 2026');
    expect(musimSebelumnya('2026-11')).toBe('2026-10');
    expect(musimSebelumnya('2026-01')).toBe('2025-12');
  });
  it('awal bulan tepat di 00:00 WIB', () => {
    expect(awalBulanWib(TENGAH_NOV).toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(awalBulanBerikutnyaWib(TENGAH_NOV).toISOString()).toBe('2026-11-30T17:00:00.000Z');
  });
  it('batas bulan tidak bocor ke UTC', () => {
    expect(dalamMusim(AKHIR_OKT, '2026-10')).toBe(true);
    expect(dalamMusim(AKHIR_OKT, '2026-11')).toBe(false);
    expect(dalamMusim(AWAL_NOV, '2026-11')).toBe(true);
    expect(dalamMusim(AWAL_NOV, '2026-10')).toBe(false);
  });
  it('frame hanya untuk musim berjalan', () => {
    expect(bolehFrame('2026-11', TENGAH_NOV)).toBe(true);
    expect(bolehFrame('2026-10', TENGAH_NOV)).toBe(false);
  });
});

describe('agregat dan top 3', () => {
  const t = TENGAH_NOV;
  const data: BarisMain[] = [
    // a: 12 main, 8 menang keseluruhan; 6 civilian (5 menang); 3 UC (2); 3 MW (1)
    ...Array.from({ length: 5 }, () => baris('a', 'civilian', true, t)),
    baris('a', 'civilian', false, t),
    ...Array.from({ length: 2 }, () => baris('a', 'undercover', true, t)),
    baris('a', 'undercover', false, t),
    baris('a', 'mrwhite', true, t),
    ...Array.from({ length: 2 }, () => baris('a', 'mrwhite', false, t)),
    // b: 11 main, 9 menang; 5 civilian (4); 3 UC (3); 3 MW (2)
    ...Array.from({ length: 4 }, () => baris('b', 'civilian', true, t)),
    baris('b', 'civilian', false, t),
    ...Array.from({ length: 3 }, () => baris('b', 'undercover', true, t)),
    ...Array.from({ length: 2 }, () => baris('b', 'mrwhite', true, t)),
    baris('b', 'mrwhite', false, t),
    // c: 10 main, 7 menang; winrate 0.7
    ...Array.from({ length: 5 }, () => baris('c', 'civilian', true, t)),
    ...Array.from({ length: 2 }, () => baris('c', 'civilian', false, t)),
    ...Array.from({ length: 2 }, () => baris('c', 'undercover', true, t)),
    baris('c', 'undercover', false, t),
    // d: 6 main sebagai civilian (4 menang) - lolos min peran, kalah menang
    ...Array.from({ length: 4 }, () => baris('d', 'civilian', true, t)),
    ...Array.from({ length: 2 }, () => baris('d', 'civilian', false, t)),
    // e: 9 main (di bawah min winrate 10)
    ...Array.from({ length: 8 }, () => baris('e', 'civilian', true, t)),
    baris('e', 'civilian', false, t),
    // f: 4 civilian menang - di bawah min 5 peran
    ...Array.from({ length: 4 }, () => baris('f', 'civilian', true, t)),
    // lama: di bulan lalu, diabaikan
    ...Array.from({ length: 20 }, () => baris('lama', 'civilian', true, AKHIR_OKT)),
  ];

  it('hanya menghitung match musim ini', () => {
    const ag = agregatMusim(data, '2026-11');
    expect(ag.find((x) => x.userId === 'lama')).toBeUndefined();
    expect(ag.find((x) => x.userId === 'a')?.main).toBe(12);
  });

  it('keseluruhan: menang terbanyak, seri main lebih sedikit', () => {
    const top = top3Kategori(agregatMusim(data, '2026-11'), 'keseluruhan');
    expect(top.map((x) => x.userId)).toEqual(['b', 'e', 'a']);
    expect(top[0].peringkat).toBe(1);
  });

  it('best peran: min 5 main peran; f tidak masuk', () => {
    const top = top3Kategori(agregatMusim(data, '2026-11'), 'civilian');
    expect(top.map((x) => x.userId)).toEqual(['e', 'a', 'c']);
    expect(top.find((x) => x.userId === 'f')).toBeUndefined();
  });

  it('winrate: min 10 main; e (9) tidak masuk', () => {
    const top = top3Kategori(agregatMusim(data, '2026-11'), 'winrate');
    expect(top.every((x) => x.main >= 10)).toBe(true);
    expect(top.find((x) => x.userId === 'e')).toBeUndefined();
    // b 9/11 ≈ 0.818, a 8/12 ≈ 0.667, c 7/10 = 0.7 → b, c, a
    expect(top.map((x) => x.userId)).toEqual(['b', 'c', 'a']);
  });

  it('match terbanyak', () => {
    const top = top3Kategori(agregatMusim(data, '2026-11'), 'main');
    expect(top[0].userId).toBe('a');
    expect(top[0].metrik).toBe(12);
  });

  it('tie-break userId deterministik', () => {
    const sama: BarisMain[] = [
      ...Array.from({ length: 5 }, () => baris('z', 'civilian', true, t)),
      ...Array.from({ length: 5 }, () => baris('m', 'civilian', true, t)),
    ];
    expect(top3Kategori(agregatMusim(sama, '2026-11'), 'keseluruhan').map((x) => x.userId)).toEqual(['m', 'z']);
  });
});

describe('pemilihan gelar dan teks', () => {
  it('default: peringkat terkecil, seri keseluruhan dulu sebelum yang lain', () => {
    const slot = top3Semua(agregatMusim([
      ...Array.from({ length: 10 }, () => baris('a', 'civilian', true, TENGAH_NOV)),
      ...Array.from({ length: 10 }, () => baris('b', 'undercover', true, TENGAH_NOV)),
    ], '2026-11')).filter((s) => s.userId === 'a');
    const g = pilihGelarDefault(slot, '2026-11');
    expect(g?.kategori).toBe('keseluruhan');
    expect(g?.peringkat).toBe(1);
  });
  it('default seri sama peringkat: winrate mengalahkan civilian', () => {
    const slot = [
      { userId: 'a', peringkat: 2 as const, kategori: 'civilian' as const, main: 8, menang: 5, winrate: null, metrik: 5 },
      { userId: 'a', peringkat: 2 as const, kategori: 'winrate' as const, main: 12, menang: 9, winrate: 0.75, metrik: 0.75 },
      { userId: 'a', peringkat: 3 as const, kategori: 'keseluruhan' as const, main: 12, menang: 9, winrate: null, metrik: 9 },
    ];
    const g = pilihGelarDefault(slot, '2026-11');
    expect(g?.kategori).toBe('winrate');
    expect(g?.peringkat).toBe(2);
  });
  it('default peringkat 1 civilian mengalahkan peringkat 2 winrate', () => {
    const slot = [
      { userId: 'a', peringkat: 1 as const, kategori: 'civilian' as const, main: 8, menang: 5, winrate: null, metrik: 5 },
      { userId: 'a', peringkat: 2 as const, kategori: 'winrate' as const, main: 12, menang: 9, winrate: 0.75, metrik: 0.75 },
    ];
    expect(pilihGelarDefault(slot, '2026-11')?.kategori).toBe('civilian');
  });
  it('teks award bulan lalu tanpa frame', () => {
    expect(teksGelar({ kategori: 'undercover', peringkat: 1, musim: '2026-10', sumber: 'award' })).toBe('Juara 1 Undercover Okt 2026');
    expect(teksGelar({ kategori: 'winrate', peringkat: 2, musim: '2026-10', sumber: 'award' })).toBe('#2 Winrate Okt 2026');
    expect(teksGelar({ kategori: 'mrwhite', peringkat: 2, musim: '2026-11' })).toBe('#2 Mr. White');
  });
  it('keterangan tap dan notifikasi', () => {
    const s = { userId: 'a', peringkat: 2 as const, kategori: 'mrwhite' as const, main: 25, menang: 16, winrate: 0.64, metrik: 16 };
    expect(keteranganSlot(s)).toBe('#2 Best Mr. White · 64% menang dari 25 game');
    expect(pesanMasukTop3(s)).toBe('Selamat, kamu masuk Top 3 Mr. White!');
  });
  it('deteksi masuk top 3 baru', () => {
    const sekarang = [
      { userId: 'a', peringkat: 1 as const, kategori: 'keseluruhan' as const, main: 5, menang: 5, winrate: 1, metrik: 5 },
      { userId: 'a', peringkat: 3 as const, kategori: 'winrate' as const, main: 10, menang: 7, winrate: 0.7, metrik: 0.7 },
    ];
    const baru = slotBaruMasuk(sekarang, [{ kategori: 'keseluruhan', peringkat: 1 }]);
    expect(baru.map((x) => x.kategori)).toEqual(['winrate']);
  });
});
