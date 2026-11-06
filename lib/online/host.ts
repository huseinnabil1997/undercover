// Reducer murni untuk host mode online. Host memegang state lengkap (termasuk semua kata dan peran),
// lalu mengirim view yang sudah difilter ke setiap pemain (lihat viewUntuk).
import {
  bagiPeran, cekPemenang, loversMenangTambahan, tebakanBenar, urutanBicara, validasiSetup, type Rng,
} from '../game';
import { DETIK_LANJUT_HASIL, DETIK_SIAP_KATA, detikTebakan, rapikanBatasWaktu, TAMBAHAN_PULIH_MS, TEKS_WAKTU_HABIS } from '../batasWaktu';
import { cekPetunjuk, MAKS_PETUNJUK, teksDipakai } from '../petunjuk';
import type { Pemain } from '../types';
import {
  BATAS_OFFLINE_MS, SUARA_LEWATI, VERSI_PROTOKOL,
  type Aksi, type AksiPemain, type GameOnline, type GameView, type HasilVote, type PemainOnline, type Pengaturan, type StateHost, type TenggatHost, type ViewPemain,
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
  return g.peserta.map((id) => {
    let pasanganLovers: number | undefined;
    if (g.lovers) {
      const [a, b] = g.lovers;
      if (id === a) pasanganLovers = g.peserta.indexOf(b);
      else if (id === b) pasanganLovers = g.peserta.indexOf(a);
      if (pasanganLovers != null && pasanganLovers < 0) pasanganLovers = undefined;
    }
    return {
      nama: namaDari(state, id),
      peran: g.peran[id],
      hidup: g.hidup[id],
      ...(pasanganLovers != null ? { pasanganLovers } : {}),
    };
  });
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

/**
 * Pemain yang ikut saat Mulai. UI mengirim id aktif presence-first; tanpa itu fallback p.online host.
 * Pemain di room yang tidak ikut otomatis penonton (tidak masuk `game.peserta`).
 */
export function pilihPesertaMulai(
  state: StateHost,
  ids?: readonly string[] | null,
): { peserta: PemainOnline[]; galat?: string } {
  if (ids && ids.length > 0) {
    const unik = [...new Set(ids)];
    const byId = new Map(state.pemain.map((p) => [p.id, p]));
    const peserta: PemainOnline[] = [];
    for (const id of unik) {
      const p = byId.get(id);
      if (!p) return { peserta: [], galat: 'Daftar pemain tidak valid.' };
      peserta.push(p);
    }
    return { peserta };
  }
  return { peserta: state.pemain.filter((p) => p.online) };
}

export function reduceHost(state: StateHost, aksi: Aksi, ctx: Konteks): HasilReduce {
  const hasil = langkah(state, aksi, ctx);
  if (hasil.state !== state && !hasil.diam) hasil.state = { ...aturTenggat(hasil.state, ctx.now), seq: state.seq + 1 };
  return hasil;
}

/* ------------------------------- Batas waktu ------------------------------- */

/** Penanda langkah yang diberi batas waktu, atau null jika langkah ini tidak dibatasi. */
export function kunciLangkah(g: GameOnline): string | null {
  if (g.fase === 'kata') return `kata|${g.ronde}`;
  if (g.fase === 'diskusi' && g.giliran < g.urutan.length) return `diskusi|${g.ronde}|${g.giliran}`;
  if (g.fase === 'vote') return `vote|${g.ronde}|${g.putaranVote}`;
  if (g.fase === 'terungkap' && g.tebakan === 'menunggu') return `tebak|${g.ronde}`;
  // Setelah tebakan selesai / tanpa tebakan: auto-lanjut ke ronde berikutnya atau layar akhir.
  if (g.fase === 'terungkap') return `hasil|${g.ronde}`;
  return null;
}

function detikLangkah(state: StateHost, g: GameOnline): number {
  const b = rapikanBatasWaktu(state.pengaturan.batasWaktu);
  if (g.fase === 'kata') return DETIK_SIAP_KATA;
  if (g.fase === 'diskusi') return b.petunjuk;
  if (g.fase === 'vote') return b.vote;
  if (g.fase === 'terungkap' && g.tebakan === 'menunggu') return detikTebakan(b);
  if (g.fase === 'terungkap') return DETIK_LANJUT_HASIL;
  return 0;
}

/**
 * Pasang tenggat baru tepat saat langkah berganti (kata, giliran, vote, tebakan, hasil eliminasi).
 * Langkah yang sama mempertahankan tenggatnya, jadi pesan lain (vote masuk, pemain tersambung ulang) tidak mereset waktu.
 */
function aturTenggat(state: StateHost, now: number): StateHost {
  const g = state.game;
  if (!g) return state;
  const kunci = kunciLangkah(g);
  const detik = kunci ? detikLangkah(state, g) : 0;
  if (!kunci || detik <= 0) return g.tenggat ? { ...state, game: { ...g, tenggat: null } } : state;
  if (g.tenggat?.kunci === kunci) return state;
  const tenggat: TenggatHost = { kunci, sampai: now + detik * 1000, total: detik * 1000 };
  return { ...state, game: { ...g, tenggat } };
}

/**
 * Jalankan aturan waktu habis jika tenggat langkah saat ini sudah lewat. Setelahnya langkah sudah berganti
 * (kunci baru), jadi waktu habis yang sama tidak bisa terpicu dua kali.
 */
function waktuHabis(state: StateHost, now: number, rng: Rng): StateHost {
  const g = state.game;
  const t = g?.tenggat;
  if (!g || !t || now < t.sampai || kunciLangkah(g) !== t.kunci) return state;
  if (g.fase === 'kata') {
    // Belum semua Siap: mulai diskusi otomatis (sama seperti tombol Diskusi host).
    return keDiskusi(state, g.ronde, rng);
  }
  if (g.fase === 'diskusi') {
    // Giliran dilewati dengan penanda di riwayat, lalu lanjut ke pemain berikutnya (atau ke vote).
    return majuGiliran(state, { pemain: g.urutan[g.giliran], ronde: g.ronde, teks: TEKS_WAKTU_HABIS, waktu: now, habis: true });
  }
  // Sama seperti tombol Hitung: yang belum vote dianggap tidak memilih; aturan seri dan Lewati tetap.
  if (g.fase === 'vote') return tutupVoting(state);
  if (g.fase === 'terungkap' && g.tebakan === 'menunggu') {
    // Mr. White kehabisan waktu: dianggap tebakan salah (lalu tenggat hasil|ronde dipasang).
    return { ...state, game: { ...g, tebakan: 'salah', tebakanSalah: TEKS_WAKTU_HABIS } };
  }
  if (g.fase === 'terungkap') return lanjutSetelahTerungkap(state, rng);
  return state;
}

/** Lanjut dari layar hasil eliminasi / aman: ke ronde berikutnya atau layar akhir. Idempoten via kunci tenggat. */
function lanjutSetelahTerungkap(state: StateHost, rng: Rng): StateHost {
  const g = state.game;
  if (!g || g.fase !== 'terungkap' || g.tebakan === 'menunggu') return state;
  const pemenang = cekPemenang(pemainGame(state));
  if (pemenang) return selesai(state, pemenang);
  return keDiskusi(state, g.ronde + 1, rng);
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
        if (ada.uid && aksi.uid && ada.uid !== aksi.uid) return tetap('Sesi tidak cocok. Gabung ulang dengan nama lain.');
        return { state: ubahPemain(state, aksi.id, { online: true, terakhir: ctx.now }) };
      }
      if (!nama) return tetap('Nama tidak boleh kosong.');
      // Tidak ada penolakan "penuh" di join: mid-game masuk sebagai penonton; batas komposisi saat Mulai.
      if (state.pemain.some((p) => p.nama.toLowerCase() === nama.toLowerCase())) {
        return tetap('Nama itu sudah dipakai di room ini. Pakai nama lain.');
      }
      if (aksi.uid && state.pemain.some((p) => p.uid === aksi.uid)) return tetap('Akun ini sudah ada di room.');
      const baru = { id: aksi.id, nama, online: true, terakhir: ctx.now, ...(aksi.token ? { token: aksi.token } : {}), ...(aksi.uid ? { uid: aksi.uid } : {}) };
      return { state: { ...state, pemain: [...state.pemain, baru] } };
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
      const ids = new Set(basi.map((p) => p.id));
      const s = basi.length === 0 ? state : { ...state, pemain: state.pemain.map((p) => (ids.has(p.id) ? { ...p, online: false } : p)) };
      const habis = waktuHabis(s, ctx.now, rng);
      return habis === state ? tetap() : { state: habis };
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
      // UI lama yang tidak mengirim batasWaktu tidak menghapus pilihan yang sudah ada.
      const pengaturan = aksi.pengaturan.batasWaktu === undefined && state.pengaturan.batasWaktu
        ? { ...aksi.pengaturan, batasWaktu: state.pengaturan.batasWaktu }
        : aksi.pengaturan;
      return { state: { ...state, pengaturan } };
    }
    case 'mulai': {
      if (!lobbyTerbuka(state)) return tetap('Permainan sedang berjalan.');
      // Presence UI mengirim `peserta`; tanpa itu fallback p.online (bisa beda → validasi gagal diam-diam).
      const pilih = pilihPesertaMulai(state, aksi.peserta);
      if (pilih.galat) return tetap(pilih.galat);
      const peserta = pilih.peserta;
      const galat = validasiSetup(peserta.map((p) => p.nama), state.pengaturan.komposisi);
      if (galat.length > 0) return tetap(galat[0]);
      const dibagi = bagiPeran(peserta.map((p) => p.nama), state.pengaturan.komposisi, rng);
      const ids = peserta.map((p) => p.id);
      const idSet = new Set(ids);
      // Samakan flag online host dengan set yang dipakai UI; yang offline tetap di room sebagai penonton.
      const pemain = state.pemain.map((p) => (idSet.has(p.id) ? { ...p, online: true } : { ...p, online: false }));
      let lovers: GameOnline['lovers'] = null;
      const iLover = dibagi.findIndex((p) => p.pasanganLovers != null);
      if (iLover >= 0) {
        const j = dibagi[iLover].pasanganLovers as number;
        lovers = [ids[iLover], ids[j]];
      }
      const game: GameOnline = {
        ...(aksi.idMain ? { idMain: aksi.idMain } : {}),
        peserta: ids,
        peran: Object.fromEntries(peserta.map((p, i) => [p.id, dibagi[i].peran])),
        hidup: Object.fromEntries(peserta.map((p) => [p.id, true])),
        pasangan: aksi.pasangan,
        ronde: 1,
        fase: 'kata',
        siap: [],
        urutan: [],
        giliran: 0,
        petunjuk: [],
        suara: {},
        kandidat: [],
        putaranVote: 1,
        hasilVote: null,
        tereliminasi: null,
        tereliminasiIkut: null,
        tebakan: 'tidakPerlu',
        pemenang: null,
        lovers,
      };
      return { state: { ...state, pemain, game } };
    }
    case 'siap': {
      if (!g || g.fase !== 'kata' || !g.peserta.includes(dari) || g.siap.includes(dari)) return tetap();
      const siap = [...g.siap, dari];
      const baru = { ...state, game: { ...g, siap } };
      // Race aman: hanya ke diskusi jika SEMUA peserta sudah di daftar siap pada snapshot ini.
      return { state: siap.length >= g.peserta.length ? keDiskusi(baru, g.ronde, rng) : baru };
    }
    case 'batalSiap': {
      if (!g || g.fase !== 'kata' || !g.peserta.includes(dari) || !g.siap.includes(dari)) return tetap();
      return { state: { ...state, game: { ...g, siap: g.siap.filter((id) => id !== dari) } } };
    }
    case 'mulaiDiskusi': {
      if (!g || g.fase !== 'kata') return tetap();
      return { state: keDiskusi(state, g.ronde, rng) };
    }
    case 'petunjuk': {
      if (!g || g.fase !== 'diskusi') return tetap('Belum waktunya mengetik petunjuk.');
      if (g.urutan[g.giliran] !== dari) return tetap('Belum giliranmu mengetik petunjuk.');
      if (g.petunjuk.some((e) => e.pemain === dari && e.ronde === g.ronde)) return tetap('Kamu sudah mengirim petunjuk di ronde ini.');
      const cek = cekPetunjuk(aksi.teks, kataMilik(g, dari), teksDipakai(g.petunjuk));
      // Galat hanya dikirim ke pengirim (lewat `tolak`); state tidak berubah sehingga tidak ada yang disiarkan.
      if ('galat' in cek) return tetap(cek.galat);
      return { state: majuGiliran(state, { pemain: dari, ronde: g.ronde, teks: cek.teks, waktu: ctx.now }) };
    }
    case 'sudahBicara':
    case 'lewatiGiliran': {
      if (!g || g.fase !== 'diskusi' || g.giliran >= g.urutan.length) return tetap();
      if (aksi.jenis === 'sudahBicara' && g.urutan[g.giliran] !== dari) return tetap('Belum giliranmu.');
      // Sudah bicara (pemain sendiri) atau dilewati host: giliran dianggap selesai, tidak ada entri di riwayat.
      return { state: majuGiliran(state, null) };
    }
    case 'mulaiVote': {
      if (!g || g.fase !== 'diskusi') return tetap();
      return { state: keVote(state) };
    }
    case 'vote': {
      if (!g || g.fase !== 'vote') return tetap();
      if (!g.peserta.includes(dari) || !g.hidup[dari]) return tetap('Hanya pemain yang masih hidup yang bisa vote.');
      if (aksi.target === dari) return tetap('Tidak bisa memilih diri sendiri.');
      if (aksi.target !== SUARA_LEWATI && !g.kandidat.includes(aksi.target)) return tetap('Pilihan tidak valid.');
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
      const s = lanjutSetelahTerungkap(state, rng);
      return s === state ? tetap() : { state: s };
    }
    case 'keLobby': {
      if (!g) return tetap();
      return { state: { ...state, game: null } };
    }
  }
  return tetap();
}

