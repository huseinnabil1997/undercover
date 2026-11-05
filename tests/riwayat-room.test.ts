import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/klien', () => ({ supabase: () => ({}) }));
vi.mock('../lib/supabase/klien', () => ({ supabase: () => ({}) }));
import { galatDitolakServer, PESAN_GAGAL_CATAT, PESAN_ROOM_TAK_TERDAFTAR } from '../lib/supabase/room';

describe('room tidak terdaftar', () => {
  it('penolakan server (batas room) dikenali agar host diberi tahu', () => {
    expect(galatDitolakServer({ code: 'P0001', message: 'terlalu banyak room' })).toBe(true);
    expect(galatDitolakServer({ code: '28000', message: 'sesi_tidak_aktif' })).toBe(true);
  });
  it('jaringan putus tidak dianggap penolakan server', () => {
    expect(galatDitolakServer(new TypeError('Failed to fetch'))).toBe(false);
    expect(galatDitolakServer({ code: '', message: 'x' })).toBe(false);
    expect(galatDitolakServer(null)).toBe(false);
  });
  it('pesan dalam bahasa Indonesia tanpa em dash', () => {
    for (const p of [PESAN_ROOM_TAK_TERDAFTAR, PESAN_GAGAL_CATAT]) expect(p).not.toMatch(/\u2014/);
  });
});
