import { describe, expect, it } from 'vitest';
import {
  buatStateHost, hitungSuara, pemainGame, pulihkanStateHost, rapikanAksiPemain, reduceHost, viewUntuk, type Konteks,
} from '../lib/online/host';
import { ALFABET_KODE, buatKodeRoom, kodeDariUrl, kodeValid, peerIdHost, rapikanKode } from '../lib/online/room';
import type { Aksi, StateHost } from '../lib/online/types';
import { BATAS_OFFLINE_MS } from '../lib/online/types';

const KATA_C = 'ZEBRACIVIL';
const KATA_U = 'KUDAUNDERCOVER';
const PASANGAN = { civilian: KATA_C, undercover: KATA_U, sumber: 'Uji / SumberRahasia' };

function seeded(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

let now = 1000;
const ctx = (): Konteks => ({ now, rng: seeded(7) });

function jalan(state: StateHost, ...aksi: Aksi[]): StateHost {
  let s = state;
  for (const a of aksi) s = reduceHost(s, a, ctx()).state;
  return s;
}

/** Room dengan host + n-1 pemain di lobby. */
function room(n = 5, komposisi = { undercover: 1, mrWhite: 1 }): StateHost {
  let s = buatStateHost('ABCDE', 'h', 'Host', { komposisi, kategori: ['klasik'] }, now);
  for (let i = 1; i < n; i++) s = jalan(s, { jenis: 'gabung', id: `p${i}`, nama: `Pemain ${i}` });
  return s;
}

function mulai(n = 5, komposisi = { undercover: 1, mrWhite: 1 }): StateHost {
  return jalan(room(n, komposisi), { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' });
}

function idDenganPeran(s: StateHost, peran: string): string[] {
  return s.game!.peserta.filter((id) => s.game!.peran[id] === peran);
}

describe('kode room', () => {
  it('membuat kode 5 karakter dari alfabet tanpa karakter ambigu', () => {
    const rng = seeded(1);
    for (let i = 0; i < 200; i++) {
      const k = buatKodeRoom(rng);
      expect(k).toHaveLength(5);
      expect(kodeValid(k)).toBe(true);
    }
    for (const c of '01OIL') expect(ALFABET_KODE.includes(c)).toBe(false);
  });
  it('merapikan input dan membaca ?room= dari URL', () => {
    expect(rapikanKode(' ab-cd e ')).toBe('ABCDE');
    expect(kodeValid('ABC')).toBe(false);
    expect(kodeValid('ABCDEFG')).toBe(false);
    expect(kodeValid('AB0DE')).toBe(false);
    expect(kodeDariUrl('?room=xk7pq')).toBe('XK7PQ');
    expect(kodeDariUrl('?room=O0O0')).toBeNull();
    expect(peerIdHost('XK7PQ')).toBe('undercover-hn-XK7PQ');
  });
});

describe('lobby', () => {
  it('pemain bergabung, nama kembar ditolak, room penuh ditolak', () => {
    let s = room(3);
    expect(s.pemain.map((p) => p.nama)).toEqual(['Host', 'Pemain 1', 'Pemain 2']);
    const r = reduceHost(s, { jenis: 'gabung', id: 'x', nama: '  pemain 1 ' }, ctx());
    expect(r.tolak).toMatch(/sudah dipakai/);
    expect(r.state).toBe(s);
    for (let i = 3; i < 20; i++) s = jalan(s, { jenis: 'gabung', id: `p${i}`, nama: `P${i}` });
    expect(s.pemain).toHaveLength(20);
    expect(reduceHost(s, { jenis: 'gabung', id: 'baru', nama: 'Baru' }, ctx()).tolak).toMatch(/penuh/);
  });

  it('hanya host yang bisa mengubah pengaturan dan memulai', () => {
    const s = room(5);
    const r = reduceHost(s, { jenis: 'mulai', pasangan: PASANGAN, dari: 'p1' }, ctx());
    expect(r.tolak).toMatch(/host/);
    expect(r.state.game).toBeNull();
    const r2 = reduceHost(s, { jenis: 'aturPengaturan', pengaturan: { komposisi: { undercover: 2, mrWhite: 0 }, kategori: [] }, dari: 'p2' }, ctx());
    expect(r2.tolak).toBeTruthy();
  });

  it('memulai menolak komposisi tidak valid dan hanya memakai pemain online', () => {
    const s = room(4, { undercover: 1, mrWhite: 1 });
    expect(reduceHost(s, { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' }, ctx()).tolak).toMatch(/Civilian/);
    let s2 = room(6, { undercover: 1, mrWhite: 1 });
    s2 = jalan(s2, { jenis: 'putus', id: 'p5' }, { jenis: 'mulai', pasangan: PASANGAN, dari: 'h' });
    expect(s2.game!.peserta).toEqual(['h', 'p1', 'p2', 'p3', 'p4']);
    expect(idDenganPeran(s2, 'undercover')).toHaveLength(1);
    expect(idDenganPeran(s2, 'mrwhite')).toHaveLength(1);
  });

  it('pemain keluar dari lobby dihapus, host bisa mengeluarkan pemain', () => {
    let s = room(4);
    s = jalan(s, { jenis: 'keluar', dari: 'p1' }, { jenis: 'keluarkan', id: 'p2', dari: 'h' });
    expect(s.pemain.map((p) => p.id)).toEqual(['h', 'p3']);
  });

  it('seq naik setiap perubahan yang terlihat', () => {
    const s = room(3);
    const s2 = reduceHost(s, { jenis: 'putus', id: 'p1' }, ctx()).state;
    expect(s2.seq).toBe(s.seq + 1);
    const s3 = reduceHost(s2, { jenis: 'putus', id: 'p1' }, ctx()).state;
    expect(s3).toBe(s2);
  });
});

describe('filter view per pemain (tidak ada kebocoran kata/peran)', () => {
  it('setiap pemain hanya menerima kata miliknya selama permainan', () => {
    let s = mulai(6, { undercover: 1, mrWhite: 1 });
    const fase: StateHost[] = [s];
    s = jalan(s, ...s.game!.peserta.map((id) => ({ jenis: 'siap', dari: id }) as Aksi));
    expect(s.game!.fase).toBe('diskusi');
    fase.push(s);
    s = jalan(s, { jenis: 'mulaiVote', dari: 'h' });
    fase.push(s);
    const [uc] = idDenganPeran(s, 'undercover');
    const civ = idDenganPeran(s, 'civilian');
    s = jalan(s, { jenis: 'vote', dari: uc, target: civ[0] }, { jenis: 'vote', dari: civ[1], target: civ[0] });
    fase.push(s);
    for (const st of fase) {
      for (const id of st.game!.peserta) {
        const json = JSON.stringify(viewUntuk(st, id));
        const peran = st.game!.peran[id];
        if (peran === 'civilian') {
          expect(json).toContain(KATA_C);
          expect(json).not.toContain(KATA_U);
        } else if (peran === 'undercover') {
          expect(json).toContain(KATA_U);
          expect(json).not.toContain(KATA_C);
        } else {
          expect(json).not.toContain(KATA_C);
          expect(json).not.toContain(KATA_U);
        }
        expect(json).not.toContain('SumberRahasia');
        // Tidak ada peran yang bocor untuk pemain yang masih hidup.
        expect(json).not.toMatch(/"peran"/);
        expect(json).not.toMatch(/"suara"/);
      }
    }
  });

  it('penonton (gabung saat main) tidak menerima kata apa pun', () => {
    let s = mulai(5);
    s = jalan(s, { jenis: 'gabung', id: 'telat', nama: 'Telat' });
    const v = viewUntuk(s, 'telat');
    const json = JSON.stringify(v);
    expect(v.game!.ikut).toBe(false);
    expect(json).not.toContain(KATA_C);
    expect(json).not.toContain(KATA_U);
  });

  it('peran baru terbuka saat tereliminasi, semua terbuka saat selesai', () => {
    let s = mulai(5, { undercover: 1, mrWhite: 0 });
    s = jalan(s, { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    const civ = idDenganPeran(s, 'civilian');
    const [uc] = idDenganPeran(s, 'undercover');
    const hidup = s.game!.peserta;
    // Semua memilih civ[0] kecuali civ[0] yang memilih undercover.
    s = jalan(s, ...hidup.map((id) => ({ jenis: 'vote', dari: id, target: id === civ[0] ? uc : civ[0] }) as Aksi));
    expect(s.game!.fase).toBe('terungkap');
    expect(s.game!.tereliminasi).toBe(civ[0]);
    const v = viewUntuk(s, civ[1]);
    expect(v.pemain.find((p) => p.id === civ[0])!.peran).toBe('civilian');
    expect(v.pemain.filter((p) => p.peran !== undefined)).toHaveLength(1);
    expect(JSON.stringify(v)).not.toContain(KATA_U);
    // Lanjut, lalu eliminasi Undercover: Civilian menang dan semua terbuka.
    s = jalan(s, { jenis: 'lanjut', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    for (const id of s.game!.peserta.filter((x) => s.game!.hidup[x])) {
      s = jalan(s, { jenis: 'vote', dari: id, target: id === uc ? civ[1] : uc });
    }
    s = jalan(s, { jenis: 'lanjut', dari: 'h' });
    expect(s.game!.fase).toBe('hasil');
    expect(s.game!.pemenang).toBe('civilian');
    const akhir = viewUntuk(s, uc);
    expect(akhir.pemain.every((p) => p.peran)).toBe(true);
    expect(akhir.game!.hasil!.pasangan.civilian).toBe(KATA_C);
    expect(s.skor['Pemain 1'] ?? s.skor.Host).toBeDefined();
  });
});

describe('diskusi dan giliran', () => {
  it('hanya pembicara saat ini (atau host) yang bisa memajukan giliran', () => {
    let s = mulai(5);
    s = jalan(s, { jenis: 'mulaiDiskusi', dari: 'h' });
    const [a, b] = s.game!.urutan;
    expect(s.game!.peran[a]).not.toBe('mrwhite');
    expect(reduceHost(s, { jenis: 'selesaiBicara', dari: b }, ctx()).state.game!.giliran).toBe(0);
    s = jalan(s, { jenis: 'selesaiBicara', dari: a });
    expect(s.game!.giliran).toBe(1);
    s = jalan(s, { jenis: 'lewatiGiliran', dari: 'h' });
    expect(s.game!.giliran).toBe(2);
  });
});

describe('voting dan seri', () => {
  it('vote tidak boleh ke diri sendiri, pemain mati tidak boleh vote, vote bisa diganti', () => {
    let s = mulai(5);
    s = jalan(s, { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    expect(reduceHost(s, { jenis: 'vote', dari: 'p1', target: 'p1' }, ctx()).tolak).toBeTruthy();
    s = jalan(s, { jenis: 'vote', dari: 'p1', target: 'p2' }, { jenis: 'vote', dari: 'p1', target: 'p3' });
    expect(s.game!.suara).toEqual({ p1: 'p3' });
    expect(viewUntuk(s, 'p2').game!.sudahVote).toEqual(['p1']);
    expect(viewUntuk(s, 'p2').game!.pilihanSaya).toBeNull();
    expect(viewUntuk(s, 'p1').game!.pilihanSaya).toBe('p3');
  });

  it('voting tertutup otomatis saat semua pemain hidup sudah vote', () => {
    let s = mulai(5);
    s = jalan(s, { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    const ids = s.game!.peserta;
    for (const id of ids.slice(0, -1)) s = jalan(s, { jenis: 'vote', dari: id, target: id === 'p4' ? 'p3' : 'p4' });
    expect(s.game!.fase).toBe('vote');
    s = jalan(s, { jenis: 'vote', dari: ids[ids.length - 1], target: 'p3' });
    expect(s.game!.fase).toBe('terungkap');
    expect(s.game!.tereliminasi).toBe('p4');
    expect(s.game!.hasilVote!.hitung.p4).toBe(4);
  });

  it('seri putaran 1 memicu vote ulang antar yang seri, seri lagi berarti tanpa eliminasi', () => {
    let s = mulai(5);
    s = jalan(s, { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    s = jalan(
      s,
      { jenis: 'vote', dari: 'h', target: 'p1' },
      { jenis: 'vote', dari: 'p1', target: 'p2' },
      { jenis: 'vote', dari: 'p2', target: 'p1' },
      { jenis: 'vote', dari: 'p3', target: 'p2' },
      { jenis: 'tutupVote', dari: 'h' },
    );
    expect(s.game!.fase).toBe('vote');
    expect(s.game!.putaranVote).toBe(2);
    expect(s.game!.kandidat.sort()).toEqual(['p1', 'p2']);
    expect(s.game!.hasilVote!.keputusan).toBe('voteUlang');
    expect(reduceHost(s, { jenis: 'vote', dari: 'h', target: 'p3' }, ctx()).tolak).toBeTruthy();
    s = jalan(s, { jenis: 'vote', dari: 'h', target: 'p1' }, { jenis: 'vote', dari: 'p3', target: 'p2' }, { jenis: 'tutupVote', dari: 'h' });
    expect(s.game!.fase).toBe('terungkap');
    expect(s.game!.tereliminasi).toBeNull();
    expect(s.game!.hasilVote!.keputusan).toBe('tanpaEliminasi');
    expect(Object.values(s.game!.hidup).every(Boolean)).toBe(true);
    s = jalan(s, { jenis: 'lanjut', dari: 'h' });
    expect(s.game!.fase).toBe('diskusi');
    expect(s.game!.ronde).toBe(2);
  });

  it('hitungSuara tanpa suara berarti tanpa eliminasi', () => {
    const s = jalan(mulai(5), { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    expect(hitungSuara(s.game!).keputusan).toBe('tanpaEliminasi');
  });
});

describe('Mr. White', () => {
  function elimMrWhite(): { s: StateHost; mw: string } {
    let s = mulai(5, { undercover: 1, mrWhite: 1 });
    s = jalan(s, { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    const [mw] = idDenganPeran(s, 'mrwhite');
    const lain = s.game!.peserta.find((id) => id !== mw)!;
    for (const id of s.game!.peserta) s = jalan(s, { jenis: 'vote', dari: id, target: id === mw ? lain : mw });
    return { s, mw };
  }

  it('hanya Mr. White yang tereliminasi bisa menebak, tebakan benar menang', () => {
    const { s, mw } = elimMrWhite();
    expect(s.game!.tebakan).toBe('menunggu');
    expect(viewUntuk(s, mw).game!.mrWhite).toBe(true);
    const lain = s.game!.peserta.find((id) => id !== mw)!;
    expect(reduceHost(s, { jenis: 'tebak', dari: lain, teks: KATA_C }, ctx()).state).toBe(s);
    expect(reduceHost(s, { jenis: 'lanjut', dari: 'h' }, ctx()).state).toBe(s);
    const menang = jalan(s, { jenis: 'tebak', dari: mw, teks: `  ${KATA_C.toLowerCase()} ` });
    expect(menang.game!.fase).toBe('hasil');
    expect(menang.game!.pemenang).toBe('mrwhite');
    const nama = menang.pemain.find((p) => p.id === mw)!.nama;
    expect(menang.skor[nama]).toBe(6);
  });

  it('tebakan salah membuat permainan berlanjut, host bisa melewati tebakan', () => {
    const { s, mw } = elimMrWhite();
    const salah = jalan(s, { jenis: 'tebak', dari: mw, teks: 'apel' });
    expect(salah.game!.tebakan).toBe('salah');
    expect(viewUntuk(salah, 'h').game!.tebakanSalah).toBe('apel');
    const lewat = jalan(s, { jenis: 'lewatiTebakan', dari: 'h' }, { jenis: 'lanjut', dari: 'h' });
    expect(lewat.game!.fase).toBe('diskusi');
  });
});

describe('koneksi, reconnect, dan host refresh', () => {
  it('heartbeat: pemain yang lama tidak terlihat ditandai offline', () => {
    let s = room(4);
    now += BATAS_OFFLINE_MS - 1;
    s = jalan(s, { jenis: 'terlihat', id: 'p1' }, { jenis: 'tick' });
    expect(s.pemain.every((p) => p.online)).toBe(true);
    now += 2;
    s = jalan(s, { jenis: 'tick' });
    expect(s.pemain.filter((p) => !p.online).map((p) => p.id)).toEqual(['p2', 'p3']);
    // Host tidak pernah ditandai offline oleh dirinya sendiri.
    expect(s.pemain[0].online).toBe(true);
    const seq = s.seq;
    s = jalan(s, { jenis: 'terlihat', id: 'p1' });
    expect(s.seq).toBe(seq);
  });

  it('pemain yang reconnect dengan id yang sama mendapat kata miliknya lagi', () => {
    let s = mulai(5);
    const kataAwal = viewUntuk(s, 'p2').game!.kata;
    s = jalan(s, { jenis: 'putus', id: 'p2' });
    expect(viewUntuk(s, 'h').pemain.find((p) => p.id === 'p2')!.online).toBe(false);
    s = jalan(s, { jenis: 'gabung', id: 'p2', nama: 'Nama Baru Diabaikan' });
    const v = viewUntuk(s, 'p2');
    expect(v.pemain.find((p) => p.id === 'p2')).toMatchObject({ online: true, nama: 'Pemain 2', ikut: true });
    expect(v.game!.kata).toBe(kataAwal);
  });

  it('pemain yang keluar saat main hanya ditandai offline, tetap peserta', () => {
    let s = mulai(5);
    s = jalan(s, { jenis: 'keluar', dari: 'p3' });
    expect(s.pemain.find((p) => p.id === 'p3')!.online).toBe(false);
    expect(s.game!.peserta).toContain('p3');
  });

  it('host refresh: state dipulihkan dari JSON, pemain lain offline sampai tersambung', () => {
    let s = mulai(5);
    s = jalan(s, { jenis: 'mulaiDiskusi', dari: 'h' });
    const raw = JSON.parse(JSON.stringify(s));
    const p = pulihkanStateHost(raw, now + 5)!;
    expect(p.game).toEqual(s.game);
    expect(p.pemain.filter((x) => x.online).map((x) => x.id)).toEqual(['h']);
    expect(p.seq).toBeGreaterThan(s.seq);
    expect(pulihkanStateHost({ foo: 1 }, now)).toBeNull();
    expect(pulihkanStateHost(null, now)).toBeNull();
    const lagi = jalan(p, { jenis: 'gabung', id: 'p1', nama: 'Pemain 1' });
    expect(viewUntuk(lagi, 'p1').game!.fase).toBe('diskusi');
  });
});

describe('main lagi', () => {
  it('host bisa memulai lagi dari layar hasil dengan pemain yang sama, skor dipertahankan', () => {
    let s = mulai(5, { undercover: 1, mrWhite: 0 });
    s = jalan(s, { jenis: 'mulaiDiskusi', dari: 'h' }, { jenis: 'mulaiVote', dari: 'h' });
    const [uc] = idDenganPeran(s, 'undercover');
    for (const id of s.game!.peserta) s = jalan(s, { jenis: 'vote', dari: id, target: id === uc ? s.game!.peserta.find((x) => x !== uc)! : uc });
    s = jalan(s, { jenis: 'lanjut', dari: 'h' });
    expect(s.game!.fase).toBe('hasil');
    const skor = s.skor;
    expect(Object.values(skor).reduce((a, b) => a + b, 0)).toBe(8);
    s = jalan(s, { jenis: 'mulai', pasangan: { civilian: 'A', undercover: 'B', sumber: 'x' }, dari: 'h' });
    expect(s.game!.fase).toBe('kata');
    expect(s.game!.ronde).toBe(1);
    expect(s.skor).toEqual(skor);
    expect(pemainGame(s).every((p) => p.hidup)).toBe(true);
  });
});

describe('token sesi', () => {
  it('menolak penyamaran id tanpa token yang cocok dan tidak membocorkan token di view', () => {
    let s = buatStateHost('ABCDE', 'h', 'Host', { komposisi: { undercover: 1, mrWhite: 0 }, kategori: ['klasik'] }, now);
    s = jalan(s, { jenis: 'gabung', id: 'a', nama: 'Ani', token: 'rahasia-ani' });
    s = jalan(s, { jenis: 'putus', id: 'a' });
    const palsu = reduceHost(s, { jenis: 'gabung', id: 'a', nama: 'Ani', token: 'tebakan' }, ctx());
    expect(palsu.tolak).toMatch(/Sesi tidak cocok/);
    expect(palsu.state.pemain.find((p) => p.id === 'a')!.online).toBe(false);
    const asli = reduceHost(s, { jenis: 'gabung', id: 'a', nama: 'Ani', token: 'rahasia-ani' }, ctx());
    expect(asli.tolak).toBeUndefined();
    expect(asli.state.pemain.find((p) => p.id === 'a')!.online).toBe(true);
    for (const id of ['h', 'a']) expect(JSON.stringify(viewUntuk(asli.state, id))).not.toContain('rahasia-ani');
  });
});

describe('validasi pesan jaringan', () => {
  it('hanya menerima aksi pemain biasa dengan field yang benar', () => {
    expect(rapikanAksiPemain({ jenis: 'siap', dari: 'h' })).toEqual({ jenis: 'siap' });
    expect(rapikanAksiPemain({ jenis: 'vote', target: 'p1' })).toEqual({ jenis: 'vote', target: 'p1' });
    expect(rapikanAksiPemain({ jenis: 'vote', target: 5 })).toBeNull();
    expect(rapikanAksiPemain({ jenis: 'tebak', teks: { x: 1 } })).toBeNull();
    expect(rapikanAksiPemain({ jenis: 'gabung', id: 'a', nama: 'A' })).toBeNull();
    expect(rapikanAksiPemain({ jenis: 'putus', id: 'p1' })).toBeNull();
    expect(rapikanAksiPemain({ jenis: 'mulai', pasangan: PASANGAN })).toBeNull();
    expect(rapikanAksiPemain(null)).toBeNull();
  });
});