/** Kata rahasia pemain (null untuk Mr. White). Hanya dipakai di host untuk validasi petunjuk. */
function kataMilik(g: GameOnline, id: string): string | null {
  const peran = g.peran[id];
  return peran === 'civilian' ? g.pasangan.civilian : peran === 'undercover' ? g.pasangan.undercover : null;
}

/** Catat petunjuk (jika ada), pindah ke pemain berikutnya, dan otomatis ke voting setelah giliran terakhir. */
function majuGiliran(state: StateHost, entri: GameOnline['petunjuk'][number] | null): StateHost {
  const g = state.game as GameOnline;
  const petunjuk = entri ? [...g.petunjuk, entri] : g.petunjuk;
  const baru = { ...state, game: { ...g, petunjuk, giliran: g.giliran + 1 } };
  return baru.game.giliran >= g.urutan.length ? keVote(baru) : baru;
}

function keVote(state: StateHost): StateHost {
  const g = state.game as GameOnline;
  return { ...state, game: { ...g, fase: 'vote', suara: {}, kandidat: pesertaHidup(g), putaranVote: 1, hasilVote: null } };
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
    game: { ...g, ronde, fase: 'diskusi', urutan, giliran: 0, suara: {}, kandidat: [], putaranVote: 1, hasilVote: null, tereliminasi: null, tereliminasiIkut: null, tebakan: 'tidakPerlu', tebakanSalah: undefined },
  };
}

