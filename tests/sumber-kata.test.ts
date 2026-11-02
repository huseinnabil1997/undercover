import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  kategoriTersimpan, kunciKategori, pilihanKategori, SEMUA_KATEGORI, SEMUA_KATEGORI_INTERNET, siapkanPasangan,
  sumberTersimpan, tebakSumber, totalKombinasi,
} from '../lib/bankKata';
import { pilihPasanganDaftar, satuKata, TanpaPasanganError } from '../lib/game';
import { buatStateHost, reduceHost, viewUntuk } from '../lib/online/host';
import { KUNCI, simpan } from '../lib/storage';
import { KATEGORI_INTERNET } from '../data/internet';
import { PASANGAN_INTERNET } from '../data/internet/pasangan';

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

describe('opsi sumber kata', () => {
  it('bawaan Internet, termasuk pengguna lama yang sudah punya pilihan kategori Kamus', () => {
    expect(sumberTersimpan()).toBe('internet');
    simpan(KUNCI.kategori, ['hewan', 'klasik']);
    expect(sumberTersimpan()).toBe('internet');
    simpan(KUNCI.sumberKata, 'kamus');
    expect(sumberTersimpan()).toBe('kamus');
    simpan(KUNCI.sumberKata, 'ngawur');
    expect(sumberTersimpan()).toBe('internet');
  });

  it('daftar kategori Internet dan Kamus kita terpisah dan tidak beririsan', () => {
    const internet = pilihanKategori('internet').map((k) => k.id);
    const kamus = pilihanKategori('kamus').map((k) => k.id);
    expect(internet).toEqual(SEMUA_KATEGORI_INTERNET);
    expect(kamus).toEqual(SEMUA_KATEGORI);
    expect(internet.length).toBeGreaterThan(5);
    expect(internet.filter((id) => kamus.includes(id))).toEqual([]);
    expect(kamus).toContain('klasik');
    expect(internet).not.toContain('klasik');
  });

  it('pilihan kategori disimpan per sumber, bawaan semua', () => {
    expect(kategoriTersimpan('internet')).toEqual(SEMUA_KATEGORI_INTERNET);
    expect(kategoriTersimpan('kamus')).toEqual(SEMUA_KATEGORI);
    simpan(kunciKategori('internet'), ['i-negara', 'hewan']);
    expect(kategoriTersimpan('internet')).toEqual(['i-negara']);
    expect(kategoriTersimpan('kamus')).toEqual(SEMUA_KATEGORI);
    expect(kunciKategori('kamus')).toBe(KUNCI.kategori);
    expect(kunciKategori('internet')).not.toBe(KUNCI.kategori);
  });

  it('jumlah pasangan Internet sesuai data dan mode Satu kata lebih sedikit', () => {
    for (const k of KATEGORI_INTERNET) {
      const p = PASANGAN_INTERNET[k.id];
      expect(p).toHaveLength(k.jumlah);
      expect(p.filter(([a, b]) => satuKata(a) && satuKata(b))).toHaveLength(k.jumlahSatuKata);
      for (const [a, b] of p) expect(a.toLowerCase()).not.toBe(b.toLowerCase());
    }
    expect(totalKombinasi(SEMUA_KATEGORI_INTERNET, 'satu')).toBeLessThan(totalKombinasi(SEMUA_KATEGORI_INTERNET, 'bebas'));
  });

  it('teks Internet tanpa em dash', () => {
    const semua = JSON.stringify([KATEGORI_INTERNET, PASANGAN_INTERNET]);
    expect(semua).not.toContain('\u2014');
  });

  it('tebakSumber untuk pengaturan online lama', () => {
    expect(tebakSumber(['hewan', 'klasik'])).toBe('kamus');
    expect(tebakSumber(['i-negara'])).toBe('internet');
    expect(tebakSumber([])).toBe('internet');
  });
});

describe('pilih pasangan Internet', () => {
  const daftar = [
    { nama: 'Campur', pasangan: [['Es Teh', 'Es Jeruk'], ['Kopi', 'Teh']] as [string, string][] },
  ];

  it('mode Satu kata: kedua kata harus tanpa spasi', () => {
    for (let i = 0; i < 30; i++) {
      const p = pilihPasanganDaftar({ daftar, panjangKata: 'satu', label: 'Internet' });
      expect([p.civilian, p.undercover].sort()).toEqual(['Kopi', 'Teh']);
      expect(p.sumber).toBe('Internet / Campur');
    }
  });

  it('tanpa pasangan satu kata melempar TanpaPasanganError', () => {
    const multi = [{ nama: 'X', pasangan: [['Es Teh', 'Kopi']] as [string, string][] }];
    expect(() => pilihPasanganDaftar({ daftar: multi, panjangKata: 'satu' })).toThrow(TanpaPasanganError);
    expect(pilihPasanganDaftar({ daftar: multi, panjangKata: 'bebas' }).sumber).toBe('X');
  });

  it('siapkanPasangan memakai data Internet dan jatuh ke bebas jika perlu', async () => {
    const { pasangan, cadangan } = await siapkanPasangan(['i-negara'], 'satu', 'internet');
    expect(cadangan).toBe(false);
    expect(pasangan.sumber).toBe('Internet / Negara');
    expect(satuKata(pasangan.civilian) && satuKata(pasangan.undercover)).toBe(true);
    const daftarNegara = PASANGAN_INTERNET['i-negara'].map(([a, b]) => [a, b].sort().join('|'));
    expect(daftarNegara).toContain([pasangan.civilian, pasangan.undercover].sort().join('|'));
  });
});

describe('sinkron sumber kata di mode online', () => {
  it('host mengubah sumberKata lewat aturPengaturan dan semua pemain melihatnya', () => {
    let s = buatStateHost('ABCD', 'h', 'Host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: SEMUA_KATEGORI_INTERNET, sumberKata: 'internet' }, 0);
    s = reduceHost(s, { jenis: 'gabung', id: 'p1', nama: 'Budi' }, { now: 1, rng: Math.random }).state;
    const pengaturan = { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['hewan'], sumberKata: 'kamus' as const };
    s = reduceHost(s, { jenis: 'aturPengaturan', pengaturan, dari: 'h' }, { now: 2, rng: Math.random }).state;
    expect(s.pengaturan.sumberKata).toBe('kamus');
    expect(viewUntuk(s, 'p1').pengaturan).toMatchObject({ sumberKata: 'kamus', kategori: ['hewan'] });
    const tolak = reduceHost(s, { jenis: 'aturPengaturan', pengaturan: { ...pengaturan, sumberKata: 'internet' }, dari: 'p1' }, { now: 3, rng: Math.random });
    expect(tolak.tolak).toBeTruthy();
    expect(tolak.state.pengaturan.sumberKata).toBe('kamus');
  });
});
