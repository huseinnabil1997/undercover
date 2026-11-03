import { describe, expect, it } from 'vitest';
import {
  adaBatas, detikTebakan, formatSisa, MIN_TEBAKAN, PILIHAN_PETUNJUK, PILIHAN_VOTE, rapikanBatasWaktu, TAMBAHAN_PULIH_MS, TEKS_WAKTU_HABIS, type BatasWaktu,
} from '../lib/batasWaktu';
import { buatStateHost, kunciLangkah, pulihkanStateHost, reduceHost, viewUntuk } from '../lib/online/host';
import { cekPetunjuk, GALAT_PETUNJUK, teksDipakai } from '../lib/petunjuk';
import { SUARA_LEWATI, type Aksi, type StateHost } from '../lib/online/types';

const PASANGAN = { civilian: 'APEL', undercover: 'PIR', sumber: 'Uji' };
const T0 = 1_000_000;

/** Jalankan aksi pada waktu `now` (ms, jam host). */
function pada(now: number, s: StateHost, ...aksi: Aksi[]): StateHost {
  return aksi.reduce((x, a) => reduceHost(x, a, { now, rng: () => 0.3 }).state, s);
}
const tick = (now: number, s: StateHost) => reduceHost(s, { jenis: 'tick' }, { now, rng: () => 0.3 });
/** Semua pemain tetap terlihat online (agar tick tidak menandai offline dan mengubah state). */
const hidupkan = (s: StateHost, now: number): StateHost => ({ ...s, pemain: s.pemain.map((p) => ({ ...p, online: true, terakhir: now })) });

