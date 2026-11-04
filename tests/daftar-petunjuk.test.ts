import { describe, expect, it } from 'vitest';
import { petunjukMilik, urutkanBaris, type EntriPetunjuk } from '../lib/petunjuk';

const e = (pemain: string, ronde: number, teks: string, waktu: number): EntriPetunjuk => ({ pemain, ronde, teks, waktu });

describe('petunjukMilik', () => {
  it('hanya milik pemain itu, ronde terbaru dulu', () => {
    const entri = [e('a', 1, 'satu', 1), e('b', 1, 'lain', 2), e('a', 2, 'dua', 3), e('a', 3, 'tiga', 4)];
    expect(petunjukMilik(entri, 'a').map((x) => x.teks)).toEqual(['tiga', 'dua', 'satu']);
    expect(petunjukMilik(entri, 'c')).toEqual([]);
  });
});

describe('urutkanBaris', () => {
  const p = (kunci: string, hidup = true) => ({ kunci, hidup });
  it('mengikuti urutan bicara, sisanya di belakang, yang tereliminasi paling bawah', () => {
    const pemain = [p('a'), p('b', false), p('c'), p('d'), p('e')];
    expect(urutkanBaris(pemain, ['d', 'a', 'c']).map((x) => x.kunci)).toEqual(['d', 'a', 'c', 'e', 'b']);
  });
  it('tanpa urutan: urutan asli, yang tereliminasi di bawah', () => {
    const pemain = [p('a', false), p('b'), p('c')];
    expect(urutkanBaris(pemain).map((x) => x.kunci)).toEqual(['b', 'c', 'a']);
  });
});
