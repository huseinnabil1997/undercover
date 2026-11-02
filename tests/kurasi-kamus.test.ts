import { describe, expect, it } from 'vitest';
import { PEMUAT_KATEGORI } from '../data/words';
import type { Kategori } from '../lib/types';

async function semuaKata(): Promise<Set<string>> {
  const hasil = new Set<string>();
  for (const muat of Object.values(PEMUAT_KATEGORI)) {
    const k: Kategori = (await muat()).default;
    for (const s of k.subkategori) for (const w of s.kata) hasil.add(w.toLowerCase());
  }
  return hasil;
}

describe('kurasi Kamus kita', () => {
  it('kata yang kurang dikenal sudah dibuang', async () => {
    const kata = await semuaKata();
    for (const w of ['Ajag', 'Garangan', 'Kalazion', 'Koklea', 'Bisbul', 'Kawista', 'Ristretto', 'Langseng', 'Gayo Lues', 'Fumarol']) {
      expect(kata.has(w.toLowerCase()), w).toBe(false);
    }
  });

  it('kata populer ada di kamus', async () => {
    const kata = await semuaKata();
    for (const w of ['Seblak', 'Indomie', 'Indomaret', 'Raja Ampat', 'Sora', 'Marcel', 'Shopee', 'Persib', 'Agak Laen', 'Mobile Legends']) {
      expect(kata.has(w.toLowerCase()), w).toBe(true);
    }
  });
});
