import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAFTAR_SUMBER_INTERNET, KREDIT_SUMBER_INTERNET } from '../lib/bankKata';
import { KATEGORI_INTERNET } from '../data/internet';
import { PASANGAN_INTERNET } from '../data/internet/pasangan';

// Sama dengan normal() di scripts/generate_internet.py: huruf kecil, tanpa diakritik, spasi dirapikan.
const normal = (s: string) =>
  s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const kunci = (a: string, b: string) => [normal(a), normal(b)].sort().join(' | ');

const SUMBER_WAJIB = [
  'MASJV/undercover-game (MIT)',
  'antebrl/undercover-word-game (MIT)',
  'CK-Arena (Apache-2.0)',
  'sqiprasanna/mr-white-undercover (MIT)',
  'trk78/undercover-plus (MIT)',
  'chud-lori/ethok (tanpa lisensi)',
  'DaengWithAI/undercover-indonesia (tanpa lisensi)',
  'Egi-Pebriyawan/game-undercover-indonesia (tanpa lisensi)',
  'arisandi95/undercover-game-indonesia (tanpa lisensi)',
  'tejasdasari06/Imposter-game (tanpa lisensi)',
  'Schluby/Undercover (tanpa lisensi)',
  'Bipash2002/undercover (tanpa lisensi)',
  'Deepak-Ajay-Dubey/word-spy (tanpa lisensi)',
  'ArashadDodhiya/UnderCoverGame (tanpa lisensi)',
  'AmazinAmazon/Undercover (tanpa lisensi)',
  'jishnurajendran/undercover (tanpa lisensi)',
  'srinath987/Undercover-clone (MIT)',
  'VM1235/undercover-word-game (MIT)',
  'ChairGamertag87/undercover (MIT)',
  'Nidroz/undercover (MIT)',
  'zhengyi-yang/WhoIsTheSpy (MIT)',
  'xuqssq/whois-undercover-game (MIT)',
  'atomgenie/open-undercover (MIT)',
  'FireEmblem59/Undercover (MIT)',
  'Eikins/Undercover-Bot (MIT)',
  'Qixuan112/WordSpy-Undercover (MIT)',
  'llmons/who-is-the-undercover (Apache-2.0)',
];

describe('integritas data kata Internet', () => {
  it('tidak ada pasangan ganda di seluruh kategori (abaikan huruf besar, diakritik, dan urutan)', () => {
    const terlihat = new Map<string, string>();
    const ganda: string[] = [];
    for (const [id, daftar] of Object.entries(PASANGAN_INTERNET)) {
      for (const [a, b] of daftar) {
        const k = kunci(a, b);
        if (terlihat.has(k)) ganda.push(`${id}: ${a} / ${b} (sudah di ${terlihat.get(k)})`);
        else terlihat.set(k, id);
      }
    }
    expect(ganda).toEqual([]);
  });

  it('setiap kata rapi: tidak kosong, tanpa spasi ganda atau di tepi, tanpa em/en dash, kedua kata beda', () => {
    for (const daftar of Object.values(PASANGAN_INTERNET)) {
      for (const [a, b] of daftar) {
        for (const w of [a, b]) {
          expect(w.length).toBeGreaterThan(0);
          expect(w).toBe(w.trim());
          expect(w).not.toMatch(/\s{2}/);
          expect(w).not.toMatch(/[\u2013\u2014]/);
        }
        expect(normal(a)).not.toBe(normal(b));
      }
    }
  });

  it('metadata kategori lengkap dan cocok dengan isi', () => {
    const ids = KATEGORI_INTERNET.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(PASANGAN_INTERNET).sort()).toEqual([...ids].sort());
    for (const k of KATEGORI_INTERNET) {
      expect(k.id).toMatch(/^i-[a-z0-9-]+$/);
      expect(k.nama.trim().length).toBeGreaterThan(0);
      expect(k.sumber.length).toBeGreaterThan(0);
      expect(k.jumlah).toBeGreaterThanOrEqual(5);
    }
    const total = KATEGORI_INTERNET.reduce((t, k) => t + k.jumlah, 0);
    expect(total).toBeGreaterThan(1500);
  });

  it('semua sumber tercatat di kredit aplikasi, README, dan ATRIBUSI.md', () => {
    expect([...DAFTAR_SUMBER_INTERNET].sort()).toEqual([...SUMBER_WAJIB].sort());
    const atribusi = readFileSync(join(__dirname, '..', 'ATRIBUSI.md'), 'utf8');
    const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
    for (const s of SUMBER_WAJIB) {
      expect(KREDIT_SUMBER_INTERNET).toContain(s);
      const repo = s.split(' (')[0];
      expect(atribusi).toContain(repo);
      expect(readme).toContain(repo);
    }
  });

  it('jumlah di README sama dengan data', () => {
    const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
    const total = KATEGORI_INTERNET.reduce((t, k) => t + k.jumlah, 0);
    expect(readme).toContain(`${total} pasangan kata di ${KATEGORI_INTERNET.length} kategori`);
  });
});