function room(batas: BatasWaktu | undefined, n = 5, mrWhite = 0): StateHost {
  let s = buatStateHost('ABCDE', 'h', 'Host', { komposisi: { undercover: 1, mrWhite }, kategori: ['klasik'], ...(batas ? { batasWaktu: batas } : {}) }, T0);
  for (let i = 1; i < n; i++) s = pada(T0, s, { jenis: 'gabung', id: `p${i}`, nama: `Pemain ${i}` });
  return s;
}
const keDiskusi = (s: StateHost, now = T0) => pada(now, s, { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' }, { jenis: 'mulaiDiskusi', dari: 'h' });

describe('pilihan batas waktu', () => {
  it('bawaan tanpa batas; nilai rusak atau di luar pilihan jadi 0', () => {
    expect(rapikanBatasWaktu(undefined)).toEqual({ petunjuk: 0, vote: 0 });
    expect(rapikanBatasWaktu({ petunjuk: 30, vote: 60 })).toEqual({ petunjuk: 30, vote: 60 });
    expect(rapikanBatasWaktu({ petunjuk: 31, vote: '60' })).toEqual({ petunjuk: 0, vote: 0 });
    expect(PILIHAN_PETUNJUK[0]).toBe(0);
    expect(PILIHAN_VOTE[0]).toBe(0);
    expect(adaBatas({ petunjuk: 0, vote: 0 })).toBe(false);
    expect(detikTebakan({ petunjuk: 0, vote: 0 })).toBe(0);
    expect(detikTebakan({ petunjuk: 20, vote: 0 })).toBe(MIN_TEBAKAN);
    expect(detikTebakan({ petunjuk: 0, vote: 60 })).toBe(MIN_TEBAKAN);
    expect(detikTebakan({ petunjuk: 45, vote: 0 })).toBe(45);
    expect(formatSisa(65)).toBe('1:05');
    expect(formatSisa(4.2)).toBe('0:05');
    expect(formatSisa(-3)).toBe('0:00');
  });
});

describe('tanpa batas (perilaku lama)', () => {
  it('tidak ada tenggat dan tick tidak memajukan apa pun', () => {
    const s = hidupkan(keDiskusi(room(undefined)), T0);
    expect(s.game!.tenggat ?? null).toBeNull();
    expect(viewUntuk(s, 'h', T0).game!.tenggat).toBeNull();
    const r = tick(T0 + 3_600_000, hidupkan(s, T0 + 3_600_000));
    expect(r.state.game!.giliran).toBe(0);
  });
});

describe('batas waktu petunjuk', () => {
  const batas = { petunjuk: 20, vote: 0 };

  it('tenggat dipasang per giliran, dikirim sebagai sisa durasi (tahan selisih jam)', () => {
    const s = keDiskusi(room(batas));
    expect(s.game!.tenggat).toEqual({ kunci: 'diskusi|1|0', sampai: T0 + 20_000, total: 20_000 });
    const v = viewUntuk(s, 'p1', T0 + 5_000).game!;
    expect(v.tenggat).toEqual({ kunci: 'diskusi|1|0', sisaMs: 15_000, totalMs: 20_000 });
    expect(viewUntuk(s, 'p1', T0 + 99_000).game!.tenggat!.sisaMs).toBe(0);
  });

  it('waktu habis: giliran dilewati dengan penanda dan giliran berikutnya mendapat waktu penuh', () => {
    let s = keDiskusi(room(batas));
    const pertama = s.game!.urutan[0];
    // Sebelum tenggat: tidak terjadi apa-apa.
    expect(tick(T0 + 19_999, hidupkan(s, T0 + 19_999)).state.game!.giliran).toBe(0);
    const now = T0 + 20_000;
    s = tick(now, hidupkan(s, now)).state;
    expect(s.game!.giliran).toBe(1);
    expect(s.game!.petunjuk).toEqual([{ pemain: pertama, ronde: 1, teks: TEKS_WAKTU_HABIS, waktu: now, habis: true }]);
    expect(s.game!.tenggat).toEqual({ kunci: 'diskusi|1|1', sampai: now + 20_000, total: 20_000 });
  });

  it('tidak terpicu dua kali: tick berulang pada waktu yang sama hanya memajukan satu giliran', () => {
    let s = keDiskusi(room(batas));
    const now = T0 + 20_000;
    s = hidupkan(s, now);
    const a = tick(now, s).state;
    const b = tick(now, a);
    const c = tick(now + 50, b.state);
    expect(a.game!.giliran).toBe(1);
    expect(b.state).toBe(a);
    expect(c.state).toBe(a);
    expect(a.game!.petunjuk.filter((e) => e.habis)).toHaveLength(1);
  });

  it('petunjuk masuk tepat waktu mengganti tenggat; aksi lain di giliran yang sama tidak mereset waktu', () => {
    let s = keDiskusi(room(batas));
    const [a, b] = s.game!.urutan;
    // Pemain lain menyambung ulang di tengah giliran: tenggat tetap.
    s = pada(T0 + 10_000, s, { jenis: 'putus', id: b }, { jenis: 'gabung', id: b, nama: 'x' });
    expect(s.game!.tenggat!.sampai).toBe(T0 + 20_000);
    s = pada(T0 + 12_000, s, { jenis: 'petunjuk', teks: 'merah', dari: a });
    expect(s.game!.giliran).toBe(1);
    expect(s.game!.tenggat).toEqual({ kunci: 'diskusi|1|1', sampai: T0 + 32_000, total: 20_000 });
    // Tenggat giliran lama (T0+20000) sudah tidak berlaku.
    expect(tick(T0 + 20_000, hidupkan(s, T0 + 20_000)).state.game!.giliran).toBe(1);
  });

  it('giliran terakhir habis: langsung ke vote (vote tanpa batas jika batas vote 0)', () => {
    let s = keDiskusi(room(batas));
    let now = T0;
    for (let i = 0; i < s.game!.urutan.length; i++) {
      now += 20_000;
      s = tick(now, hidupkan(s, now)).state;
    }
    expect(s.game!.fase).toBe('vote');
    expect(s.game!.petunjuk.filter((e) => e.habis)).toHaveLength(s.game!.urutan.length);
    expect(s.game!.tenggat).toBeNull();
  });

  it('penanda waktu habis tidak dihitung sebagai petunjuk yang sudah dipakai', () => {
    const entri = [{ pemain: '0', ronde: 1, teks: TEKS_WAKTU_HABIS, waktu: 1, habis: true as const }];
    expect(teksDipakai(entri)).toEqual([]);
    expect(cekPetunjuk('waktu habis', null, teksDipakai(entri))).toEqual({ teks: 'waktu habis' });
    expect(cekPetunjuk('waktu habis', null, ['waktu habis'])).toEqual({ galat: GALAT_PETUNJUK.duplikat });
  });
});

describe('batas waktu vote', () => {
  const batas = { petunjuk: 0, vote: 30 };
  const keVote = (now = T0) => pada(now, keDiskusi(room(batas)), { jenis: 'mulaiVote', dari: 'h' });

  it('waktu habis dihitung seperti tombol Hitung: yang belum vote dianggap tidak memilih', () => {
    let s = keVote();
    expect(s.game!.tenggat).toEqual({ kunci: 'vote|1|1', sampai: T0 + 30_000, total: 30_000 });
    s = pada(T0 + 1_000, s, { jenis: 'vote', dari: 'p1', target: 'p2' }, { jenis: 'vote', dari: 'p3', target: 'p2' });
    // Vote masuk tidak mereset tenggat.
    expect(s.game!.tenggat!.sampai).toBe(T0 + 30_000);
    const dariHitung = pada(T0 + 2_000, s, { jenis: 'tutupVote', dari: 'h' });
    const habis = tick(T0 + 30_000, hidupkan(s, T0 + 30_000)).state;
    expect(habis.game!.fase).toBe('terungkap');
    expect(habis.game!.tereliminasi).toBe('p2');
    expect(habis.game!.hasilVote).toEqual(dariHitung.game!.hasilVote);
  });

  it('tidak ada suara sama sekali: tidak ada yang keluar', () => {
    const s = tick(T0 + 30_000, hidupkan(keVote(), T0 + 30_000)).state;
    expect(s.game!.fase).toBe('terungkap');
    expect(s.game!.tereliminasi).toBeNull();
    expect(s.game!.hasilVote!.keputusan).toBe('tanpaEliminasi');
  });

  it('Lewati terbanyak tetap berarti tidak ada yang keluar', () => {
    let s = pada(T0 + 1_000, keVote(), { jenis: 'vote', dari: 'p1', target: SUARA_LEWATI }, { jenis: 'vote', dari: 'p2', target: SUARA_LEWATI }, { jenis: 'vote', dari: 'p3', target: 'p4' });
    s = tick(T0 + 30_000, hidupkan(s, T0 + 30_000)).state;
    expect(s.game!.tereliminasi).toBeNull();
    expect(s.game!.hasilVote!.lewati).toBe(2);
  });

  it('seri: vote ulang dengan waktu penuh baru, lalu masih seri berarti tidak ada yang keluar', () => {
    let s = pada(T0 + 1_000, keVote(), { jenis: 'vote', dari: 'p1', target: 'p2' }, { jenis: 'vote', dari: 'p3', target: 'p4' });
    let now = T0 + 30_000;
    s = tick(now, hidupkan(s, now)).state;
    expect(s.game!.fase).toBe('vote');
    expect(s.game!.putaranVote).toBe(2);
    expect(s.game!.tenggat).toEqual({ kunci: 'vote|1|2', sampai: now + 30_000, total: 30_000 });
    s = pada(now + 1_000, s, { jenis: 'vote', dari: 'p1', target: 'p2' }, { jenis: 'vote', dari: 'p3', target: 'p4' });
    // Tick ganda di detik yang sama pada vote ulang: hanya satu kali hitung.
    now += 30_000;
    const a = tick(now, hidupkan(s, now)).state;
    expect(tick(now, a).state).toBe(a);
    expect(a.game!.fase).toBe('terungkap');
    expect(a.game!.tereliminasi).toBeNull();
    expect(a.game!.tenggat).toBeNull();
  });
});

describe('batas waktu tebakan Mr. White', () => {
  it('waktu habis dianggap tebakan salah, sekali saja', () => {
    let s = pada(T0, keDiskusi(room({ petunjuk: 20, vote: 0 }, 5, 1)), { jenis: 'mulaiVote', dari: 'h' });
    const g = s.game!;
    const mw = g.peserta.find((id) => g.peran[id] === 'mrwhite')!;
    const lain = g.peserta.find((id) => id !== mw)!;
    s = pada(T0 + 1_000, s, ...g.peserta.map((id): Aksi => ({ jenis: 'vote', dari: id, target: id === mw ? lain : mw })));
    expect(s.game!.tebakan).toBe('menunggu');
    expect(kunciLangkah(s.game!)).toBe('tebak|1');
    expect(s.game!.tenggat).toEqual({ kunci: 'tebak|1', sampai: T0 + 1_000 + MIN_TEBAKAN * 1000, total: MIN_TEBAKAN * 1000 });
    const now = T0 + 1_000 + MIN_TEBAKAN * 1000;
    const a = tick(now, hidupkan(s, now)).state;
    expect(a.game!.tebakan).toBe('salah');
    expect(a.game!.tebakanSalah).toBe(TEKS_WAKTU_HABIS);
    expect(a.game!.fase).toBe('terungkap');
    expect(a.game!.tenggat).toBeNull();
    expect(tick(now + 10, a).state).toBe(a);
    // Tebakan yang datang terlambat ditolak (sudah bukan langkah menebak).
    expect(pada(now + 20, a, { jenis: 'tebak', teks: 'APEL', dari: mw }).game!.fase).toBe('terungkap');
  });
});

describe('host refresh', () => {
  it('tenggat dipertahankan dengan tambahan waktu, tidak dimulai ulang dan tidak langsung habis', () => {
    const s = keDiskusi(room({ petunjuk: 20, vote: 0 }));
    const raw = JSON.parse(JSON.stringify(s));
    // Refresh setelah tenggat lewat: tidak langsung melewati giliran.
    const telat = pulihkanStateHost(raw, T0 + 25_000)!;
    expect(telat.game!.tenggat!.sampai).toBe(T0 + 25_000 + TAMBAHAN_PULIH_MS);
    expect(tick(T0 + 25_001, hidupkan(telat, T0 + 25_001)).state.game!.giliran).toBe(0);
    // Refresh dengan sisa banyak: tenggat lama dipakai apa adanya.
    const awal = pulihkanStateHost(raw, T0 + 1_000)!;
    expect(awal.game!.tenggat!.sampai).toBe(T0 + 20_000);
    // Setelah dipulihkan, waktu habis tetap terpicu tepat sekali.
    const now = T0 + 20_000;
    const a = tick(now, hidupkan(awal, now)).state;
    expect(a.game!.giliran).toBe(1);
    expect(tick(now, a).state).toBe(a);
  });

  it('state lama tanpa batasWaktu tetap tanpa batas', () => {
    const s = keDiskusi(room(undefined));
    const p = pulihkanStateHost(JSON.parse(JSON.stringify(s)), T0)!;
    expect(p.game!.tenggat ?? null).toBeNull();
  });
});
