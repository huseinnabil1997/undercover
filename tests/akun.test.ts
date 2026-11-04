import { describe, expect, it } from 'vitest';
import { cekPassword, cekUsername, emailDari, menangDengan, peranDb, persen, pesanGalatAuth, ringkasStatistik } from '../lib/akun';
import { barisRiwayat } from '../lib/supabase/data';

describe('akun', () => {
  it('validasi username', () => {
    expect(cekUsername('ab')).not.toBeNull();
    expect(cekUsername('a'.repeat(21))).not.toBeNull();
    expect(cekUsername('budi-1')).not.toBeNull();
    expect(cekUsername('budi santoso')).not.toBeNull();
    expect(cekUsername(' Budi_1 ')).toBeNull();
    expect(cekUsername('abc')).toBeNull();
  });
  it('validasi password', () => {
    expect(cekPassword('12345')).not.toBeNull();
    expect(cekPassword('123456')).toBeNull();
  });
  it('email sintetis tanpa beda besar kecil', () => {
    expect(emailDari(' Budi_1 ')).toBe('budi_1@undercover.local');
    expect(emailDari('BUDI_1')).toBe(emailDari('budi_1'));
  });
  it('pesan galat dalam bahasa Indonesia', () => {
    expect(pesanGalatAuth({ code: 'user_already_exists', message: 'User already registered' })).toBe('Username sudah dipakai.');
    expect(pesanGalatAuth({ code: 'invalid_credentials' })).toBe('Username atau password salah.');
    expect(pesanGalatAuth({ message: 'Failed to fetch' })).toContain('internet');
    expect(pesanGalatAuth(null)).toBe('Gagal. Coba lagi.');
  });
  it('aturan menang per peran', () => {
    expect(menangDengan('civilian', 'civilian')).toBe(true);
    expect(menangDengan('undercover', 'civilian')).toBe(false);
    expect(menangDengan('undercover', 'penyusup')).toBe(true);
    expect(menangDengan('mrwhite', 'penyusup')).toBe(true);
    expect(menangDengan('civilian', 'penyusup')).toBe(false);
    expect(menangDengan('mrwhite', 'mrwhite')).toBe(true);
    expect(menangDengan('undercover', 'mrwhite')).toBe(false);
    expect(peranDb('mrwhite')).toBe('mrwhite');
  });
  it('ringkasan statistik', () => {
    expect(persen(0, 0)).toBeNull();
    expect(persen(1, 3)).toBe(33);
    const r = ringkasStatistik([{ peran: 'civilian', main: 4, menang: 3 }, { peran: 'mrwhite', main: 1, menang: 0 }]);
    expect(r.main).toBe(5);
    expect(r.menang).toBe(3);
    expect(r.persen).toBe(60);
    expect(r.perPeran.civilian).toEqual({ main: 4, menang: 3, persen: 75 });
    expect(r.perPeran.undercover).toEqual({ main: 0, menang: 0, persen: null });
    expect(r.perPeran.mrwhite.persen).toBe(0);
  });
  it('baris riwayat konsisten dengan aturan database', () => {
    const b = barisRiwayat({
      idMain: '00000000-0000-4000-8000-000000000000',
      peran: 'undercover',
      pemenang: 'penyusup',
      pasangan: { civilian: 'Kopi', undercover: 'x'.repeat(80), sumber: 'Klasik' },
      jumlahPemain: 5,
    });
    expect(b).toMatchObject({ mode: 'online', peran: 'undercover', menang: true, kata_civilian: 'Kopi', jumlah_pemain: 5 });
    expect(b.kata_undercover.length).toBe(60);
  });
});

describe('pencarian username', () => {
  it('escape karakter ilike', async () => {
    const { polaPersis } = await import('../lib/supabase/data');
    expect(polaPersis(' uji_a ')).toBe('uji\\_a');
    expect(polaPersis('a%b')).toBe('a\\%b');
  });
});

describe('avatar', () => {
  it('inisial, warna tetap, url berversi, potong tengah', async () => {
    const a = await import('../lib/avatar');
    expect(a.inisial('uji_budi')).toBe('UJ');
    expect(a.inisial('__')).toBe('_');
    expect(a.warnaAvatar('Budi')).toBe(a.warnaAvatar('budi'));
    expect(a.warnaAvatar('budi')).toMatch(/^hsl\(\d+ 55% 38%\)$/);
    expect(a.urlAvatar('u1', null)).toBeNull();
    expect(a.urlAvatar('u1', 3)).toMatch(/\/storage\/v1\/object\/public\/avatars\/u1\/avatar\.webp\?v=3$/);
    expect(a.potongTengah(400, 300)).toEqual({ x: 50, y: 0, sisi: 300 });
    expect(a.potongTengah(300, 401)).toEqual({ x: 0, y: 50, sisi: 300 });
  });
});