/**
 * Hitung suara. Aturan:
 * - Lewati (abstain) tidak menambah suara siapa pun, tetapi dihitung sebagai pilihan tersendiri.
 * - Tidak ada suara untuk pemain mana pun, atau Lewati lebih banyak dari suara terbanyak: tidak ada yang tereliminasi.
 * - Putaran 1 seri (termasuk seri dengan Lewati): vote ulang hanya antara pemain yang seri; semua pemain hidup tetap memilih dan tetap boleh Lewati.
 * - Putaran 2 masih seri: tidak ada yang tereliminasi, lanjut ronde berikutnya.
 */
export function hitungSuara(g: GameOnline): HasilVote {
  const hitung: Record<string, number> = Object.fromEntries(g.kandidat.map((id) => [id, 0]));
  let lewati = 0;
  for (const [pemilih, target] of Object.entries(g.suara)) {
    if (!g.hidup[pemilih]) continue;
    if (target === SUARA_LEWATI) lewati++;
    else if (target in hitung) hitung[target]++;
  }
  const maks = Math.max(0, ...Object.values(hitung));
  if (maks === 0 || lewati > maks) return { hitung, lewati, seri: [], keputusan: 'tanpaEliminasi' };
  const atas = g.kandidat.filter((id) => hitung[id] === maks);
  if (atas.length === 1 && lewati < maks) return { hitung, lewati, seri: [], keputusan: 'eliminasi' };
  return { hitung, lewati, seri: atas, keputusan: g.putaranVote === 1 ? 'voteUlang' : 'tanpaEliminasi' };
}

