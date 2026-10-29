import { describe, expect, it } from 'vitest';
import {
  bagiPeran, cekPemenang, eliminasi, kataUntuk, komposisiDefault, maksPenyusup, MAX_PEMAIN, MIN_PEMAIN,
  namaDefault, tebakanBenar, urutanBicara, validasiSetup,
} from '../lib/game';
import type { Pemain, Peran } from '../lib/types';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nama = (n: number) => Array.from({ length: n }, (_, i) => namaDefault(i));
const p = (peran: Peran, hidup = true, n: string = peran): Pemain => ({ nama: n, peran, hidup });

describe('setup', () => {
  it('komposisi default selalu valid untuk 3 sampai 20 pemain', () => {
    for (let n = MIN_PEMAIN; n <= MAX_PEMAIN; n++) {
      const k = komposisiDefault(n);
      expect(validasiSetup(nama(n), k)).toEqual([]);
      expect(k.undercover).toBeGreaterThanOrEqual(1);
    }
    expect(komposisiDefault(3)).toEqual({ undercover: 1, mrWhite: 0 });
    expect(komposisiDefault(5).mrWhite).toBe(1);
  });

  it('menolak jumlah pemain di luar 3 sampai 20', () => {
    expect(validasiSetup(nama(2), { undercover: 1, mrWhite: 0 }).length).toBeGreaterThan(0);
    expect(validasiSetup(nama(21), { undercover: 1, mrWhite: 0 }).length).toBeGreaterThan(0);
  });

  it('Civilian harus lebih banyak dari Undercover + Mr. White', () => {
    expect(validasiSetup(nama(4), { undercover: 1, mrWhite: 1 })).not.toEqual([]); // 2 vs 2
    expect(validasiSetup(nama(5), { undercover: 1, mrWhite: 1 })).toEqual([]); // 3 vs 2
    expect(validasiSetup(nama(6), { undercover: 2, mrWhite: 1 })).not.toEqual([]); // 3 vs 3
    expect(maksPenyusup(6)).toBe(2);
    expect(maksPenyusup(7)).toBe(3);
  });

  it('Mr. White boleh 0, tapi minimal 1 penyusup', () => {
    expect(validasiSetup(nama(4), { undercover: 1, mrWhite: 0 })).toEqual([]);
    expect(validasiSetup(nama(4), { undercover: 0, mrWhite: 1 })).toEqual([]);
    expect(validasiSetup(nama(4), { undercover: 0, mrWhite: 0 })).not.toEqual([]);
  });

  it('menolak nama kosong atau kembar', () => {
    expect(validasiSetup(['A', 'B', ' '], { undercover: 1, mrWhite: 0 })).not.toEqual([]);
    expect(validasiSetup(['A', 'b', 'B '], { undercover: 1, mrWhite: 0 })).not.toEqual([]);
  });
});

describe('pembagian peran', () => {
  it('jumlah tiap peran sesuai komposisi, untuk banyak seed', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const n = MIN_PEMAIN + (seed % (MAX_PEMAIN - MIN_PEMAIN + 1));
      const k = komposisiDefault(n);
      const pemain = bagiPeran(nama(n), k, seeded(seed));
      expect(pemain).toHaveLength(n);
      expect(pemain.filter((x) => x.peran === 'undercover')).toHaveLength(k.undercover);
      expect(pemain.filter((x) => x.peran === 'mrwhite')).toHaveLength(k.mrWhite);
      expect(pemain.filter((x) => x.peran === 'civilian')).toHaveLength(n - k.undercover - k.mrWhite);
      expect(pemain.every((x) => x.hidup)).toBe(true);
    }
  });

  it('peran tersebar acak (tiap posisi pernah jadi Undercover)', () => {
    const hit = new Array(6).fill(0);
    for (let seed = 1; seed <= 600; seed++) {
      bagiPeran(nama(6), { undercover: 1, mrWhite: 1 }, seeded(seed)).forEach((x, i) => {
        if (x.peran === 'undercover') hit[i]++;
      });
    }
    for (const h of hit) expect(h).toBeGreaterThan(50);
  });

  it('Mr. White tidak mendapat kata', () => {
    const pasangan = { civilian: 'Kopi', undercover: 'Teh', sumber: 'x' };
    expect(kataUntuk(p('civilian'), pasangan)).toBe('Kopi');
    expect(kataUntuk(p('undercover'), pasangan)).toBe('Teh');
    expect(kataUntuk(p('mrwhite'), pasangan)).toBeNull();
  });

  it('urutan bicara hanya pemain hidup dan pembicara pertama bukan Mr. White', () => {
    const pemain = [p('mrwhite', true, 'A'), p('mrwhite', true, 'B'), p('civilian', true, 'C'), p('undercover', false, 'D'), p('civilian', true, 'E')];
    for (let seed = 1; seed <= 200; seed++) {
      const u = urutanBicara(pemain, seeded(seed));
      expect(u).toHaveLength(4);
      expect(u).not.toContain(3);
      expect(pemain[u[0]].peran).not.toBe('mrwhite');
    }
  });
});

describe('kondisi menang', () => {
  it('Civilian menang saat semua penyusup tereliminasi', () => {
    expect(cekPemenang([p('civilian'), p('civilian'), p('undercover', false), p('mrwhite', false)])).toBe('civilian');
  });
  it('belum ada pemenang saat penyusup < Civilian', () => {
    expect(cekPemenang([p('civilian'), p('civilian'), p('civilian'), p('undercover'), p('mrwhite')])).toBeNull();
  });
  it('penyusup menang saat penyusup >= Civilian', () => {
    expect(cekPemenang([p('civilian'), p('civilian'), p('undercover'), p('mrwhite'), p('civilian', false)])).toBe('penyusup');
  });
  it('tinggal 2 pemain dengan 1 penyusup: penyusup menang', () => {
    expect(cekPemenang([p('civilian'), p('mrwhite'), p('civilian', false)])).toBe('penyusup');
    expect(cekPemenang([p('civilian'), p('undercover'), p('civilian', false)])).toBe('penyusup');
  });
  it('alur eliminasi lengkap', () => {
    let pemain = [p('civilian', true, 'A'), p('civilian', true, 'B'), p('civilian', true, 'C'), p('undercover', true, 'D')];
    pemain = eliminasi(pemain, 0);
    expect(pemain[0].hidup).toBe(false);
    expect(cekPemenang(pemain)).toBeNull();
    expect(cekPemenang(eliminasi(pemain, 3))).toBe('civilian');
    expect(cekPemenang(eliminasi(pemain, 1))).toBe('penyusup');
  });
});

describe('tebakan Mr. White', () => {
  it('trim dan tidak peka huruf besar/kecil', () => {
    expect(tebakanBenar('  kopi ', 'Kopi')).toBe(true);
    expect(tebakanBenar('NASI   GORENG', 'Nasi Goreng')).toBe(true);
    expect(tebakanBenar('teh', 'Kopi')).toBe(false);
    expect(tebakanBenar('   ', 'Kopi')).toBe(false);
  });
});

