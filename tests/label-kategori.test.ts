import { describe, expect, it } from 'vitest';
import { labelKategoriLobby, labelKategoriPasangan, namaIdKategori } from '../lib/labelKategori';

describe('labelKategoriPasangan', () => {
  it('mengembalikan sumber atau Kata pemain', () => {
    expect(labelKategoriPasangan('Klasik')).toBe('Klasik');
    expect(labelKategoriPasangan('  ')).toBe('Kata pemain');
    expect(labelKategoriPasangan(undefined)).toBe('Kata pemain');
  });
});

describe('labelKategoriLobby', () => {
  it('campur dan ringkas daftar', () => {
    expect(labelKategoriLobby({ kategori: ['a'], sumberCampur: true })).toMatch(/Campur/);
    expect(labelKategoriLobby({ kategori: [], sumberKata: 'kamus' })).toMatch(/Belum/);
    expect(namaIdKategori('p:Buatan')).toBe('Buatan');
  });
});
