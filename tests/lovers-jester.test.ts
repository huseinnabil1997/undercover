import { describe, expect, it } from 'vitest';
import {
  bagiPeran, cekPemenang, eliminasiDenganLovers, loversMenangTambahan, teksLoversBersama, validasiSetup,
} from '../lib/game';
import { buatStateHost, reduceHost, viewUntuk } from '../lib/online/host';
import { menangDengan } from '../lib/akun';
import { agregatMusim, top3Kategori, pilihGelarDefault, type BarisMain } from '../lib/peringkatMusim';
import type { Pemain } from '../lib/types';

const nama = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const p = (peran: Pemain['peran'], hidup = true, pasanganLovers?: number): Pemain => ({
  nama: peran, peran, hidup, ...(pasanganLovers != null ? { pasanganLovers } : {}),
});


describe('teksLoversBersama', () => {
  it('memuat nama pasangan dan teks tetap', () => {
    expect(teksLoversBersama('raynerie')).toBe(
      '💞 Kamu Lovers bersama raynerie. Kalian punya kata yang sama.',
    );
  });
});

describe('validasi Jester/Lovers', () => {
  it('menolak Jester di bawah 5 dan keduanya di bawah 6', () => {
    expect(validasiSetup(nama(4), { undercover: 1, mrWhite: 0, jester: 1 })).not.toEqual([]);
    expect(validasiSetup(nama(5), { undercover: 1, mrWhite: 0, jester: 1 })).toEqual([]);
    expect(validasiSetup(nama(5), { undercover: 1, mrWhite: 0, jester: 1, lovers: true })).not.toEqual([]);
    // 6: UC1+MW1+Jester = 3 non-civ vs 3 civ → invalid (Jester ikut dihitung)
    expect(validasiSetup(nama(6), { undercover: 1, mrWhite: 1, jester: 1, lovers: true })).not.toEqual([]);
    expect(validasiSetup(nama(6), { undercover: 1, mrWhite: 0, jester: 1, lovers: true })).toEqual([]);
  });

  it('7 pemain Civ4 UC1 MW1 Jester On Lovers Off valid', () => {
    expect(validasiSetup(nama(7), { undercover: 1, mrWhite: 1, jester: 1, lovers: false })).toEqual([]);
  });
});

describe('cekPemenang dengan Jester', () => {
  it('Jester tidak dihitung Civilian maupun penyusup', () => {
    // 2 civ + 1 jes + 0 uc: civilian menang
    expect(cekPemenang([p('civilian'), p('civilian'), p('jester')])).toBe('civilian');
    // 1 civ + 1 uc + 1 jes: penyusup (1>=1)
    expect(cekPemenang([p('civilian'), p('undercover'), p('jester')])).toBe('penyusup');
    // 2 civ + 1 uc + 1 jes: belum
    expect(cekPemenang([p('civilian'), p('civilian'), p('undercover'), p('jester')])).toBeNull();
  });
});

describe('eliminasi berantai Lovers', () => {
  it('pasangan ikut mati', () => {
    const pemain: Pemain[] = [
      p('civilian', true, 1),
      p('civilian', true, 0),
      p('undercover'),
      p('mrwhite'),
      p('civilian'),
    ];
    const { pemain: hasil, ikut } = eliminasiDenganLovers(pemain, 0);
    expect(ikut).toBe(1);
    expect(hasil[0].hidup).toBe(false);
    expect(hasil[1].hidup).toBe(false);
    expect(hasil[2].hidup).toBe(true);
  });

  it('loversMenangTambahan hanya jika keduanya hidup', () => {
    const hidup: Pemain[] = [p('civilian', true, 1), p('civilian', true, 0), p('undercover')];
    expect(loversMenangTambahan(hidup)).toBe(true);
    const mati = eliminasiDenganLovers(hidup, 0).pemain;
    expect(loversMenangTambahan(mati)).toBe(false);
  });
});

describe('bagiPeran jester + lovers', () => {
  it('satu jester dan dua lovers saling merujuk dengan peran sama', () => {
    const pemain = bagiPeran(nama(6), { undercover: 1, mrWhite: 0, jester: 1, lovers: true }, () => 0.1);
    expect(pemain.filter((x) => x.peran === 'jester')).toHaveLength(1);
    const lovers = pemain.filter((x) => x.pasanganLovers != null);
    expect(lovers).toHaveLength(2);
    expect(pemain.every((x) => x.peran !== 'jester' || x.pasanganLovers == null)).toBe(true);
    expect(pemain.every((x) => x.peran !== 'mrwhite' || x.pasanganLovers == null)).toBe(true);
    const [a] = lovers;
    const b = pemain[a.pasanganLovers!];
    expect(b.pasanganLovers).toBe(pemain.indexOf(a));
    expect(a.peran).toBe(b.peran);
    expect(a.peran === 'civilian' || a.peran === 'undercover').toBe(true);
  });

  it('ratusan seed: Lovers selalu peran sama, bukan mrwhite/jester', () => {
    const seeded = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
      };
    };
    const setups = [
      { n: 5, k: { undercover: 1, mrWhite: 0, lovers: true } },
      { n: 6, k: { undercover: 1, mrWhite: 0, jester: 1, lovers: true } },
      { n: 7, k: { undercover: 2, mrWhite: 1, lovers: true } },
      { n: 8, k: { undercover: 1, mrWhite: 1, jester: 1, lovers: true } },
      { n: 10, k: { undercover: 2, mrWhite: 1, jester: 1, lovers: true } },
      { n: 12, k: { undercover: 3, mrWhite: 1, lovers: true } },
    ] as const;
    for (const { n, k } of setups) {
      expect(validasiSetup(nama(n), k)).toEqual([]);
      for (let seed = 0; seed < 200; seed++) {
        const pemain = bagiPeran(nama(n), k, seeded(seed));
        const idx = pemain.map((x, i) => (x.pasanganLovers != null ? i : -1)).filter((i) => i >= 0);
        expect(idx).toHaveLength(2);
        const [i, j] = idx;
        expect(pemain[i].pasanganLovers).toBe(j);
        expect(pemain[j].pasanganLovers).toBe(i);
        expect(pemain[i].peran).toBe(pemain[j].peran);
        expect(['civilian', 'undercover']).toContain(pemain[i].peran);
        expect(pemain[i].peran).not.toBe('mrwhite');
        expect(pemain[i].peran).not.toBe('jester');
      }
    }
  });
});

