// Reducer murni untuk host mode online. Host memegang state lengkap (termasuk semua kata dan peran),
// lalu mengirim view yang sudah difilter ke setiap pemain (lihat viewUntuk).
import {
  bagiPeran, cekPemenang, MAX_PEMAIN, tambahSkor, tebakanBenar, urutanBicara, validasiSetup, type Rng,
} from '../game';
import type { Pemain } from '../types';
import {
  BATAS_OFFLINE_MS, VERSI_PROTOKOL,
  type Aksi, type AksiPemain, type GameOnline, type GameView, type HasilVote, type Pengaturan, type StateHost, type ViewPemain,
} from './types';

export interface Konteks {
  now: number;
  rng?: Rng;
}

export interface HasilReduce {
  state: StateHost;
  /** Pesan penolakan untuk pengirim aksi (mis. nama sudah dipakai). */
  tolak?: string;
  /** Perubahan internal saja (mis. waktu terakhir terlihat), tidak perlu dikirim ulang ke pemain. */
  diam?: boolean;
}

const AKSI_HOST = new Set([
  'aturPengaturan', 'mulai', 'mulaiDiskusi', 'lewatiGiliran', 'mulaiVote', 'tutupVote', 'lewatiTebakan', 'lanjut', 'keLobby', 'keluarkan',
]);

export const MAKS_NAMA = 20;

export function buatStateHost(kode: string, hostId: string, namaHost: string, pengaturan: Pengaturan, now: number): StateHost {
  return {
    versi: VERSI_PROTOKOL,
    kode,
    hostId,
    pemain: [{ id: hostId, nama: rapikanNama(namaHost) || 'Host', online: true, terakhir: now }],
    pengaturan,
    game: null,
    skor: {},
    seq: 1,
  };
}

export function rapikanNama(nama: string): string {
  return nama.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, MAKS_NAMA);
}

/** Pemain (format logika game) sesuai urutan peserta. */
export function pemainGame(state: StateHost): Pemain[] {
  const g = state.game;
  if (!g) return [];
  return g.peserta.map((id) => ({ nama: namaDari(state, id), peran: g.peran[id], hidup: g.hidup[id] }));
}

function namaDari(state: StateHost, id: string): string {
  return state.pemain.find((p) => p.id === id)?.nama ?? '?';
}

/** Peserta yang masih hidup. */
export function pesertaHidup(g: GameOnline): string[] {
  return g.peserta.filter((id) => g.hidup[id]);
}

export function lobbyTerbuka(state: StateHost): boolean {
  return !state.game || state.game.fase === 'hasil';
}

export function reduceHost(state: StateHost, aksi: Aksi, ctx: Konteks): HasilReduce {
  const hasil = langkah(state, aksi, ctx);
  if (hasil.state !== state && !hasil.diam) hasil.state = { ...hasil.state, seq: state.seq + 1 };
  return hasil;
}

