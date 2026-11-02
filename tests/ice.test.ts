import { describe, expect, it } from 'vitest';
import { ICE_SERVERS, nasibNegosiasi, TUNGGU_AWAL_MS, TUNGGU_NEGOSIASI_MAKS_MS } from '../lib/online/ice';
import { BATAS_MENYAMBUNG_MS } from '../lib/online/macet';

// Regresi "pemain pertama pun tidak bisa gabung": relay TURN peerjs mati (tanpa DNS) dan batas 12 detik
// memutus negosiasi ICE yang masih berjalan sehingga pemain di jaringan lambat tidak pernah tersambung.

const semuaUrl = ICE_SERVERS.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));

describe('server ICE', () => {
  it('tidak memakai TURN peerjs yang sudah tidak punya DNS', () => {
    expect(semuaUrl.some((u) => u.includes('turn.peerjs.com'))).toBe(false);
  });

  it('tetap memakai STUN Google, semua STUN tanpa kredensial', () => {
    expect(semuaUrl).toContain('stun:stun.l.google.com:19302');
    expect(semuaUrl.every((u) => u.startsWith('stun:'))).toBe(true);
    expect(ICE_SERVERS.every((s) => s.username === undefined && s.credential === undefined)).toBe(true);
  });
});

describe('batas waktu negosiasi', () => {
  it('negosiasi yang masih berjalan tidak diputus walau lewat 12 detik dan layar macet', () => {
    for (const ice of ['checking', 'connected', 'completed'] as const) {
      expect(nasibNegosiasi(ice, TUNGGU_AWAL_MS)).toBe('tunggu');
      expect(nasibNegosiasi(ice, BATAS_MENYAMBUNG_MS + 5000)).toBe('tunggu');
    }
  });

  it('gagal atau ditutup langsung diulang', () => {
    expect(nasibNegosiasi('failed', 1000)).toBe('ulang');
    expect(nasibNegosiasi('closed', 1000)).toBe('ulang');
  });

  it('tanpa kemajuan sama sekali diulang setelah batas awal', () => {
    expect(nasibNegosiasi('new', TUNGGU_AWAL_MS - 1)).toBe('tunggu');
    expect(nasibNegosiasi('new', TUNGGU_AWAL_MS)).toBe('ulang');
    expect(nasibNegosiasi(undefined, TUNGGU_AWAL_MS)).toBe('ulang');
    expect(nasibNegosiasi('disconnected', TUNGGU_AWAL_MS)).toBe('ulang');
  });

  it('ada batas keras agar tidak menunggu selamanya', () => {
    expect(TUNGGU_NEGOSIASI_MAKS_MS).toBeGreaterThan(BATAS_MENYAMBUNG_MS);
    expect(nasibNegosiasi('checking', TUNGGU_NEGOSIASI_MAKS_MS)).toBe('ulang');
  });
});
