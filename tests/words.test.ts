import { describe, expect, it } from 'vitest';
import { META_KATEGORI, PEMUAT_KATEGORI } from '../data/words';
import { PASANGAN_KLASIK } from '../data/klasik';
import { ambilDuaKata, catatRiwayat, jumlahKombinasiMeta, kombinasi2, kunciPasangan, pilihPasangan } from '../lib/game';
import type { Kategori } from '../lib/types';

// Subkategori nama (tokoh, judul, merek, tempat) boleh lebih dari satu kata.
const SUBKAT_NAMA = new Set([
  'Hero Mobile Legends',
  'Item & Istilah Mobile Legends',
  'Hero Dota 2',
  'Karakter Genshin Impact',
  'Agen Valorant',
  'Hero Honor of Kings',
  'Pokemon',
  'Karakter Anime',
  'Judul Anime',
  'Istilah Anime',
  'Karakter Film & Superhero',
  'Film Hollywood',
  'Film Indonesia',
  'Film Animasi Disney & Pixar',
  'Serial TV & Drama',
  'Atlet & Pesepak Bola',
  'Klub Sepak Bola',
  'Tokoh Sejarah Indonesia',
  'Penyanyi & Band Indonesia',
  'Penyanyi & Grup Dunia',
  'Provinsi',
  'Aplikasi & Media Sosial',
  'Merek Mobil & Motor',
  'Kota & Kabupaten',
  'Kota Dunia',
  'Negara',
  'Judul Game Populer',
  'Tempat Wisata Indonesia',
]);

async function muatSemua(): Promise<Kategori[]> {
  return Promise.all(META_KATEGORI.map(async (m) => (await PEMUAT_KATEGORI[m.id]()).default));
}

describe('bank kata', () => {
  it('total kombinasi pasangan lebih dari 1.000.000', async () => {
    const semua = await muatSemua();
    const total = semua.reduce((t, k) => t + k.subkategori.reduce((s, sub) => s + kombinasi2(sub.kata.length), 0), 0);
    const kata = semua.reduce((t, k) => t + k.subkategori.reduce((s, sub) => s + sub.kata.length, 0), 0);
    const sub = semua.reduce((t, k) => t + k.subkategori.length, 0);
    console.log(`[bank kata] kategori=${semua.length} subkategori=${sub} kata=${kata} kombinasi=${total} klasik=${PASANGAN_KLASIK.length}`);
    expect(total).toBeGreaterThan(1_000_000);
    expect(jumlahKombinasiMeta(META_KATEGORI)).toBe(total);
  });

  it('metadata cocok dengan data dan setiap kategori punya pemuat', async () => {
    const semua = await muatSemua();
    expect(Object.keys(PEMUAT_KATEGORI).sort()).toEqual(META_KATEGORI.map((m) => m.id).sort());
    semua.forEach((k, i) => {
      expect(k.id).toBe(META_KATEGORI[i].id);
      expect(k.subkategori.map((s) => s.kata.length)).toEqual(META_KATEGORI[i].subkategori.map((s) => s.jumlahKata));
    });
  });

  it('tidak ada kata duplikat dalam satu subkategori, tidak ada kata kosong, tanpa em dash', async () => {
    for (const k of await muatSemua()) {
      for (const s of k.subkategori) {
        expect(s.kata.length).toBeGreaterThanOrEqual(2);
        const kecil = s.kata.map((w) => w.trim().toLowerCase());
        expect(new Set(kecil).size, `${k.id}/${s.nama}`).toBe(kecil.length);
        for (const w of s.kata) {
          expect(w.trim()).toBe(w);
          expect(w.length).toBeGreaterThan(0);
          expect(w).not.toMatch(/[\u2014|]/);
        }
      }
    }
  });

  it('kata umum satu kata (tanpa spasi, tanpa CamelCase), nama boleh lebih dari satu kata', async () => {
    let nama = 0;
    for (const k of await muatSemua()) {
      for (const s of k.subkategori) {
        if (SUBKAT_NAMA.has(s.nama)) {
          nama++;
          continue;
        }
        for (const w of s.kata) {
          expect(w, `${k.id}/${s.nama}`).not.toMatch(/\s/);
          expect(w, `${k.id}/${s.nama}`).not.toMatch(/[a-z][A-Z]/);
        }
      }
    }
    expect(nama).toBe(SUBKAT_NAMA.size);
  });

  it('pasangan klasik satu kata', () => {
    for (const [a, b] of PASANGAN_KLASIK) {
      expect(a).not.toMatch(/\s/);
      expect(b).not.toMatch(/\s/);
    }
  });

  it('pasangan klasik berisi 2 kata berbeda', () => {
    for (const [a, b] of PASANGAN_KLASIK) expect(a.toLowerCase()).not.toBe(b.toLowerCase());
  });

  it('generator selalu memberi 2 kata berbeda dari subkategori yang sama', async () => {
    const semua = await muatSemua();
    const asal = new Map<string, Set<string>>();
    for (const k of semua) for (const s of k.subkategori) asal.set(`${k.nama} / ${s.nama}`, new Set(s.kata));
    for (let i = 0; i < 5000; i++) {
      const ps = pilihPasangan({ kategori: semua });
      expect(ps.civilian).not.toBe(ps.undercover);
      const set = asal.get(ps.sumber)!;
      expect(set.has(ps.civilian) && set.has(ps.undercover)).toBe(true);
    }
    for (let i = 0; i < 1000; i++) {
      const [a, b] = ambilDuaKata(['x', 'y']);
      expect(a).not.toBe(b);
    }
  });

  it('menghindari pasangan yang ada di riwayat', () => {
    const kategori: Kategori[] = [{ id: 'a', nama: 'A', subkategori: [{ id: 's', nama: 'S', kata: ['X', 'Y', 'Z'] }] }];
    const riwayat = [kunciPasangan('X', 'Y'), kunciPasangan('X', 'Z')];
    for (let i = 0; i < 200; i++) {
      const ps = pilihPasangan({ kategori, riwayat });
      expect(kunciPasangan(ps.civilian, ps.undercover)).toBe(kunciPasangan('Y', 'Z'));
    }
    const r = catatRiwayat(['a|b'], { civilian: 'Y', undercover: 'Z', sumber: '' }, 2);
    expect(r).toEqual(['y|z', 'a|b']);
  });

  it('mode Klasik saja memakai daftar kurasi', () => {
    const ps = pilihPasangan({ kategori: [], klasik: PASANGAN_KLASIK });
    expect(ps.sumber).toBe('Klasik');
  });
});