function langkah(state: StateHost, aksi: Aksi, ctx: Konteks): HasilReduce {
  const rng = ctx.rng ?? Math.random;
  const tetap = (tolak?: string): HasilReduce => ({ state, tolak });

  switch (aksi.jenis) {
    case 'gabung': {
      const nama = rapikanNama(aksi.nama);
      const ada = state.pemain.find((p) => p.id === aksi.id);
      if (ada) {
        // Cegah orang lain menyamar memakai id pemain (id terlihat di daftar pemain).
        if (ada.token && ada.token !== aksi.token) return tetap('Sesi tidak cocok. Gabung ulang dengan nama lain.');
        return { state: ubahPemain(state, aksi.id, { online: true, terakhir: ctx.now }) };
      }
      if (!nama) return tetap('Nama tidak boleh kosong.');
      if (state.pemain.length >= MAX_PEMAIN) return tetap(`Room penuh (maksimal ${MAX_PEMAIN} pemain).`);
      if (state.pemain.some((p) => p.nama.toLowerCase() === nama.toLowerCase())) {
        return tetap('Nama itu sudah dipakai di room ini. Pakai nama lain.');
      }
      return { state: { ...state, pemain: [...state.pemain, { id: aksi.id, nama, online: true, terakhir: ctx.now, ...(aksi.token ? { token: aksi.token } : {}) }] } };
    }
    case 'terlihat': {
      const p = state.pemain.find((x) => x.id === aksi.id);
      if (!p) return tetap();
      if (p.online) {
        // Perubahan waktu saja tidak perlu menaikkan seq (tidak terlihat di view).
        return { state: ubahPemain(state, aksi.id, { terakhir: ctx.now }), diam: true };
      }
      return { state: ubahPemain(state, aksi.id, { online: true, terakhir: ctx.now }) };
    }
    case 'putus': {
      const p = state.pemain.find((x) => x.id === aksi.id);
      if (!p || !p.online || p.id === state.hostId) return tetap();
      return { state: ubahPemain(state, aksi.id, { online: false }) };
    }
    case 'tick': {
      const basi = state.pemain.filter((p) => p.online && p.id !== state.hostId && ctx.now - p.terakhir > BATAS_OFFLINE_MS);
      if (basi.length === 0) return tetap();
      const ids = new Set(basi.map((p) => p.id));
      return { state: { ...state, pemain: state.pemain.map((p) => (ids.has(p.id) ? { ...p, online: false } : p)) } };
    }
  }

  // Aksi dari pemain atau host.
  const dari = aksi.dari;
  if (!state.pemain.some((p) => p.id === dari)) return tetap('Kamu belum terdaftar di room ini.');
  if (AKSI_HOST.has(aksi.jenis) && dari !== state.hostId) return tetap('Hanya host yang bisa melakukan ini.');
  const g = state.game;

  switch (aksi.jenis) {
    case 'keluar': {
      if (dari === state.hostId) return tetap();
      return { state: hapusAtauOffline(state, dari) };
    }
    case 'keluarkan': {
      if (aksi.id === state.hostId) return tetap();
      return { state: hapusAtauOffline(state, aksi.id) };
    }
    case 'aturPengaturan': {
      if (!lobbyTerbuka(state)) return tetap('Pengaturan hanya bisa diubah di lobby.');
      return { state: { ...state, pengaturan: aksi.pengaturan } };
    }
    case 'mulai': {
      if (!lobbyTerbuka(state)) return tetap('Permainan sedang berjalan.');
      const peserta = state.pemain.filter((p) => p.online);
      const galat = validasiSetup(peserta.map((p) => p.nama), state.pengaturan.komposisi);
      if (galat.length > 0) return tetap(galat[0]);
      const dibagi = bagiPeran(peserta.map((p) => p.nama), state.pengaturan.komposisi, rng);
      const game: GameOnline = {
        peserta: peserta.map((p) => p.id),
        peran: Object.fromEntries(peserta.map((p, i) => [p.id, dibagi[i].peran])),
        hidup: Object.fromEntries(peserta.map((p) => [p.id, true])),
        pasangan: aksi.pasangan,
        ronde: 1,
        fase: 'kata',
        siap: [],
        urutan: [],
        giliran: 0,
        suara: {},
        kandidat: [],
        putaranVote: 1,
        hasilVote: null,
        tereliminasi: null,
        tebakan: 'tidakPerlu',
        pemenang: null,
      };
      return { state: { ...state, game } };
    }
    case 'siap': {
      if (!g || g.fase !== 'kata' || !g.peserta.includes(dari) || g.siap.includes(dari)) return tetap();
      const siap = [...g.siap, dari];
      const baru = { ...state, game: { ...g, siap } };
      return { state: siap.length >= g.peserta.length ? keDiskusi(baru, g.ronde, rng) : baru };
    }
    case 'mulaiDiskusi': {
      if (!g || g.fase !== 'kata') return tetap();
      return { state: keDiskusi(state, g.ronde, rng) };
    }
    case 'selesaiBicara':
    case 'lewatiGiliran': {
      if (!g || g.fase !== 'diskusi' || g.giliran >= g.urutan.length) return tetap();
      if (aksi.jenis === 'selesaiBicara' && g.urutan[g.giliran] !== dari) return tetap();
      return { state: { ...state, game: { ...g, giliran: g.giliran + 1 } } };
    }
    case 'mulaiVote': {
      if (!g || g.fase !== 'diskusi') return tetap();
      return {
        state: { ...state, game: { ...g, fase: 'vote', suara: {}, kandidat: pesertaHidup(g), putaranVote: 1, hasilVote: null } },
      };
    }
    case 'vote': {
      if (!g || g.fase !== 'vote') return tetap();
      if (!g.peserta.includes(dari) || !g.hidup[dari]) return tetap('Hanya pemain yang masih hidup yang bisa vote.');
      if (aksi.target === dari) return tetap('Tidak bisa memilih diri sendiri.');
      if (!g.kandidat.includes(aksi.target)) return tetap('Pilihan tidak valid.');
      const suara = { ...g.suara, [dari]: aksi.target };
      const baru = { ...state, game: { ...g, suara } };
      const semua = pesertaHidup(g).every((id) => suara[id] !== undefined || bisaVoteKosong(g, id));
      return { state: semua ? tutupVoting(baru) : baru };
    }
    case 'tutupVote': {
      if (!g || g.fase !== 'vote') return tetap();
      return { state: tutupVoting(state) };
    }
    case 'tebak': {
      if (!g || g.fase !== 'terungkap' || g.tebakan !== 'menunggu' || g.tereliminasi !== dari) return tetap();
      const teks = aksi.teks.trim().slice(0, 60);
      if (!teks) return tetap();
      if (tebakanBenar(teks, g.pasangan.civilian)) return { state: selesai(state, 'mrwhite', teks) };
      return { state: { ...state, game: { ...g, tebakan: 'salah', tebakanSalah: teks } } };
    }
    case 'lewatiTebakan': {
      if (!g || g.fase !== 'terungkap' || g.tebakan !== 'menunggu') return tetap();
      return { state: { ...state, game: { ...g, tebakan: 'salah', tebakanSalah: undefined } } };
    }
    case 'lanjut': {
      if (!g || g.fase !== 'terungkap' || g.tebakan === 'menunggu') return tetap();
      const pemenang = cekPemenang(pemainGame(state));
      if (pemenang) return { state: selesai(state, pemenang) };
      return { state: keDiskusi(state, g.ronde + 1, rng) };
    }
    case 'keLobby': {
      if (!g) return tetap();
      return { state: { ...state, game: null } };
    }
  }
  return tetap();
}

