import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bacaCacheKamus, cacheSegar, cekKata, cekPasangan, kunciKamus, pesanGalatKamus, pilihDariKamus, rapikanKata, simpanCacheKamus, UMUR_CACHE_MS } from '../lib/kamusPemain';

describe('kamus pemain: validasi', () => {
  it('merapikan spasi', () => {
    expect(rapikanKata('  Es   teh  manis ')).toBe('Es teh manis');
  });
  it('kata valid dan tidak valid', () => {
    expect(cekKata('Kopi')).toBeNull();
    expect(cekKata('K-pop')).toBeNull();
    expect(cekKata("Jum'at")).toBeNull();
    expect(cekKata('é')).not.toBeNull();
    expect(cekKata('a')).not.toBeNull();
    expect(cekKata('x'.repeat(31))).not.toBeNull();
    expect(cekKata('kopi!')).not.toBeNull();
    expect(cekKata('-kopi')).not.toBeNull();
  });
  it('kunci mengabaikan urutan dan besar kecil huruf', () => {
    expect(kunciKamus('Kopi', 'teh')).toBe(kunciKamus('TEH', 'kopi'));
  });
  it('menolak kata sama dan duplikat, kecuali entri yang sedang diubah', () => {
    const ada = [{ a: 'Kopi', b: 'Teh', k: 'Minuman' }];
    expect(cekPasangan('Kopi', 'kopi', 'Umum')).toBe('Kedua kata harus berbeda.');
    expect(cekPasangan('teh', 'KOPI', 'Umum', ada)).toBe('Pasangan ini sudah ada di kamus.');
    expect(cekPasangan('Teh', 'Kopi', 'Umum', ada, kunciKamus('Kopi', 'Teh'))).toBeNull();
    expect(cekPasangan('Susu', 'Kopi', 'U', ada)).toMatch(/Kategori/);
  });
  it('memetakan galat server', () => {
    expect(pesanGalatKamus({ code: '23505' })).toBe('Pasangan ini sudah ada di kamus.');
    expect(pesanGalatKamus({ code: 'P0001', message: 'batas kamus tercapai' })).toMatch(/300/);
  });
});

describe('kamus pemain: cache dan pilihan', () => {
  const isi = new Map<string, string>();
  const g = globalThis as unknown as { window?: unknown };
  beforeEach(() => {
    isi.clear();
    g.window = { localStorage: { getItem: (k: string) => isi.get(k) ?? null, setItem: (k: string, v: string) => void isi.set(k, v), removeItem: (k: string) => void isi.delete(k) } };
  });
  afterEach(() => {
    delete g.window;
  });
  it('cache segar 10 menit', () => {
    simpanCacheKamus([{ a: 'Kopi', b: 'Teh', k: 'Umum' }], 1000);
    const c = bacaCacheKamus();
    expect(c?.data).toHaveLength(1);
    expect(cacheSegar(c, 1000 + UMUR_CACHE_MS - 1)).toBe(true);
    expect(cacheSegar(c, 1000 + UMUR_CACHE_MS)).toBe(false);
    expect(cacheSegar(null)).toBe(false);
  });
  it('memilih pasangan dari kamus dengan label kategori', () => {
    const { pasangan, cadangan } = pilihDariKamus([{ a: 'Kopi', b: 'Teh', k: 'Minuman' }], 'satu');
    expect(cadangan).toBe(false);
    expect([pasangan.civilian, pasangan.undercover].sort()).toEqual(['Kopi', 'Teh']);
    expect(pasangan.sumber).toBe('Kamus pemain / Minuman');
  });
  it('jatuh ke bebas bila tidak ada pasangan satu kata', () => {
    expect(pilihDariKamus([{ a: 'Es teh', b: 'Es jeruk', k: 'Umum' }], 'satu').cadangan).toBe(true);
  });
  it('kamus kosong melempar galat', () => {
    expect(() => pilihDariKamus([], 'bebas')).toThrow('Kamus pemain masih kosong.');
  });
});
