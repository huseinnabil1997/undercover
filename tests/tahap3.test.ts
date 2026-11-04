import { describe, expect, it } from 'vitest';
import { alihkanHost, buatStateHost, reduceHost } from '../lib/online/host';
import { dariBase64, hexTopik, keBase64 } from '../lib/online/relay';
import { barisHasilRoom } from '../lib/supabase/room';
import type { Aksi, StateHost } from '../lib/online/types';

const now = 1000;
const jalan = (s: StateHost, ...aksi: Aksi[]) => aksi.reduce((x, a) => reduceHost(x, a, { now, rng: () => 0.3 }).state, s);
const PASANGAN = { civilian: 'Kopi', undercover: 'Teh' };

function room(): StateHost {
  const s = buatStateHost('ABCDE', 'h', 'host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'] }, now);
  const awal = { ...s, pemain: s.pemain.map((p) => ({ ...p, uid: 'u-h' })) };
  return jalan(awal, { jenis: 'gabung', id: 'a', nama: 'satu', uid: 'u-a' }, { jenis: 'gabung', id: 'b', nama: 'dua', uid: 'u-b' });
}

describe('gabung dengan akun terverifikasi', () => {
  it('menyimpan uid dan menolak akun ganda atau uid berbeda', () => {
    const s = room();
    expect(s.pemain.find((p) => p.id === 'a')?.uid).toBe('u-a');
    expect(reduceHost(s, { jenis: 'gabung', id: 'c', nama: 'tiga', uid: 'u-a' }, { now }).tolak).toBe('Akun ini sudah ada di room.');
    expect(reduceHost(s, { jenis: 'gabung', id: 'a', nama: 'satu', uid: 'u-x' }, { now }).tolak).toBeTruthy();
  });
});

describe('host pindah', () => {
  it('pemain baru jadi host, yang lain offline, seq naik', () => {
    const s = jalan(room(), { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' } as Aksi);
    const t = alihkanHost(JSON.parse(JSON.stringify(s)), 'a', false, now + 5)!;
    expect(t.hostId).toBe('a');
    expect(t.pemain.find((p) => p.id === 'a')?.online).toBe(true);
    expect(t.pemain.find((p) => p.id === 'h')?.online).toBe(false);
    expect(t.seq).toBeGreaterThan(s.seq);
    expect(t.game?.pasangan).toEqual(s.game?.pasangan);
  });
  it('host yang keluar sengaja di lobby dikeluarkan dari daftar', () => {
    const t = alihkanHost(room(), 'b', true, now)!;
    expect(t.hostId).toBe('b');
    expect(t.pemain.some((p) => p.id === 'h')).toBe(false);
  });
  it('menolak snapshot rusak atau pemain yang bukan anggota', () => {
    expect(alihkanHost({ x: 1 }, 'a', false, now)).toBeNull();
    expect(alihkanHost(room(), 'zz', false, now)).toBeNull();
  });
});

describe('topik dan base64', () => {
  it('mengambil hex topik relay', () => {
    const hex = 'a'.repeat(32);
    expect(hexTopik(`undercover/r1/${hex}/h`)).toBe(hex);
    expect(hexTopik('undercover/r1/xyz/h')).toBeNull();
  });
  it('base64 bolak balik', () => {
    const b = new Uint8Array(70000).map((_, i) => i % 256);
    expect(dariBase64(keBase64(b))).toEqual(b);
    expect(dariBase64('%%%')).toBeNull();
  });
});

describe('baris hasil room', () => {
  it('hanya saat fase hasil dan minimal 3 pemain terverifikasi', () => {
    const s = jalan(room(), { jenis: 'mulai', pasangan: PASANGAN, dari: 'h', idMain: '00000000-0000-4000-8000-000000000001' } as Aksi);
    expect(barisHasilRoom(s)).toBeNull();
    const selesai: StateHost = { ...s, game: { ...s.game!, fase: 'hasil', pemenang: 'civilian' } };
    const r = barisHasilRoom(selesai)!;
    expect(r.baris.map((b) => b.user_id).sort()).toEqual(['u-a', 'u-b', 'u-h']);
    const tanpaUid: StateHost = { ...selesai, pemain: selesai.pemain.map((p) => (p.id === 'b' ? { ...p, uid: undefined } : p)) };
    expect(barisHasilRoom(tanpaUid)).toBeNull();
  });
});