/** Pemain yang satu-satunya kandidatnya adalah dirinya sendiri tidak bisa vote (kasus tepi). */
function bisaVoteKosong(g: GameOnline, id: string): boolean {
  return g.kandidat.every((k) => k === id);
}

function ubahPemain(state: StateHost, id: string, ubah: Partial<StateHost['pemain'][number]>): StateHost {
  return { ...state, pemain: state.pemain.map((p) => (p.id === id ? { ...p, ...ubah } : p)) };
}

function hapusAtauOffline(state: StateHost, id: string): StateHost {
  const g = state.game;
  const ikut = g && g.fase !== 'hasil' && g.peserta.includes(id);
  if (ikut) return ubahPemain(state, id, { online: false });
  return { ...state, pemain: state.pemain.filter((p) => p.id !== id) };
}

function keDiskusi(state: StateHost, ronde: number, rng: Rng): StateHost {
  const g = state.game as GameOnline;
  const pemain = pemainGame(state);
  const urutan = urutanBicara(pemain, rng).map((i) => g.peserta[i]);
  return {
    ...state,
    game: { ...g, ronde, fase: 'diskusi', urutan, giliran: 0, suara: {}, kandidat: [], putaranVote: 1, hasilVote: null, tereliminasi: null, tebakan: 'tidakPerlu', tebakanSalah: undefined },
  };
}

/**
 * Hitung suara. Aturan seri:
 * - Putaran 1 seri: vote ulang hanya antara pemain yang seri (semua pemain hidup tetap memilih).
 * - Putaran 2 masih seri, atau tidak ada suara sama sekali: tidak ada yang tereliminasi, lanjut ronde berikutnya.
 */
export function hitungSuara(g: GameOnline): HasilVote {
  const hitung: Record<string, number> = Object.fromEntries(g.kandidat.map((id) => [id, 0]));
  for (const [pemilih, target] of Object.entries(g.suara)) {
    if (g.hidup[pemilih] && target in hitung) hitung[target]++;
  }
  const maks = Math.max(0, ...Object.values(hitung));
  if (maks === 0) return { hitung, seri: [], keputusan: 'tanpaEliminasi' };
  const atas = g.kandidat.filter((id) => hitung[id] === maks);
  if (atas.length === 1) return { hitung, seri: [], keputusan: 'eliminasi' };
  return { hitung, seri: atas, keputusan: g.putaranVote === 1 ? 'voteUlang' : 'tanpaEliminasi' };
}

function tutupVoting(state: StateHost): StateHost {
  const g = state.game as GameOnline;
  const hasilVote = hitungSuara(g);
  if (hasilVote.keputusan === 'voteUlang') {
    return { ...state, game: { ...g, suara: {}, kandidat: hasilVote.seri, putaranVote: 2, hasilVote } };
  }
  if (hasilVote.keputusan === 'tanpaEliminasi') {
    return { ...state, game: { ...g, fase: 'terungkap', hasilVote, tereliminasi: null, tebakan: 'tidakPerlu' } };
  }
  const maks = Math.max(...Object.values(hasilVote.hitung));
  const id = g.kandidat.find((k) => hasilVote.hitung[k] === maks) as string;
  return {
    ...state,
    game: {
      ...g,
      fase: 'terungkap',
      hasilVote,
      hidup: { ...g.hidup, [id]: false },
      tereliminasi: id,
      tebakan: g.peran[id] === 'mrwhite' ? 'menunggu' : 'tidakPerlu',
      tebakanSalah: undefined,
    },
  };
}

