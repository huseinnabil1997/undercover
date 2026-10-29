import { describe, expect, it } from 'vitest';
import { PEMUAT_KATEGORI, META_KATEGORI } from '../data/words';
import { PASANGAN_KLASIK } from '../data/klasik';
import {
  PANJANG_KATA_DEFAULT, pilihPasangan, rapikanPanjangKata, saringPanjangKata, satuKata, TanpaPasanganError,
} from '../lib/game';
import { KOMBINASI_PER_KATEGORI, KOMBINASI_SATU_KATA, totalKombinasi } from '../lib/bankKata';
import { buatStateHost, reduceHost } from '../lib/online/host';
import type { Kategori } from '../lib/types';

const contoh: Kategori = {
  id: 'uji',
  nama: 'Uji',
  subkategori: [
    { id: 'a', nama: 'A', kata: ['Kopi', 'Teh', 'Es Teh', 'Kupu-Kupu'] },
    { id: 'b', nama: 'B', kata: ['Nasi Goreng', 'Mie Ayam', 'Soto'] },
    { id: 'c', nama: 'C', kata: ['Sate Ayam', 'Bakso Urat'] },
  ],
};

describe('filter panjang kata', () => {
  it('satuKata: spasi berarti lebih dari satu kata, tanda hubung tetap satu', () => {
    expect(satuKata('Kopi')).toBe(true);
    expect(satuKata('Kupu-Kupu')).toBe(true);
    expect(satuKata('Es Teh')).toBe(false);
  });

  it('mode satu membuang kata berspasi dan melewati subkategori dengan kurang dari 2 kata', () => {
    const { kategori } = saringPanjangKata([contoh], [], 'satu');
    expect(kategori).toHaveLength(1);
    expect(kategori[0].subkategori.map((s) => s.id)).toEqual(['a']);
    expect(kategori[0].subkategori[0].kata).toEqual(['Kopi', 'Teh', 'Kupu-Kupu']);
    // data asli tidak diubah
    expect(contoh.subkategori[0].kata).toHaveLength(4);
  });

  it('mode bebas tidak menyaring apa pun', () => {
    const { kategori, klasik } = saringPanjangKata([contoh], [['Es Teh', 'Kopi']], 'bebas');
    expect(kategori[0].subkategori).toHaveLength(3);
    expect(klasik).toHaveLength(1);
  });

  it('pasangan Klasik berspasi ikut disaring di mode satu', () => {
    const { klasik } = saringPanjangKata([], [['Es Teh', 'Kopi'], ['Kopi', 'Teh']], 'satu');
    expect(klasik).toEqual([['Kopi', 'Teh']]);
  });

  it('pilihPasangan mode satu hanya memberi pasangan yang kedua katanya tanpa spasi', () => {
    for (let i = 0; i < 200; i++) {
      const p = pilihPasangan({ kategori: [contoh], panjangKata: 'satu' });
      expect(satuKata(p.civilian) && satuKata(p.undercover)).toBe(true);
      expect(p.sumber).toContain('A');
    }
  });

  it('tanpa kandidat satu kata melempar TanpaPasanganError (untuk cadangan di UI)', () => {
    const multi: Kategori = { id: 'm', nama: 'M', subkategori: [{ id: 'x', nama: 'X', kata: ['Es Teh', 'Es Jeruk', 'Kopi'] }] };
    expect(() => pilihPasangan({ kategori: [multi], panjangKata: 'satu' })).toThrow(TanpaPasanganError);
    expect(() => pilihPasangan({ kategori: [multi], panjangKata: 'bebas' })).not.toThrow();
    expect(() => pilihPasangan({ kategori: [], panjangKata: 'satu' })).not.toThrow(TanpaPasanganError);
  });

  it('rapikanPanjangKata: nilai asing jatuh ke bawaan Satu kata', () => {
    expect(PANJANG_KATA_DEFAULT).toBe('satu');
    expect(rapikanPanjangKata('bebas')).toBe('bebas');
    expect(rapikanPanjangKata('satu')).toBe('satu');
    expect(rapikanPanjangKata(undefined)).toBe('satu');
    expect(rapikanPanjangKata('ngawur')).toBe('satu');
  });

  it('bank kata asli: setiap kategori masih punya pasangan satu kata dan totalnya lebih kecil', async () => {
    for (const m of META_KATEGORI) {
      const k = (await PEMUAT_KATEGORI[m.id]()).default;
      const p = pilihPasangan({ kategori: [k], panjangKata: 'satu' });
      expect(satuKata(p.civilian) && satuKata(p.undercover)).toBe(true);
      expect(KOMBINASI_SATU_KATA[m.id]).toBeGreaterThan(0);
      expect(KOMBINASI_SATU_KATA[m.id]).toBeLessThanOrEqual(KOMBINASI_PER_KATEGORI[m.id]);
    }
    expect(KOMBINASI_SATU_KATA.klasik).toBe(PASANGAN_KLASIK.filter(([a, b]) => satuKata(a) && satuKata(b)).length);
    const semua = Object.keys(KOMBINASI_PER_KATEGORI);
    expect(totalKombinasi(semua, 'satu')).toBeLessThan(totalKombinasi(semua, 'bebas'));
  });

  it('online: pengaturan panjang kata host tersimpan lewat aturPengaturan', () => {
    const s = buatStateHost('ABCDE', 'h', 'Host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'], panjangKata: 'satu' }, 0);
    const r = reduceHost(s, { jenis: 'aturPengaturan', pengaturan: { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'], panjangKata: 'bebas' }, dari: 'h' }, { now: 1, rng: Math.random });
    expect(r.state.pengaturan.panjangKata).toBe('bebas');
  });
});
