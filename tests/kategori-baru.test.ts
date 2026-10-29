import { describe, expect, it } from 'vitest';
import { META_KATEGORI, PEMUAT_KATEGORI } from '../data/words';

async function muat(id: string) {
  return (await PEMUAT_KATEGORI[id]()).default;
}

describe('kategori Anime, Film, Game', () => {
  it('ketiga kategori tersedia di metadata (pilihan UI)', () => {
    const ids = META_KATEGORI.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['anime', 'film', 'game']));
  });

  it('Game punya subkategori per game dan hero MLBB lengkap dengan ejaan resmi', async () => {
    const game = await muat('game');
    const nama = game.subkategori.map((s) => s.nama);
    expect(nama).toEqual(
      expect.arrayContaining([
        'Judul Game Populer',
        'Hero Mobile Legends',
        'Item & Istilah Mobile Legends',
        'Hero Dota 2',
        'Karakter Genshin Impact',
        'Agen Valorant',
        'Hero Honor of Kings',
        'Pokemon',
      ]),
    );
    const hero = game.subkategori.find((s) => s.nama === 'Hero Mobile Legends')!.kata;
    console.log(`[bank kata] hero MLBB=${hero.length}`);
    expect(hero.length).toBe(133);
    for (const h of ['Layla', 'Miya', 'Alucard', 'Tigreal', 'Saber', 'Balmond', 'Zilong', 'Fanny', 'Gusion', 'Lancelot', 'Chou', 'Ling', 'Hayabusa', "Chang'e", 'X.Borg', 'Popol and Kupa', 'Yi Sun-shin', 'Lapu-Lapu', 'Yu Zhong', 'Luo Yi']) {
      expect(hero).toContain(h);
    }
    const judul = game.subkategori.find((s) => s.nama === 'Judul Game Populer')!.kata;
    for (const j of ['Mobile Legends', 'PUBG Mobile', 'Free Fire', 'Genshin Impact', 'Minecraft', 'Roblox', 'Valorant', 'Honor of Kings']) {
      expect(judul).toContain(j);
    }
    const istilah = game.subkategori.find((s) => s.nama === 'Item & Istilah Mobile Legends')!.kata;
    for (const j of ['Lord', 'Turtle', 'Savage', 'Maniac', 'Blink', 'Retribution']) expect(istilah).toContain(j);
  });

  it('Anime dan Film memuat contoh wajib', async () => {
    const anime = (await muat('anime')).subkategori.flatMap((s) => s.kata);
    for (const k of ['Naruto', 'Sasuke', 'Luffy', 'Zoro', 'Goku', 'Vegeta']) expect(anime).toContain(k);
    const film = await muat('film');
    expect(film.subkategori.map((s) => s.nama)).toEqual([
      'Film Hollywood',
      'Film Indonesia',
      'Karakter Film & Superhero',
      'Film Animasi Disney & Pixar',
      'Serial TV & Drama',
    ]);
  });
});