function selesai(state: StateHost, pemenang: NonNullable<GameOnline['pemenang']>, tebakanMrWhite?: string): StateHost {
  const g = state.game as GameOnline;
  const skor = tambahSkor(state.skor, pemainGame(state), pemenang);
  return { ...state, skor, game: { ...g, fase: 'hasil', pemenang, tebakanMrWhite } };
}

/* ------------------------------- Filter view ------------------------------- */

/**
 * View untuk satu pemain. Hanya berisi kata milik pemain itu sendiri. Peran pemain lain
 * baru disertakan setelah mereka tereliminasi, dan semuanya terbuka saat permainan selesai.
 */
export function viewUntuk(state: StateHost, id: string): ViewPemain {
  const g = state.game;
  const selesaiMain = g?.fase === 'hasil';
  const pemain = state.pemain.map((p) => {
    const ikut = !!g && g.peserta.includes(p.id);
    const hidup = ikut ? g.hidup[p.id] : true;
    const terbuka = ikut && (selesaiMain || !hidup);
    return {
      id: p.id,
      nama: p.nama,
      online: p.online,
      host: p.id === state.hostId,
      ikut,
      hidup,
      ...(terbuka ? { peran: g.peran[p.id] } : {}),
    };
  });
  return {
    seq: state.seq,
    kode: state.kode,
    saya: id,
    hostId: state.hostId,
    pemain,
    pengaturan: state.pengaturan,
    skor: state.skor,
    game: g ? gameView(g, id) : null,
  };
}

function gameView(g: GameOnline, id: string): GameView {
  const ikut = g.peserta.includes(id);
  const peran = ikut ? g.peran[id] : undefined;
  const kata = peran === 'civilian' ? g.pasangan.civilian : peran === 'undercover' ? g.pasangan.undercover : null;
  const v: GameView = {
    ronde: g.ronde,
    fase: g.fase,
    ikut,
    hidup: ikut ? g.hidup[id] : false,
    kata,
    mrWhite: peran === 'mrwhite',
    siap: g.siap,
    urutan: g.urutan,
    giliran: g.giliran,
    sudahVote: Object.keys(g.suara),
    pilihanSaya: g.suara[id] ?? null,
    kandidat: g.kandidat,
    putaranVote: g.putaranVote,
    hasilVote: g.hasilVote,
    tereliminasi: g.tereliminasi,
    tebakan: g.tebakan,
    ...(g.tebakanSalah !== undefined ? { tebakanSalah: g.tebakanSalah } : {}),
  };
  if (g.fase === 'hasil' && g.pemenang) {
    v.hasil = { pemenang: g.pemenang, pasangan: g.pasangan, ...(g.tebakanMrWhite ? { tebakanMrWhite: g.tebakanMrWhite } : {}) };
  }
  return v;
}

/* ------------------------------ Simpan/pulihkan ----------------------------- */

/**
 * Pulihkan state host dari penyimpanan (mis. setelah host refresh). Semua pemain lain ditandai
 * offline sampai mereka tersambung ulang. Mengembalikan null jika data tidak valid.
 */
export function pulihkanStateHost(raw: unknown, now: number): StateHost | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as StateHost;
  if (s.versi !== VERSI_PROTOKOL || typeof s.kode !== 'string' || typeof s.hostId !== 'string' || !Array.isArray(s.pemain)) return null;
  if (!s.pemain.some((p) => p.id === s.hostId)) return null;
  return {
    ...s,
    pemain: s.pemain.map((p) => ({ ...p, online: p.id === s.hostId, terakhir: now })),
    seq: s.seq + 1,
  };
}

/* ------------------------------ Validasi pesan ------------------------------ */

/**
 * Rapikan aksi yang datang dari jaringan. Hanya aksi pemain biasa yang diterima, sehingga pemain
 * tidak bisa mengirim aksi sistem (gabung/putus) atau aksi khusus host atas nama orang lain.
 */
export function rapikanAksiPemain(x: unknown): AksiPemain | null {
  if (!x || typeof x !== 'object') return null;
  const a = x as Record<string, unknown>;
  switch (a.jenis) {
    case 'siap':
    case 'selesaiBicara':
    case 'keluar':
      return { jenis: a.jenis };
    case 'vote':
      return typeof a.target === 'string' ? { jenis: 'vote', target: a.target } : null;
    case 'tebak':
      return typeof a.teks === 'string' ? { jenis: 'tebak', teks: a.teks.slice(0, 60) } : null;
    default:
      return null;
  }
}
