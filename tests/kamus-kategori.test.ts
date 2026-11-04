import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  kategoriTersimpan, PILIHAN_KATEGORI, PILIHAN_KATEGORI_INTERNET, pilihanKategoriGabung, rapikanKategori, siapkanPasangan, sumberTersimpan,
  tebakSumber, totalGabung,
} from '../lib/bankKata';
import { tambahanPemain } from '../lib/kamusGabung';
import { idKategori, kelompokKategori, simpanCacheKamus, type EntriKamus } from '../lib/kamusPemain';
import { alihkanHost, buatStateHost, reduceHost, viewUntuk } from '../lib/online/host';
import { KUNCI, simpan } from '../lib/storage';
import { PASANGAN_INTERNET } from '../data/internet/pasangan';

const publik = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../lib/supabase/kamus', () => ({ kamusPublik: publik.fn }));

const isi = new Map<string, string>();
const g = globalThis as unknown as { window?: unknown };
beforeEach(() => {
  isi.clear();
  g.window = { localStorage: { getItem: (k: string) => isi.get(k) ?? null, setItem: (k: string, v: string) => void isi.set(k, v), removeItem: (k: string) => void isi.delete(k) } };
  publik.fn.mockReset();
});
afterEach(() => {
  delete g.window;
});

const makanan = PILIHAN_KATEGORI.find((k) => k.nama === 'Makanan')!;
const internet0 = PILIHAN_KATEGORI_INTERNET[0];
const [ia, ib] = PASANGAN_INTERNET[internet0.id][0];

const DATA: EntriKamus[] = [
  { a: 'Rambutan', b: 'Kelengkeng', k: 'Uji Buah' },
  { a: 'Duku', b: 'Langsat', k: 'uji buah ' },
  { a: 'Sirsak', b: 'Srikaya', k: 'Uji Buah' },
  { a: 'Seblak', b: 'Cilok', k: ' MAKANAN' },
  { a: ib.toUpperCase(), b: ia, k: internet0.nama },
];

describe('kamus pemain digabung ke Kamus kita dan Internet', () => {
  it('mengelompokkan kategori tanpa beda besar kecil huruf dan spasi', () => {
    expect(idKategori(' Uji  BUAH ')).toBe('uji buah');
    expect(kelompokKategori(DATA).find((k) => k.id === 'uji buah')).toMatchObject({ nama: 'Uji Buah', jumlah: 3 });
  });

  it('nama sama masuk kategori bawaan, nama baru jadi kategori p: bertanda pemain', () => {
    const t = tambahanPemain(DATA, PILIHAN_KATEGORI);
    expect(t.perKategori.get(makanan.id)).toEqual([['Seblak', 'Cilok']]);
    expect(t.baru.map((k) => k.id)).toContain('p:uji buah');
    const pilihan = pilihanKategoriGabung('kamus', DATA);
    expect(pilihan.find((k) => k.id === 'p:uji buah')).toEqual({ id: 'p:uji buah', nama: 'Uji Buah', dariPemain: true });
    expect(pilihan.find((k) => k.id === makanan.id)?.dariPemain).toBe(false);
  });

  it('jumlah pasangan bertambah, pasangan yang sudah ada di Internet (dibalik, beda huruf) tidak dihitung dobel', () => {
    expect(totalGabung('kamus', ['p:uji buah'], 'bebas', DATA)).toBe(3);
    expect(totalGabung('internet', ['p:uji buah'], 'satu', DATA)).toBe(3);
    const t = tambahanPemain(DATA, PILIHAN_KATEGORI_INTERNET);
    expect(t.perKategori.get(internet0.id)).toHaveLength(1);
  });

  it('memilih kata dari kategori baru pemain, di Kamus kita dan Internet', async () => {
    publik.fn.mockResolvedValue({ data: DATA, dariCache: false });
    const kata = new Set(DATA.slice(0, 3).flatMap((e) => [e.a, e.b]));
    for (const sumber of ['kamus', 'internet'] as const) {
      for (let i = 0; i < 5; i++) {
        const { pasangan } = await siapkanPasangan(['p:uji buah'], 'bebas', sumber);
        expect(kata.has(pasangan.civilian) && kata.has(pasangan.undercover)).toBe(true);
      }
    }
  });

  it('gagal memuat kamus pemain: tetap jalan dengan kata bawaan', async () => {
    publik.fn.mockRejectedValue(new Error('offline'));
    const { pasangan } = await siapkanPasangan([makanan.id], 'bebas', 'kamus');
    expect(pasangan.civilian).toBeTruthy();
  });

  it('kategori p: tersimpan, bawaan semua termasuk kategori pemain dari cache, tebakSumber mengabaikan p:', () => {
    expect(rapikanKategori(['p:uji buah', 'p:', 'ngawur', makanan.id], 'kamus')).toEqual(['p:uji buah', makanan.id]);
    simpanCacheKamus(DATA);
    expect(kategoriTersimpan('kamus')).toContain('p:uji buah');
    expect(tebakSumber([makanan.id, 'p:uji buah'])).toBe('kamus');
  });

  it('setelan lama Pakai kamus pemain dihapus dengan aman', () => {
    simpan(KUNCI.pakaiKamusPemain, true);
    simpan(KUNCI.sumberKata, 'kamus');
    expect(sumberTersimpan()).toBe('kamus');
    expect(isi.has(KUNCI.pakaiKamusPemain)).toBe(false);
  });
});

describe('kamus pemain di mode online', () => {
  it('kategori pemain tersinkron ke pemain dan ikut saat host pindah', async () => {
    publik.fn.mockResolvedValue({ data: DATA, dariCache: true });
    let s = buatStateHost('ABCD', 'h', 'Host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['hewan'], sumberKata: 'kamus' }, 0);
    s = reduceHost(s, { jenis: 'gabung', id: 'p1', nama: 'Budi' }, { now: 1, rng: Math.random }).state;
    s = reduceHost(s, { jenis: 'gabung', id: 'p2', nama: 'Caca' }, { now: 1, rng: Math.random }).state;
    const pengaturan = { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['p:uji buah'], sumberKata: 'internet' as const };
    s = reduceHost(s, { jenis: 'aturPengaturan', pengaturan, dari: 'h' }, { now: 2, rng: Math.random }).state;
    expect(viewUntuk(s, 'p1').pengaturan).toMatchObject({ kategori: ['p:uji buah'] });
    expect(reduceHost(s, { jenis: 'aturPengaturan', pengaturan, dari: 'p1' }, { now: 3, rng: Math.random }).tolak).toBeTruthy();
    const { pasangan } = await siapkanPasangan(s.pengaturan.kategori, 'bebas', 'internet');
    s = reduceHost(s, { jenis: 'mulai', pasangan, idMain: 'x', dari: 'h' }, { now: 4, rng: Math.random }).state;
    const baru = alihkanHost(JSON.parse(JSON.stringify(s)), 'p1', true, 5);
    expect(baru?.pengaturan).toMatchObject({ kategori: ['p:uji buah'], sumberKata: 'internet' });
    expect(baru?.game?.pasangan).toEqual(pasangan);
  });
});
