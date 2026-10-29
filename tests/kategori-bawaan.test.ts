import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kategoriTersimpan, SEMUA_KATEGORI } from '../lib/bankKata';
import { bersihkanKunciLama, KUNCI, simpan } from '../lib/storage';

const isi = new Map<string, string>();
const g = globalThis as unknown as { window?: unknown };

beforeEach(() => {
  isi.clear();
  g.window = {
    localStorage: {
      getItem: (k: string) => isi.get(k) ?? null,
      setItem: (k: string, v: string) => void isi.set(k, v),
      removeItem: (k: string) => void isi.delete(k),
    },
  };
});
afterEach(() => {
  delete g.window;
});

describe('pilihan kategori bawaan', () => {
  it('belum pernah disimpan: semua kategori terpilih, termasuk Klasik', () => {
    expect(kategoriTersimpan()).toEqual(SEMUA_KATEGORI);
    expect(kategoriTersimpan()).toContain('klasik');
  });

  it('pilihan versi lama diabaikan dan dibersihkan sekali', () => {
    isi.set('undercover:kategori', JSON.stringify(['klasik']));
    isi.set('undercover:skor', JSON.stringify({ A: 2 }));
    expect(kategoriTersimpan()).toEqual(SEMUA_KATEGORI);
    bersihkanKunciLama();
    expect(isi.has('undercover:kategori')).toBe(false);
    expect(isi.has('undercover:skor')).toBe(false);
  });

  it('pilihan baru setelah migrasi tetap dipakai, kosong kembali ke semua', () => {
    simpan(KUNCI.kategori, ['hewan', 'klasik']);
    expect(kategoriTersimpan()).toEqual(['hewan', 'klasik']);
    simpan(KUNCI.kategori, []);
    expect(kategoriTersimpan()).toEqual(SEMUA_KATEGORI);
  });
});
