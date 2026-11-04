import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bisaGantiLagi, pesanGantiUsername } from '../lib/supabase/data';
import { pilihanPeringkat } from '../lib/supabase/kamus';
import { KUNCI, simpan } from '../lib/storage';

const isi = new Map<string, string>();
const g = globalThis as unknown as { window?: unknown };
beforeEach(() => {
  isi.clear();
  g.window = { localStorage: { getItem: (k: string) => isi.get(k) ?? null, setItem: (k: string, v: string) => void isi.set(k, v), removeItem: (k: string) => void isi.delete(k) } };
});
afterEach(() => {
  delete g.window;
});

describe('pilihan peringkat', () => {
  it('bawaan jumlah menang dan keseluruhan; tersimpan dibaca; nilai aneh diabaikan', () => {
    expect(pilihanPeringkat()).toEqual({ urut: 'menang', peran: 'semua' });
    simpan(KUNCI.peringkatUrut, 'winrate');
    simpan(KUNCI.peringkatPeran, 'mrwhite');
    expect(pilihanPeringkat()).toEqual({ urut: 'winrate', peran: 'mrwhite' });
    simpan(KUNCI.peringkatPeran, 'raja');
    expect(pilihanPeringkat().peran).toBe('semua');
  });
});

describe('ganti username', () => {
  it('jeda 7 hari sejak terakhir diganti', () => {
    const t = Date.parse('2026-11-04T09:00:00Z');
    expect(bisaGantiLagi(null, t)).toBeNull();
    expect(bisaGantiLagi('2026-11-01T09:00:00Z', t)?.toISOString()).toBe('2026-11-08T09:00:00.000Z');
    expect(bisaGantiLagi('2026-10-28T08:59:00Z', t)).toBeNull();
  });
  it('pesan galat dalam bahasa Indonesia', () => {
    expect(pesanGantiUsername({ code: '23505' })).toBe('Username sudah dipakai.');
    expect(pesanGantiUsername({ code: 'P0001', message: 'Username baru bisa diganti lagi pada 08-11-2026 16:00 WIB' })).toContain('bisa diganti lagi');
    expect(pesanGantiUsername({ code: 'xx' })).toContain('Gagal mengganti username');
  });
});
