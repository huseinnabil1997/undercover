import { describe, expect, it } from 'vitest';
import { buatStateHost, pulihkanStateHost, rapikanAksiPemain, reduceHost, viewUntuk, type Konteks } from '../lib/online/host';
import type { Aksi, StateHost } from '../lib/online/types';
import { cekPetunjuk, GALAT_PETUNJUK, kunciPetunjuk, MAKS_PETUNJUK, rapikanPetunjuk } from '../lib/petunjuk';
import { lajuKlien, LIMIT_CHAT } from '../lib/online/chat';

const KATA_C = 'Zebra Belang';
const KATA_U = 'Kuda Poni';
const PASANGAN = { civilian: KATA_C, undercover: KATA_U, sumber: 'Uji' };

function seeded(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

let now = 1000;
const ctx = (): Konteks => ({ now: (now += 10), rng: seeded(7) });

function jalan(state: StateHost, ...aksi: Aksi[]): StateHost {
  let s = state;
  for (const a of aksi) s = reduceHost(s, a, ctx()).state;
  return s;
}

/** Game n pemain (host + n-1) yang sudah di fase diskusi. */
function diskusi(n = 4, komposisi = { undercover: 1, mrWhite: 0 }): StateHost {
  let s = buatStateHost('ABCDE', 'h', 'Host', { komposisi, kategori: ['klasik'] }, now);
  for (let i = 1; i < n; i++) s = jalan(s, { jenis: 'gabung', id: `p${i}`, nama: `Pemain ${i}` });
  return jalan(s, { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' }, { jenis: 'mulaiDiskusi', dari: 'h' });
}

const giliran = (s: StateHost) => s.game!.urutan[s.game!.giliran];

describe('cekPetunjuk', () => {
  it('merapikan teks, menolak kosong, dan memotong ke 30 karakter', () => {
    expect(rapikanPetunjuk('  belang \n  hitam  ')).toBe('belang hitam');
    expect(rapikanPetunjuk('   ')).toBeNull();
    expect(rapikanPetunjuk(42)).toBeNull();
    expect(Array.from(rapikanPetunjuk('a'.repeat(80))!)).toHaveLength(MAKS_PETUNJUK);
    expect(cekPetunjuk('  ', 'Zebra', [])).toEqual({ galat: GALAT_PETUNJUK.kosong });
    expect(cekPetunjuk('!!!', 'Zebra', [])).toEqual({ galat: GALAT_PETUNJUK.kosong });
  });

  it('menolak kata rahasia sendiri tanpa peduli huruf besar, spasi, tanda baca, dan aksen', () => {
    for (const t of ['zebra belang', 'ZEBRA-BELANG', 'Zebra.Belang!', 'zebrabelang', 'ini zebra belang lho', 'zébra']) {
      expect(cekPetunjuk(t, KATA_C, [])).toEqual({ galat: GALAT_PETUNJUK.rahasia });
    }
    expect(cekPetunjuk('belang', KATA_C, [])).toEqual({ galat: GALAT_PETUNJUK.rahasia });
    expect(cekPetunjuk('hewan savana', KATA_C, [])).toEqual({ teks: 'hewan savana' });
    // Kata pendek (< 3 huruf) tidak dicek sebagai bagian kata lain agar tidak salah tolak.
    expect(cekPetunjuk('kelas', 'Es', [])).toEqual({ teks: 'kelas' });
    expect(cekPetunjuk('es', 'Es', [])).toEqual({ galat: GALAT_PETUNJUK.rahasia });
    // Mr. White tidak punya kata, jadi hanya cek kosong dan duplikat.
    expect(cekPetunjuk('zebra', null, [])).toEqual({ teks: 'zebra' });
  });

  it('menolak petunjuk duplikat di game yang sama (setelah dinormalkan)', () => {
    expect(cekPetunjuk('Hewan  Savana!', 'Kuda', ['hewan savana'])).toEqual({ galat: GALAT_PETUNJUK.duplikat });
    expect(kunciPetunjuk('Hewan Savana!')).toBe(kunciPetunjuk('hewansavana'));
  });
});

describe('reducer petunjuk (online)', () => {
  it('urutan giliran: hanya pemain giliran yang bisa mengirim, sekali per ronde', () => {
    let s = diskusi(4);
    const [a, b] = s.game!.urutan;
    const salah = reduceHost(s, { jenis: 'petunjuk', dari: b, teks: 'apa saja' }, ctx());
    expect(salah.tolak).toBe('Belum giliranmu mengetik petunjuk.');
    expect(salah.state).toBe(s);
    s = jalan(s, { jenis: 'petunjuk', dari: a, teks: '  garis garis ' });
    expect(s.game!.giliran).toBe(1);
    expect(s.game!.petunjuk).toEqual([{ pemain: a, ronde: 1, teks: 'garis garis', waktu: expect.any(Number) }]);
    const lagi = reduceHost(s, { jenis: 'petunjuk', dari: a, teks: 'lain' }, ctx());
    expect(lagi.tolak).toBeTruthy();
    expect(lagi.state.game!.petunjuk).toHaveLength(1);
  });

  it('menolak kata rahasia pengirim hanya ke pengirim, state tidak berubah', () => {
    const s = diskusi(4);
    const a = giliran(s);
    const kata = s.game!.peran[a] === 'civilian' ? KATA_C : KATA_U;
    const r = reduceHost(s, { jenis: 'petunjuk', dari: a, teks: kata.toUpperCase() }, ctx());
    expect(r.tolak).toBe(GALAT_PETUNJUK.rahasia);
    expect(r.state).toBe(s);
    expect(r.state.game!.giliran).toBe(0);
  });

  it('menolak petunjuk duplikat dari pemain lain', () => {
    let s = diskusi(4);
    s = jalan(s, { jenis: 'petunjuk', dari: giliran(s), teks: 'hewan' });
    const r = reduceHost(s, { jenis: 'petunjuk', dari: giliran(s), teks: 'HEWAN!' }, ctx());
    expect(r.tolak).toBe(GALAT_PETUNJUK.duplikat);
  });

  it('otomatis ke voting setelah semua pemain hidup mengirim', () => {
    let s = diskusi(4);
    const urutan = s.game!.urutan;
    urutan.forEach((id, i) => {
      expect(s.game!.fase).toBe('diskusi');
      s = jalan(s, { jenis: 'petunjuk', dari: id, teks: `petunjuk ${i}` });
    });
    expect(s.game!.fase).toBe('vote');
    expect(s.game!.kandidat).toHaveLength(urutan.length);
    expect(s.game!.petunjuk.map((e) => e.pemain)).toEqual(urutan);
    expect(reduceHost(s, { jenis: 'petunjuk', dari: urutan[0], teks: 'telat' }, ctx()).tolak).toBe('Belum waktunya mengetik petunjuk.');
  });

  it('Sudah bicara: giliran maju tanpa entri riwayat, tetap dihitung selesai, dan bisa memicu voting', () => {
    let s = diskusi(3);
    const [a, b, c] = s.game!.urutan;
    // Hanya pemain giliran yang bisa menekan Sudah bicara.
    const salah = reduceHost(s, { jenis: 'sudahBicara', dari: b }, ctx());
    expect(salah.tolak).toBeTruthy();
    expect(salah.state.game!.giliran).toBe(0);
    s = jalan(s, { jenis: 'sudahBicara', dari: a });
    expect(s.game!.giliran).toBe(1);
    expect(s.game!.petunjuk).toEqual([]);
    // Setelah Sudah bicara, pemain itu tidak bisa lagi mengirim petunjuk di ronde ini.
    expect(reduceHost(s, { jenis: 'petunjuk', dari: a, teks: 'telat' }, ctx()).tolak).toBe('Belum giliranmu mengetik petunjuk.');
    s = jalan(s, { jenis: 'petunjuk', dari: b, teks: 'loreng' }, { jenis: 'sudahBicara', dari: c });
    expect(s.game!.fase).toBe('vote');
    expect(s.game!.petunjuk.map((e) => [e.pemain, e.teks])).toEqual([[b, 'loreng']]);
    expect(viewUntuk(s, 'h').game!.petunjuk.every((e) => typeof e.teks === 'string' && e.teks.length > 0)).toBe(true);
    // Aksi ini lolos sanitasi pesan dari klien.
    expect(rapikanAksiPemain({ jenis: 'sudahBicara', dari: 'palsu' })).toEqual({ jenis: 'sudahBicara' });
  });

  it('host bisa melewati giliran (tanpa entri) dan memulai voting manual', () => {
    let s = diskusi(4);
    expect(reduceHost(s, { jenis: 'lewatiGiliran', dari: giliran(s) === 'h' ? 'p1' : giliran(s) }, ctx()).state.game!.giliran).toBe(0);
    s = jalan(s, { jenis: 'lewatiGiliran', dari: 'h' });
    expect(s.game!.giliran).toBe(1);
    expect(s.game!.petunjuk).toEqual([]);
    s = jalan(s, { jenis: 'mulaiVote', dari: 'h' });
    expect(s.game!.fase).toBe('vote');
  });

  it('riwayat tetap ada di ronde berikutnya, ikut terkirim saat reconnect dan setelah host refresh', () => {
    let s = diskusi(4);
    const a = giliran(s);
    s = jalan(s, { jenis: 'petunjuk', dari: a, teks: 'savana' });
    const lain = s.game!.peserta.find((id) => id !== 'h' && id !== a)!;
    s = jalan(s, { jenis: 'putus', id: lain }, { jenis: 'gabung', id: lain, nama: 'x' });
    expect(viewUntuk(s, lain).game!.petunjuk).toEqual(s.game!.petunjuk);
    const pulih = pulihkanStateHost(JSON.parse(JSON.stringify(s)), now)!;
    expect(viewUntuk(pulih, lain).game!.petunjuk.map((e) => e.teks)).toEqual(['savana']);
    // State lama tanpa field petunjuk tetap bisa dipulihkan.
    const lama = JSON.parse(JSON.stringify(s));
    delete lama.game.petunjuk;
    expect(pulihkanStateHost(lama, now)!.game!.petunjuk).toEqual([]);
  });

  it('view untuk pemain lain tidak membocorkan kata rahasia, termasuk saat petunjuk ditolak', () => {
    let s = diskusi(4);
    const a = giliran(s);
    const kata = s.game!.peran[a] === 'civilian' ? KATA_C : KATA_U;
    s = jalan(s, { jenis: 'petunjuk', dari: a, teks: kata }, { jenis: 'petunjuk', dari: a, teks: 'hewan' });
    for (const id of s.game!.peserta.filter((x) => x !== a)) {
      const v = viewUntuk(s, id);
      const json = JSON.stringify(v);
      const kataSendiri = s.game!.peran[id] === 'civilian' ? KATA_C : KATA_U;
      const kataLain = kataSendiri === KATA_C ? KATA_U : KATA_C;
      expect(json).not.toContain(kataLain);
      // Petunjuk yang tersiar hanya berisi id pemain, ronde, teks, dan waktu.
      for (const e of v.game!.petunjuk) expect(Object.keys(e).sort()).toEqual(['pemain', 'ronde', 'teks', 'waktu']);
    }
    expect(s.game!.petunjuk.map((e) => e.teks)).toEqual(['hewan']);
  });

  it('rapikanAksiPemain membatasi panjang petunjuk dari klien', () => {
    const r = rapikanAksiPemain({ jenis: 'petunjuk', teks: 'x'.repeat(5000) });
    expect(r).toMatchObject({ jenis: 'petunjuk' });
    expect((r as { teks: string }).teks.length).toBeLessThanOrEqual(120);
    expect(rapikanAksiPemain({ jenis: 'petunjuk', teks: 5 })).toBeNull();
  });
});

describe('rate limit chat di klien', () => {
  it('menolak sebelum kolom input dikosongkan, lalu boleh lagi setelah jendela lewat', () => {
    let r: number[] = [];
    for (let i = 0; i < LIMIT_CHAT.jumlah; i++) r = lajuKlien(r, 1000 + i)!;
    expect(lajuKlien(r, 2000)).toBeNull();
    expect(lajuKlien(r, 1000 + LIMIT_CHAT.jendelaMs + 10)).not.toBeNull();
  });
});