/** Alasan voting tanpa eliminasi, untuk teks di layar. */
export function alasanTanpaEliminasi(h: HasilVote): 'seri' | 'lewati' | 'kosong' {
  if (h.seri.length > 0) return 'seri';
  return (h.lewati ?? 0) > 0 ? 'lewati' : 'kosong';
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
  const hidup = { ...g.hidup, [id]: false };
  let ikut: string | null = null;
  if (g.lovers) {
    const [a, b] = g.lovers;
    const partner = id === a ? b : id === b ? a : null;
    if (partner && hidup[partner]) {
      hidup[partner] = false;
      ikut = partner;
    }
  }
  const stElim: StateHost = {
    ...state,
    game: {
      ...g,
      fase: 'terungkap',
      hasilVote,
      hidup,
      tereliminasi: id,
      tereliminasiIkut: ikut,
      tebakan: g.peran[id] === 'mrwhite' ? 'menunggu' : 'tidakPerlu',
      tebakanSalah: undefined,
    },
  };
  // Jester divote: menang sendiri, game selesai (pasangan Lovers sudah ikut mati jika ada).
  if (g.peran[id] === 'jester') return selesai(stElim, 'jester');
  return stElim;
}

function selesai(state: StateHost, pemenang: NonNullable<GameOnline['pemenang']>, tebakanMrWhite?: string): StateHost {
  const g = state.game as GameOnline;
  const st: StateHost = { ...state, game: { ...g, fase: 'hasil', pemenang, tebakanMrWhite } };
  const lm = g.lovers ? loversMenangTambahan(pemainGame(st)) : false;
  return { ...st, game: { ...(st.game as GameOnline), loversMenang: lm } };
}

