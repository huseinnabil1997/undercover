import { describe, expect, it } from 'vitest';
import { bentukMatch, bolehMulaiOtomatis, formatTunggu, jumlahMenunggu, labelUkuran, rapikanStatus, ukuranValid, type Antre } from '../lib/online/antrean';

const a = (id: string, ukuran: number | null, masuk: number): Antre => ({ id, ukuran, masuk });
const T = 1_000_000;

describe('bentukMatch', () => {
  it('ukuran tetap terbentuk tepat saat N pemain ada, host = yang paling dulu masuk', () => {
    const q = [a('e', 5, T + 4), a('b', 5, T + 1), a('a', 5, T), a('c', 5, T + 2), a('d', 5, T + 3)];
    const { match, sisa } = bentukMatch(q, T + 5);
    expect(match).toEqual([{ ids: ['a', 'b', 'c', 'd', 'e'], host: 'a', ukuran: 5 }]);
    expect(sisa).toEqual([]);
  });

  it('belum cukup: tidak ada match', () => {
    expect(bentukMatch([a('a', 5, T), a('b', 5, T + 1), a('c', 5, T + 2), a('d', 5, T + 3)], T + 99_000).match).toEqual([]);
  });

  it('Acak mengisi bucket tetap; pemain tetap didahulukan, sisa diisi Acak terlama', () => {
    const q = [a('x1', null, T), a('x2', null, T + 1), a('x3', null, T + 2), a('f1', 4, T + 3), a('f2', 4, T + 4)];
    const { match, sisa } = bentukMatch(q, T + 5);
    expect(match).toHaveLength(1);
    expect(match[0].ukuran).toBe(4);
    expect(match[0].ids.sort()).toEqual(['f1', 'f2', 'x1', 'x2']);
    // Host = paling dulu masuk antrean, walau dia Acak.
    expect(match[0].host).toBe('x1');
    expect(sisa.map((s) => s.id)).toEqual(['x3']);
  });

  it('bucket dengan pemain tetap terlama diproses dulu', () => {
    const q = [a('s1', 6, T), a('f1', 4, T + 1), ...[1, 2, 3, 4, 5].map((i) => a(`x${i}`, null, T + 10 + i))];
    const { match } = bentukMatch(q, T + 20);
    expect(match[0].ukuran).toBe(6);
    expect(match[0].ids).toContain('s1');
    expect(match).toHaveLength(1);
  });

  it('hanya Acak: tunggu 20 detik sejak pemain Acak terlama, minimal 4, maksimal 8', () => {
    const q = [1, 2, 3, 4, 5].map((i) => a(`x${i}`, null, T + i * 1000));
    expect(bentukMatch(q, T + 1000 + 19_999).match).toEqual([]);
    const { match } = bentukMatch(q, T + 1000 + 20_000);
    expect(match).toEqual([{ ids: ['x1', 'x2', 'x3', 'x4', 'x5'], host: 'x1', ukuran: 5 }]);
    expect(bentukMatch(q.slice(0, 3), T + 99_000).match).toEqual([]);
  });

  it('8 pemain Acak langsung jadi match tanpa menunggu, sisanya tetap antre', () => {
    const q = Array.from({ length: 10 }, (_, i) => a(`x${i}`, null, T + i));
    const { match, sisa } = bentukMatch(q, T + 10);
    expect(match).toHaveLength(1);
    expect(match[0].ukuran).toBe(8);
    expect(sisa.map((s) => s.id)).toEqual(['x8', 'x9']);
  });

  it('beberapa match sekaligus, tidak ada pemain ganda', () => {
    const q = [...[0, 1, 2, 3].map((i) => a(`p${i}`, 4, T + i)), ...[0, 1, 2, 3].map((i) => a(`q${i}`, 4, T + 10 + i))];
    const { match } = bentukMatch(q, T + 20);
    expect(match.map((m) => m.host)).toEqual(['p0', 'q0']);
    const semua = match.flatMap((m) => m.ids);
    expect(new Set(semua).size).toBe(semua.length);
  });
});

describe('pembantu antrean', () => {
  it('jumlahMenunggu per bucket', () => {
    const q = [a('a', 5, T), a('b', null, T), a('c', 6, T)];
    expect(jumlahMenunggu(q, 5)).toBe(2);
    expect(jumlahMenunggu(q, null)).toBe(3);
  });
  it('ukuranValid dan label', () => {
    expect(ukuranValid(null)).toBe(true);
    expect(ukuranValid(4)).toBe(true);
    expect(ukuranValid(3)).toBe(false);
    expect(ukuranValid(9)).toBe(false);
    expect(labelUkuran(null)).toBe('Acak');
    expect(labelUkuran(6)).toBe('6 pemain');
  });
  it('rapikanStatus menolak kode tidak valid', () => {
    expect(rapikanStatus(null)).toBeNull();
    expect(rapikanStatus({ ukuran: 5, masuk: 'x', kode: 'ABCDE2', host: true, jumlah: 5, menunggu: null })).toMatchObject({ kode: 'ABCDE2', host: true, jumlah: 5 });
    expect(rapikanStatus({ ukuran: null, masuk: 'x', kode: 'abc0OI', menunggu: 3 })).toMatchObject({ kode: null, menunggu: 3, host: false });
    expect(rapikanStatus({ ukuran: 3, masuk: 'x' })).toBeNull();
  });
  it('mulai otomatis: semua gabung, atau batas waktu dengan minimal 4', () => {
    expect(bolehMulaiOtomatis(5, 5, 0)).toBe(true);
    expect(bolehMulaiOtomatis(4, 5, 10_000)).toBe(false);
    expect(bolehMulaiOtomatis(4, 5, 45_000)).toBe(true);
    expect(bolehMulaiOtomatis(3, 5, 99_000)).toBe(false);
  });
  it('formatTunggu', () => {
    expect(formatTunggu(65_400)).toBe('1:05');
  });
});
