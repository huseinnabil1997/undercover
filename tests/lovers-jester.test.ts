import { describe, expect, it } from 'vitest';
import {
  bagiPeran, cekPemenang, eliminasiDenganLovers, loversMenangTambahan, validasiSetup,
} from '../lib/game';
import { menangDengan } from '../lib/akun';
import { agregatMusim, top3Kategori, pilihGelarDefault, type BarisMain } from '../lib/peringkatMusim';
import type { Pemain } from '../lib/types';

const nama = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const p = (peran: Pemain['peran'], hidup = true, pasanganLovers?: number): Pemain => ({
  nama: peran, peran, hidup, ...(pasanganLovers != null ? { pasanganLovers } : {}),
});

describe('validasi Jester/Lovers', () => {
  it('menolak Jester di bawah 5 dan keduanya di bawah 6', () => {
    expect(validasiSetup(nama(4), { undercover: 1, mrWhite: 0, jester: 1 })).not.toEqual([]);
    expect(validasiSetup(nama(5), { undercover: 1, mrWhite: 0, jester: 1 })).toEqual([]);
    expect(validasiSetup(nama(5), { undercover: 1, mrWhite: 0, jester: 1, lovers: true })).not.toEqual([]);
    expect(validasiSetup(nama(6), { undercover: 1, mrWhite: 1, jester: 1, lovers: true })).toEqual([]);
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
      p('undercover', true, 0),
      p('civilian'),
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
    const hidup: Pemain[] = [p('civilian', true, 1), p('undercover', true, 0), p('civilian')];
    expect(loversMenangTambahan(hidup)).toBe(true);
    const mati = eliminasiDenganLovers(hidup, 0).pemain;
    expect(loversMenangTambahan(mati)).toBe(false);
  });
});

describe('bagiPeran jester + lovers', () => {
  it('satu jester dan dua lovers saling merujuk', () => {
    const pemain = bagiPeran(nama(6), { undercover: 1, mrWhite: 1, jester: 1, lovers: true }, () => 0.1);
    expect(pemain.filter((x) => x.peran === 'jester')).toHaveLength(1);
    const lovers = pemain.filter((x) => x.pasanganLovers != null);
    expect(lovers).toHaveLength(2);
    expect(pemain.every((x) => x.peran !== 'jester' || x.pasanganLovers == null)).toBe(true);
    const [a] = lovers;
    expect(pemain[a.pasanganLovers!].pasanganLovers).toBe(pemain.indexOf(a));
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
