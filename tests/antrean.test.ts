import { describe, expect, it } from 'vitest';
import { alasanMulaiOtomatis, formatTunggu, labelUkuran, maksRoomBaru, pilihRoom, rapikanStatus, sisaHitungMundur, ukuranValid, type RoomTerbuka } from '../lib/online/antrean';

const r = (kode: string, maks: number, jumlah: number, dibuat: number, dimulai = false): RoomTerbuka => ({ kode, maks, jumlah, dibuat, dimulai });

describe('pilihRoom', () => {
  it('ukuran N: room terbuka tertua dengan maks N yang belum penuh', () => {
    const rooms = [r('BBBBBB', 5, 2, 20), r('AAAAAA', 5, 4, 10), r('CCCCCC', 6, 1, 1)];
    expect(pilihRoom(rooms, 5)?.kode).toBe('AAAAAA');
    expect(pilihRoom(rooms, 6)?.kode).toBe('CCCCCC');
    expect(pilihRoom(rooms, 7)).toBeNull();
  });
  it('tidak memilih room penuh atau yang sudah dimulai', () => {
    const rooms = [r('AAAAAA', 5, 5, 1), r('BBBBBB', 5, 3, 2, true), r('CCCCCC', 5, 1, 3)];
    expect(pilihRoom(rooms, 5)?.kode).toBe('CCCCCC');
    expect(pilihRoom([r('AAAAAA', 5, 5, 1), r('BBBBBB', 5, 2, 2, true)], 5)).toBeNull();
  });
  it('room tanpa anggota yang berdetak tidak dipilih', () => {
    expect(pilihRoom([{ ...r('AAAAAA', 5, 2, 1), hidup: false }, r('BBBBBB', 5, 1, 2)], null)?.kode).toBe('BBBBBB');
  });
  it('Acak: room mana saja, paling ramai dulu lalu paling lama', () => {
    const rooms = [r('AAAAAA', 8, 2, 1), r('BBBBBB', 4, 3, 5), r('CCCCCC', 6, 3, 3), r('DDDDDD', 5, 5, 0)];
    expect(pilihRoom(rooms, null)?.kode).toBe('CCCCCC');
    expect(pilihRoom([], null)).toBeNull();
  });
  it('room baru: maks N, atau 8 untuk Acak', () => {
    expect(maksRoomBaru(6)).toBe(6);
    expect(maksRoomBaru(null)).toBe(8);
  });
});

describe('mulai otomatis', () => {
  it('penuh langsung mulai', () => {
    expect(alasanMulaiOtomatis(5, 5, 0)).toBe('penuh');
  });
  it('minimal 4 dan 60 detik tanpa pemain baru', () => {
    expect(alasanMulaiOtomatis(4, 6, 59_999)).toBeNull();
    expect(alasanMulaiOtomatis(4, 6, 60_000)).toBe('diam');
    expect(alasanMulaiOtomatis(3, 6, 999_000)).toBeNull();
  });
  it('hitung mundur hanya berjalan saat minimal 4', () => {
    expect(sisaHitungMundur(3, 10_000)).toBeNull();
    expect(sisaHitungMundur(4, 15_000)).toBe(45_000);
    expect(sisaHitungMundur(4, 90_000)).toBe(0);
  });
});

describe('pembantu', () => {
  it('ukuranValid dan label', () => {
    expect(ukuranValid(null)).toBe(true);
    expect(ukuranValid(8)).toBe(true);
    expect(ukuranValid(3)).toBe(false);
    expect(labelUkuran(null)).toBe('Acak');
    expect(labelUkuran(6)).toBe('Maks 6 pemain');
  });
  it('rapikanStatus', () => {
    expect(rapikanStatus(null)).toBeNull();
    expect(rapikanStatus({ kode: 'ABCDE2', maks: 5, jumlah: 3, status: 'lobby', diam_ms: 1200, host: true })).toEqual({ kode: 'ABCDE2', maks: 5, jumlah: 3, dimulai: false, diamMs: 1200, host: true });
    expect(rapikanStatus({ kode: 'ABCDE2', maks: 5, jumlah: 3, status: 'dimulai' })?.dimulai).toBe(true);
    expect(rapikanStatus({ kode: 'abc0OI', maks: 5 })).toBeNull();
    expect(rapikanStatus({ kode: 'ABCDE2', maks: 9 })).toBeNull();
  });
  it('formatTunggu', () => {
    expect(formatTunggu(65_400)).toBe('1:05');
  });
});
