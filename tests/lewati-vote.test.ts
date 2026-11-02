import { describe, expect, it } from 'vitest';
import { alasanTanpaEliminasi, buatStateHost, hitungSuara, rapikanAksiPemain, reduceHost, viewUntuk, type Konteks } from '../lib/online/host';
import { SUARA_LEWATI, type Aksi, type StateHost } from '../lib/online/types';

const PASANGAN = { civilian: 'APEL', undercover: 'PIR', sumber: 'Uji' };
const ctx = (): Konteks => ({ now: 1000, rng: () => 0.3 });

function jalan(state: StateHost, ...aksi: Aksi[]): StateHost {
  let s = state;
  for (const a of aksi) s = reduceHost(s, a, ctx()).state;
  return s;
}

/** Host h + p1..p(n-1), langsung di fase vote ronde 1. */
function keVote(n = 5): StateHost {
  let s = buatStateHost('ABCDE', 'h', 'Host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'] }, 1000);
  for (let i = 1; i < n; i++) s = jalan(s, { jenis: 'gabung', id: `p${i}`, nama: `Pemain ${i}` });
  return jalan(s, { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' }, { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
}

const vote = (dari: string, target: string): Aksi => ({ jenis: 'vote', dari, target });
const lewati = (dari: string): Aksi => vote(dari, SUARA_LEWATI);

describe('vote Lewati (abstain)', () => {
  it('Lewati diterima, dihitung sudah vote, dan bisa diganti', () => {
    let s = keVote(5);
    const r = reduceHost(s, lewati('p1'), ctx());
    expect(r.tolak).toBeUndefined();
    s = r.state;
    expect(viewUntuk(s, 'h').game!.sudahVote).toEqual(['p1']);
    expect(viewUntuk(s, 'p1').game!.pilihanSaya).toBe(SUARA_LEWATI);
    expect(viewUntuk(s, 'p2').game!.pilihanSaya).toBeNull();
    s = jalan(s, vote('p1', 'p2'));
    expect(s.game!.suara).toEqual({ p1: 'p2' });
    s = jalan(s, lewati('p1'));
    expect(s.game!.suara).toEqual({ p1: SUARA_LEWATI });
  });

  it('pesan vote Lewati lolos validasi jaringan (format pesan tidak berubah)', () => {
    expect(rapikanAksiPemain({ jenis: 'vote', target: SUARA_LEWATI })).toEqual({ jenis: 'vote', target: SUARA_LEWATI });
  });

  it('pemain mati tetap tidak bisa Lewati', () => {
    let s = keVote(5);
    s = { ...s, game: { ...s.game!, hidup: { ...s.game!.hidup, p4: false } } };
    expect(reduceHost(s, lewati('p4'), ctx()).tolak).toBeTruthy();
  });

  it('semua Lewati: voting tertutup otomatis tanpa eliminasi, lanjut ronde berikutnya', () => {
    let s = keVote(5);
    s = jalan(s, ...s.game!.peserta.map(lewati));
    expect(s.game!.fase).toBe('terungkap');
    expect(s.game!.tereliminasi).toBeNull();
    expect(s.game!.hasilVote).toMatchObject({ keputusan: 'tanpaEliminasi', lewati: 5, seri: [] });
    expect(Object.values(s.game!.hasilVote!.hitung).every((n) => n === 0)).toBe(true);
    expect(alasanTanpaEliminasi(s.game!.hasilVote!)).toBe('lewati');
    s = jalan(s, { jenis: 'lanjut', dari: 'h' });
    expect(s.game!.fase).toBe('diskusi');
    expect(s.game!.ronde).toBe(2);
    expect(Object.values(s.game!.hidup).every(Boolean)).toBe(true);
  });

  it('Lewati tidak menambah suara kandidat; suara terbanyak tetap tereliminasi', () => {
    let s = keVote(5);
    s = jalan(s, vote('h', 'p1'), vote('p2', 'p1'), vote('p3', 'p1'), lewati('p1'), lewati('p4'));
    expect(s.game!.fase).toBe('terungkap');
    expect(s.game!.tereliminasi).toBe('p1');
    expect(s.game!.hasilVote).toMatchObject({ keputusan: 'eliminasi', lewati: 2 });
    expect(s.game!.hasilVote!.hitung).toMatchObject({ p1: 3, p2: 0, h: 0, p3: 0, p4: 0 });
  });

  it('Lewati lebih banyak dari suara terbanyak: tidak ada yang keluar', () => {
    let s = keVote(5);
    s = jalan(s, vote('h', 'p1'), lewati('p1'), lewati('p2'), lewati('p3'), vote('p4', 'p2'));
    expect(s.game!.fase).toBe('terungkap');
    expect(s.game!.tereliminasi).toBeNull();
    expect(s.game!.hasilVote).toMatchObject({ keputusan: 'tanpaEliminasi', lewati: 3, seri: [] });
  });

  it('seri dengan Lewati di putaran 1 memicu vote ulang; Lewati tetap boleh saat vote ulang', () => {
    let s = keVote(5);
    // p1: 2 suara, Lewati: 2, p2: 1.
    s = jalan(s, vote('h', 'p1'), vote('p2', 'p1'), lewati('p1'), lewati('p3'), vote('p4', 'p2'));
    expect(s.game!.fase).toBe('vote');
    expect(s.game!.putaranVote).toBe(2);
    expect(s.game!.kandidat).toEqual(['p1']);
    expect(s.game!.hasilVote).toMatchObject({ keputusan: 'voteUlang', seri: ['p1'], lewati: 2 });
    // Saat vote ulang, Lewati menang lagi: tidak ada yang keluar (p1 tidak perlu vote).
    s = jalan(s, lewati('h'), lewati('p2'), lewati('p3'), vote('p4', 'p1'));
    expect(s.game!.fase).toBe('terungkap');
    expect(s.game!.tereliminasi).toBeNull();
    expect(s.game!.hasilVote).toMatchObject({ keputusan: 'tanpaEliminasi', lewati: 3 });
  });

  it('vote ulang antar dua pemain: Lewati diterima dan seri lagi berarti tanpa eliminasi', () => {
    let s = keVote(5);
    s = jalan(s, vote('h', 'p1'), vote('p1', 'p2'), vote('p2', 'p1'), vote('p3', 'p2'), { jenis: 'tutupVote', dari: 'h' });
    expect(s.game!.putaranVote).toBe(2);
    expect(reduceHost(s, lewati('p4'), ctx()).tolak).toBeUndefined();
    s = jalan(s, vote('h', 'p1'), vote('p3', 'p2'), lewati('p4'), { jenis: 'tutupVote', dari: 'h' });
    expect(s.game!.hasilVote).toMatchObject({ keputusan: 'tanpaEliminasi', seri: ['p1', 'p2'], lewati: 1 });
    expect(alasanTanpaEliminasi(s.game!.hasilVote!)).toBe('seri');
    expect(s.game!.tereliminasi).toBeNull();
  });

  it('vote ulang dimenangkan satu pemain meski ada yang Lewati', () => {
    let s = keVote(5);
    s = jalan(s, vote('h', 'p1'), vote('p1', 'p2'), vote('p2', 'p1'), vote('p3', 'p2'), { jenis: 'tutupVote', dari: 'h' });
    s = jalan(s, vote('h', 'p1'), vote('p1', 'p2'), vote('p2', 'p1'), vote('p3', 'p1'), lewati('p4'));
    expect(s.game!.fase).toBe('terungkap');
    expect(s.game!.tereliminasi).toBe('p1');
  });

  it('hitungSuara mengabaikan Lewati dari pemain yang sudah mati; host lama tanpa field lewati tetap terbaca', () => {
    const s = keVote(5);
    const g = { ...s.game!, hidup: { ...s.game!.hidup, p4: false }, suara: { h: 'p1', p4: SUARA_LEWATI } };
    expect(hitungSuara(g)).toMatchObject({ keputusan: 'eliminasi', lewati: 0 });
    expect(alasanTanpaEliminasi({ hitung: {}, seri: [], keputusan: 'tanpaEliminasi' })).toBe('kosong');
  });
});