/* ------------------------------- Filter view ------------------------------- */

/**
 * View untuk satu pemain. Hanya berisi kata milik pemain itu sendiri. Peran pemain lain
 * baru disertakan setelah mereka tereliminasi, dan semuanya terbuka saat permainan selesai.
 */
export function viewUntuk(state: StateHost, id: string, now = Date.now()): ViewPemain {
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
      ...(terbuka ? { peran: g!.peran[p.id] } : {}),
    };
  });
  const game = g ? gameView(g, id, now) : null;
  if (game && g) {
    // idLovers diisi gameView; nama selalu diresolusi di sini agar UI mendapat username, bukan id peer.
    if (game.idLovers) {
      game.namaLovers = namaDari(state, game.idLovers);
    } else if (game.namaLovers) {
      const nama = namaDari(state, game.namaLovers);
      if (nama !== '?') game.namaLovers = nama;
    }
    if (game.hasil && g.lovers) {
      game.hasil.lovers = [namaDari(state, g.lovers[0]), namaDari(state, g.lovers[1])];
      if (g.loversMenang) game.hasil.loversMenang = true;
    }
  }
  return {
    seq: state.seq,
    kode: state.kode,
    saya: id,
    hostId: state.hostId,
    pemain,
    pengaturan: state.pengaturan,
    game,
  };
}

