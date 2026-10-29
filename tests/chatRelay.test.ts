import { describe, expect, it } from 'vitest';
import { buatStateHost } from '../lib/online/host';
import { HostRoom } from '../lib/online/jaringan';
import type { PesanChat } from '../lib/online/chat';
import { VERSI_PROTOKOL, type PesanKeHost, type PesanKeKlien } from '../lib/online/types';

// Koneksi palsu: cukup untuk menguji relay di HostRoom tanpa WebRTC.
function koneksiPalsu() {
  return {
    open: true,
    terkirim: [] as PesanKeKlien[],
    send(p: PesanKeKlien) { this.terkirim.push(p); },
    close() { this.open = false; },
    on() {},
  };
}
type Palsu = ReturnType<typeof koneksiPalsu>;

function siapkan() {
  const daftarChat: PesanChat[][] = [];
  const host = new HostRoom(
    buatStateHost('ABCDE', 'h', 'Host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'] }, Date.now()),
    { onState: () => {}, onStatus: () => {}, onChat: (p) => daftarChat.push(p) },
  );
  const terima = (c: Palsu, p: PesanKeHost) => (host as unknown as { terimaPesan(c: Palsu, p: PesanKeHost): void }).terimaPesan(c, p);
  const gabung = (id: string, nama: string) => {
    const c = koneksiPalsu();
    terima(c, { t: 'halo', v: VERSI_PROTOKOL, id, nama, token: `tok-${id}` });
    return c;
  };
  return { host, terima, gabung, daftarChat };
}

const chatDari = (c: Palsu) => c.terkirim.filter((p): p is Extract<PesanKeKlien, { t: 'chat' }> => p.t === 'chat').map((p) => p.pesan);

describe('relay chat di HostRoom', () => {
  it('pesan pemain diteruskan ke semua pemain dan tampil di host', () => {
    const { host, terima, gabung, daftarChat } = siapkan();
    const budi = gabung('b', 'Budi');
    const ani = gabung('a', 'Ani');
    terima(budi, { t: 'chat', teks: '  halo semua  ' });
    for (const c of [budi, ani]) expect(chatDari(c).map((p) => [p.nama, p.teks])).toEqual([['Budi', 'halo semua']]);
    expect(daftarChat.at(-1)!.map((p) => p.teks)).toEqual(['halo semua']);
    expect(host.kirimChat('hai dari host')).toBeUndefined();
    expect(chatDari(ani).map((p) => p.nama)).toEqual(['Budi', 'Host']);
  });

  it('nama pengirim diambil dari host, bukan dari isi pesan', () => {
    const { terima, gabung } = siapkan();
    const budi = gabung('b', 'Budi');
    terima(budi, { t: 'chat', teks: 'aku host', nama: 'Host', dari: 'h' } as unknown as PesanKeHost);
    expect(chatDari(budi)[0]).toMatchObject({ dari: 'b', nama: 'Budi' });
  });

  it('pemain yang tersambung ulang menerima riwayat chat', () => {
    const { terima, gabung } = siapkan();
    const budi = gabung('b', 'Budi');
    terima(budi, { t: 'chat', teks: 'satu' });
    terima(budi, { t: 'chat', teks: 'dua' });
    const ulang = gabung('b', 'Budi');
    const riwayat = ulang.terkirim.find((p) => p.t === 'riwayatChat');
    expect(riwayat && riwayat.t === 'riwayatChat' && riwayat.pesan.map((p) => p.teks)).toEqual(['satu', 'dua']);
    expect(budi.open).toBe(false);
  });

  it('spam ditolak hanya ke pengirimnya', () => {
    const { terima, gabung } = siapkan();
    const budi = gabung('b', 'Budi');
    const ani = gabung('a', 'Ani');
    for (let i = 0; i < 8; i++) terima(budi, { t: 'chat', teks: `spam ${i}` });
    expect(chatDari(ani)).toHaveLength(5);
    expect(budi.terkirim.some((p) => p.t === 'tolak' && p.chat === true && /Terlalu cepat/.test(p.alasan))).toBe(true);
    expect(ani.terkirim.some((p) => p.t === 'tolak')).toBe(false);
  });

  it('koneksi yang belum halo tidak bisa chat', () => {
    const { terima, gabung } = siapkan();
    const ani = gabung('a', 'Ani');
    terima(koneksiPalsu(), { t: 'chat', teks: 'penyusup' });
    expect(chatDari(ani)).toHaveLength(0);
  });
});
