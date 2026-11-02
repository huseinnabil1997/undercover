import { describe, expect, it } from 'vitest';
import { BATAS_MENYAMBUNG_MS, pesanMacet, sudahMacet } from '../lib/online/macet';
import { aktifBasi, aktifDiHalamanLain, BATAS_AKTIF_MS } from '../lib/online/sesi';

// Regresi "loading terus": layar menyambung harus berhenti dengan alasan + tombol setelah batas waktu.

describe('batas waktu menyambung', () => {
  it('macet hanya jika belum tersambung melewati batas', () => {
    expect(sudahMacet('menyambung', 1000, 1000 + BATAS_MENYAMBUNG_MS - 1)).toBe(false);
    expect(sudahMacet('menyambung', 1000, 1000 + BATAS_MENYAMBUNG_MS)).toBe(true);
    expect(sudahMacet('hostTidakAda', 1000, 1000 + BATAS_MENYAMBUNG_MS * 4)).toBe(true);
    expect(sudahMacet('tersambung', 1000, 1000 + BATAS_MENYAMBUNG_MS * 4)).toBe(false);
  });

  it('belum ada percobaan (sejak 0) tidak dianggap macet', () => {
    expect(sudahMacet('menyambung', 0, 10 ** 12)).toBe(false);
  });

  it('batas 10 sampai 15 detik', () => {
    expect(BATAS_MENYAMBUNG_MS).toBeGreaterThanOrEqual(10000);
    expect(BATAS_MENYAMBUNG_MS).toBeLessThanOrEqual(15000);
  });

  it('pesan sesuai penyebab, berbahasa Indonesia tanpa em dash', () => {
    const kasus = [
      pesanMacet(false, 'ZZZZZ', 'hostTidakAda'),
      pesanMacet(false, 'ABCDE', 'menyambungUlang', 'timeout'),
      pesanMacet(false, 'ABCDE', 'menyambungUlang', 'network'),
      pesanMacet(false, 'ABCDE', 'menyambung'),
      pesanMacet(true, 'ABCDE', 'idDipakai', '3'),
      pesanMacet(true, 'ABCDE', 'menyambung'),
      pesanMacet(false, 'ABCDE', 'gagal', 'Browser ini tidak mendukung WebRTC.'),
    ];
    expect(kasus[0]).toMatch(/Room ZZZZZ tidak ditemukan/);
    expect(kasus[1]).toMatch(/memblokir koneksi antar HP/);
    expect(kasus[2]).toMatch(/koneksi internet/);
    expect(kasus[3]).toMatch(/koneksi internet/);
    expect(kasus[4]).toMatch(/masih dipakai sesi lain/);
    expect(kasus[5]).toMatch(/Room ABCDE belum bisa dibuka/);
    expect(kasus[6]).toBe('Browser ini tidak mendukung WebRTC.');
    for (const k of kasus) expect(k).not.toMatch(/\u2014/);
  });
});

describe('penanda tab aktif kedaluwarsa', () => {
  it('penanda dari tab yang ditutup tanpa dibersihkan berhenti memblokir setelah BATAS_AKTIF_MS', () => {
    const tanda = { halaman: 'tab-crash', waktu: 50_000 };
    expect(aktifDiHalamanLain(tanda, 'ini', 50_000 + 1000)).toBe(true);
    expect(aktifDiHalamanLain(tanda, 'ini', 50_000 + BATAS_AKTIF_MS)).toBe(false);
  });

  it('penanda basi atau rusak boleh dihapus, yang masih segar tidak', () => {
    expect(aktifBasi({ halaman: 'x', waktu: 0 }, BATAS_AKTIF_MS * 10 + 1)).toBe(true);
    expect(aktifBasi({ halaman: 'x', waktu: 0 }, BATAS_AKTIF_MS)).toBe(false);
    expect(aktifBasi(null, 0)).toBe(true);
    expect(aktifBasi({ halaman: 'x' }, 0)).toBe(true);
  });
});

describe('konfigurasi ICE', () => {
  it('PeerJS memakai daftar ICE_SERVERS: STUN saja, tanpa TURN peerjs yang mati', async () => {
    const { OPSI_PEER } = await import('../lib/online/jaringan');
    const urls = (OPSI_PEER.config?.iceServers ?? []).flatMap((s: { urls: string | string[] }) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    expect(urls.some((u: string) => u.startsWith('stun:'))).toBe(true);
    expect(urls.some((u: string) => u.includes('turn.peerjs.com'))).toBe(false);
  });
});