describe('menangDengan lovers/jester', () => {
  it('jester hanya menang saat pemenang jester', () => {
    expect(menangDengan('jester', 'jester')).toBe(true);
    expect(menangDengan('jester', 'penyusup')).toBe(false);
    expect(menangDengan('jester', 'civilian')).toBe(false);
  });
  it('lovers tambahan', () => {
    expect(menangDengan('civilian', 'penyusup', { loversMenang: true, adalahLovers: true })).toBe(true);
    expect(menangDengan('civilian', 'penyusup', { loversMenang: true, adalahLovers: false })).toBe(false);
  });
});

describe('peringkat musim lovers/jester', () => {
  it('top3 lovers dan jester dari agregat', () => {
    const musim = '2026-11';
    const baris: BarisMain[] = [];
    for (let i = 0; i < 6; i++) {
      baris.push({ userId: 'u1', peran: 'jester', menang: i < 3, waktu: '2026-11-10T00:00:00+07:00' });
      baris.push({ userId: 'u2', peran: 'civilian', menang: false, waktu: '2026-11-10T00:00:00+07:00', adalahLovers: true, loversMenang: i < 4 });
    }
    // pad u2 jester main to 5+ for jester tab not needed
    for (let i = 0; i < 5; i++) {
      baris.push({ userId: 'u3', peran: 'jester', menang: true, waktu: '2026-11-11T00:00:00+07:00' });
    }
    const a = agregatMusim(baris, musim);
    const jes = top3Kategori(a, 'jester');
    expect(jes[0].userId).toBe('u3');
    const lov = top3Kategori(a, 'lovers');
    expect(lov[0].userId).toBe('u2');
    expect(lov[0].menang).toBe(4);
  });

  it('pilihGelarDefault mendahulukan peran utama saat seri peringkat', () => {
    const slot = [
      { userId: 'x', peringkat: 1 as const, kategori: 'jester' as const, main: 5, menang: 3, winrate: 0.6, metrik: 3 },
      { userId: 'x', peringkat: 1 as const, kategori: 'civilian' as const, main: 10, menang: 5, winrate: 0.5, metrik: 5 },
    ];
    const g = pilihGelarDefault(slot, '2026-11');
    expect(g?.kategori).toBe('civilian');
  });
});

describe('view online Lovers', () => {
  const now = 1000;
  const PASANGAN = { civilian: 'Kopi', undercover: 'Teh', sumber: 'Klasik' };

  it('viewUntuk memberi namaLovers + idLovers hanya ke anggota pasangan; kata identik', () => {
    let s = buatStateHost('ABCDE', 'h', 'Host', {
      komposisi: { undercover: 2, mrWhite: 0, lovers: true },
      kategori: ['klasik'],
    }, now);
    for (const [id, nama] of [['p1', 'Budi'], ['p2', 'Caca'], ['p3', 'Dedi'], ['p4', 'Eka']] as const) {
      s = reduceHost(s, { jenis: 'gabung', id, nama }, { now, rng: () => 0.5 }).state;
    }
    s = reduceHost(s, { jenis: 'mulai', dari: 'h', pasangan: PASANGAN }, { now, rng: () => 0.3 }).state;
    expect(s.game?.lovers).toBeTruthy();
    const [a, b] = s.game!.lovers!;
    const va = viewUntuk(s, a, now);
    const vb = viewUntuk(s, b, now);
    expect(va.game?.idLovers).toBe(b);
    expect(vb.game?.idLovers).toBe(a);
    expect(va.game?.namaLovers).toBe(s.pemain.find((p) => p.id === b)!.nama);
    expect(vb.game?.namaLovers).toBe(s.pemain.find((p) => p.id === a)!.nama);
    expect(va.game?.kata).toBe(vb.game?.kata);
    expect(va.game?.kata).toBeTruthy();
    // Pemain non-Lovers tidak mendapat nama/id pasangan.
    const lain = s.game!.peserta.find((id) => id !== a && id !== b)!;
    const vl = viewUntuk(s, lain, now);
    expect(vl.game?.namaLovers).toBeUndefined();
    expect(vl.game?.idLovers).toBeUndefined();
  });
});