function gameView(g: GameOnline, id: string, now: number): GameView {
  const ikut = g.peserta.includes(id);
  const peran = ikut ? g.peran[id] : undefined;
  const kata = peran === 'civilian' ? g.pasangan.civilian : peran === 'undercover' ? g.pasangan.undercover : null;
  let idLovers: string | null | undefined;
  if (ikut && g.lovers) {
    const [a, b] = g.lovers;
    if (id === a || id === b) {
      // Hanya dikirim ke view pemain Lovers itu sendiri (bukan ke pemain lain).
      idLovers = id === a ? b : a;
    }
  }
  const v: GameView = {
    ronde: g.ronde,
    fase: g.fase,
    ikut,
    hidup: ikut ? g.hidup[id] : false,
    kata,
    kategoriKata: g.pasangan.sumber?.trim() || 'Kata pemain',
    mrWhite: peran === 'mrwhite',
    jester: peran === 'jester',
    ...(idLovers !== undefined ? { idLovers, namaLovers: idLovers } : {}),
    siap: g.siap,
    urutan: g.urutan,
    giliran: g.giliran,
    petunjuk: g.petunjuk,
    sudahVote: Object.keys(g.suara),
    pilihanSaya: g.suara[id] ?? null,
    kandidat: g.kandidat,
    putaranVote: g.putaranVote,
    hasilVote: g.hasilVote,
    tereliminasi: g.tereliminasi,
    ...(g.tereliminasiIkut ? { tereliminasiIkut: g.tereliminasiIkut } : {}),
    tebakan: g.tebakan,
    ...(g.tebakanSalah !== undefined ? { tebakanSalah: g.tebakanSalah } : {}),
    tenggat: g.tenggat ? { kunci: g.tenggat.kunci, sisaMs: Math.max(0, g.tenggat.sampai - now), totalMs: g.tenggat.total } : null,
  };
  if (g.fase === 'hasil' && g.pemenang) {
    v.hasil = {
      pemenang: g.pemenang,
      pasangan: g.pasangan,
      ...(g.tebakanMrWhite ? { tebakanMrWhite: g.tebakanMrWhite } : {}),
      ...(g.idMain ? { idMain: g.idMain } : {}),
      ...(g.loversMenang ? { loversMenang: true } : {}),
    };
  }
  return v;
}

/* ------------------------------ Simpan/pulihkan ----------------------------- */

/**
 * Pulihkan state host dari penyimpanan (mis. setelah host refresh).
 * Status online pemain dipertahankan dari snapshot + `terakhir` di-refresh (grace sebelum tick);
 * tampilan online di UI mengutamakan presence/detak Supabase (lihat lib/online/kehadiran.ts),
 * jadi host refresh tidak membuat semua pemain terlihat offline.
 */
export function pulihkanStateHost(raw: unknown, now: number): StateHost | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as StateHost;
  if (s.versi !== VERSI_PROTOKOL || typeof s.kode !== 'string' || typeof s.hostId !== 'string' || !Array.isArray(s.pemain)) return null;
  if (!s.pemain.some((p) => p.id === s.hostId)) return null;
  return {
    ...s,
    game: s.game
      ? {
        ...s.game,
        petunjuk: Array.isArray(s.game.petunjuk) ? s.game.petunjuk : [],
        // Host refresh: tenggat tetap (tidak diulang dari awal), tetapi diberi tambahan agar pemain sempat tersambung ulang.
        ...(s.game.tenggat ? { tenggat: { ...s.game.tenggat, sampai: Math.max(s.game.tenggat.sampai, now + TAMBAHAN_PULIH_MS) } } : {}),
      }
      : null,
    pemain: s.pemain.map((p) => ({
      ...p,
      online: p.id === s.hostId ? true : !!p.online,
      terakhir: now,
    })),
    seq: s.seq + 1,
  };
}

/**
 * Host pindah: pemain `idBaru` menjadi host atas state terakhir (snapshot host lama). Host lama ditandai offline,
 * atau dikeluarkan bila ia keluar dengan sengaja. Semua pemain lain offline sampai tersambung ulang.
 */
export function alihkanHost(raw: unknown, idBaru: string, lamaKeluar: boolean, now: number): StateHost | null {
  const s = pulihkanStateHost(raw, now);
  if (!s || !s.pemain.some((p) => p.id === idBaru)) return null;
  const lama = s.hostId;
  if (lama === idBaru) return s;
  let st: StateHost = { ...s, hostId: idBaru, pemain: s.pemain.map((p) => ({ ...p, online: p.id === idBaru, terakhir: now })) };
  if (lamaKeluar) st = hapusAtauOffline(st, lama);
  return { ...st, seq: st.seq + 1 };
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
    case 'batalSiap':
    case 'sudahBicara':
    case 'keluar':
      return { jenis: a.jenis };
    case 'vote':
      return typeof a.target === 'string' ? { jenis: 'vote', target: a.target } : null;
    case 'tebak':
      return typeof a.teks === 'string' ? { jenis: 'tebak', teks: a.teks.slice(0, 60) } : null;
    case 'petunjuk':
      return typeof a.teks === 'string' ? { jenis: 'petunjuk', teks: a.teks.slice(0, MAKS_PETUNJUK * 4) } : null;
    default:
      return null;
  }
}
