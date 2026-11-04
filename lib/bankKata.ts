// Memuat bank kata (lazy per kategori) lalu memilih satu pasangan yang belum baru dipakai.
// Dipakai mode satu HP dan host mode online. Riwayat disimpan di perangkat ini saja.
import { META_KATEGORI, PEMUAT_KATEGORI } from '../data/words';
import { KATEGORI_INTERNET } from '../data/internet';
import { PASANGAN_KLASIK } from '../data/klasik';
import { catatRiwayat, ID_KLASIK, kombinasi2, pilihPasangan, pilihPasanganDaftar, satuKata, TanpaPasanganError } from './game';
import { bacaCacheKamus, kunciKamus, type EntriKamus } from './kamusPemain';
import { kategoriPemain, ID_PEMAIN, tambahanPemain, type TambahanPemain } from './kamusGabung';
import { baca, hapus, KUNCI, simpan } from './storage';
import type { PanjangKata, PasanganKata, SumberKata } from './types';

/* --------------------------------- Sumber --------------------------------- */

export const SUMBER_DEFAULT: SumberKata = 'internet';

export const PILIHAN_SUMBER: { id: SumberKata; nama: string; keterangan: string }[] = [
  { id: 'internet', nama: 'Internet', keterangan: 'Pasangan kata dari game Undercover publik di GitHub, dikurasi dan diterjemahkan ke bahasa Indonesia.' },
  { id: 'kamus', nama: 'Kamus kita', keterangan: 'Kamus buatan sendiri: kata populer Indonesia, dipasangkan acak per subkategori.' },
];

/** Semua sumber kata Internet beserta lisensinya, diambil dari data supaya selalu sinkron. */
export const DAFTAR_SUMBER_INTERNET: string[] = [...new Set(KATEGORI_INTERNET.flatMap((k) => k.sumber))].sort((a, b) =>
  a.localeCompare(b, 'id', { sensitivity: 'base' }),
);

/** Kredit sumber kata Internet (ditampilkan di UI). */
export const KREDIT_SUMBER_INTERNET = DAFTAR_SUMBER_INTERNET.join(', ');

export function rapikanSumber(x: unknown): SumberKata {
  return x === 'internet' || x === 'kamus' ? x : SUMBER_DEFAULT;
}

/** Sumber kata tersimpan. Bawaan (termasuk pengguna lama): Internet. */
export function sumberTersimpan(): SumberKata {
  // Setelan lama 'Pakai kamus pemain' tidak dipakai lagi: kamus pemain kini selalu digabung.
  if (baca<unknown>(KUNCI.pakaiKamusPemain, null) !== null) hapus(KUNCI.pakaiKamusPemain);
  return rapikanSumber(baca<unknown>(KUNCI.sumberKata, null));
}

export const SEMUA_KATEGORI_INTERNET = KATEGORI_INTERNET.map((k) => k.id);

export const SEMUA_KATEGORI = [ID_KLASIK, ...META_KATEGORI.map((k) => k.id)];

/** Semua id kategori bawaan milik satu sumber (kategori baru dari kamus pemain berawalan 'p:'). */
export function semuaKategori(sumber: SumberKata): string[] {
  return sumber === 'internet' ? SEMUA_KATEGORI_INTERNET : SEMUA_KATEGORI;
}

/** Tebak sumber dari daftar id kategori (untuk pengaturan online lama tanpa sumberKata). */
export function tebakSumber(kategori: readonly string[]): SumberKata {
  const bawaan = kategori.filter((id) => !id.startsWith(ID_PEMAIN));
  return bawaan.length > 0 && bawaan.every((id) => SEMUA_KATEGORI.includes(id)) ? 'kamus' : 'internet';
}

export const PILIHAN_KATEGORI = [{ id: ID_KLASIK, nama: 'Klasik (kurasi)' }, ...META_KATEGORI.map((k) => ({ id: k.id, nama: k.nama }))];

export const KOMBINASI_PER_KATEGORI: Record<string, number> = Object.fromEntries([
  [ID_KLASIK, PASANGAN_KLASIK.length],
  ...META_KATEGORI.map((k) => [k.id, k.subkategori.reduce((t, s) => t + kombinasi2(s.jumlahKata), 0)]),
  ...KATEGORI_INTERNET.map((k) => [k.id, k.jumlah]),
]);

export const KOMBINASI_SATU_KATA: Record<string, number> = Object.fromEntries([
  [ID_KLASIK, PASANGAN_KLASIK.filter(([a, b]) => satuKata(a) && satuKata(b)).length],
  ...META_KATEGORI.map((k) => [k.id, k.subkategori.reduce((t, s) => t + kombinasi2(s.jumlahSatuKata), 0)]),
  ...KATEGORI_INTERNET.map((k) => [k.id, k.jumlahSatuKata]),
]);

export const PILIHAN_KATEGORI_INTERNET = KATEGORI_INTERNET.map((k) => ({ id: k.id, nama: k.nama }));

export function pilihanKategori(sumber: SumberKata): { id: string; nama: string }[] {
  return sumber === 'internet' ? PILIHAN_KATEGORI_INTERNET : PILIHAN_KATEGORI;
}

export function totalKombinasi(kategori: string[], panjangKata: PanjangKata = 'bebas'): number {
  const tabel = panjangKata === 'satu' ? KOMBINASI_SATU_KATA : KOMBINASI_PER_KATEGORI;
  return kategori.reduce((t, id) => t + (tabel[id] ?? 0), 0);
}

export const PESAN_TANPA_SATU_KATA =
  'Kategori yang dipilih tidak punya pasangan satu kata, jadi ronde ini memakai kata yang boleh lebih dari satu kata.';

/** Buang id yang bukan milik sumber tersebut. */
export function rapikanKategori(k: unknown, sumber: SumberKata = 'kamus'): string[] {
  const sah = semuaKategori(sumber);
  return Array.isArray(k) ? k.filter((x): x is string => typeof x === 'string' && (sah.includes(x) || (x.startsWith(ID_PEMAIN) && x.length > ID_PEMAIN.length))) : [];
}

export function kunciKategori(sumber: SumberKata): string {
  return sumber === 'internet' ? KUNCI.kategoriInternet : KUNCI.kategori;
}

/**
 * Pilihan kategori tersimpan per sumber. Bawaan (belum pernah disimpan atau kosong): semua
 * kategori sumber itu (untuk Kamus kita termasuk Klasik).
 */
export function kategoriTersimpan(sumber: SumberKata = 'kamus'): string[] {
  const k = rapikanKategori(baca<unknown>(kunciKategori(sumber), null), sumber);
  return k.length > 0 ? k : [...semuaKategori(sumber), ...kategoriPemain(bacaCacheKamus()?.data ?? [], pilihanKategori(sumber))];
}

/* ------------------------------ Kamus pemain ------------------------------ */

export interface PilihanKategoriGabung { id: string; nama: string; dariPemain: boolean }

/** Kategori sebuah sumber ditambah kategori baru dari kamus pemain. */
export function pilihanKategoriGabung(sumber: SumberKata, data: readonly EntriKamus[]): PilihanKategoriGabung[] {
  const bawaan = pilihanKategori(sumber);
  return [...bawaan.map((k) => ({ ...k, dariPemain: false })), ...tambahanPemain(data, bawaan).baru.map((k) => ({ ...k, dariPemain: true }))];
}

const satuSaja = ([a, b]: readonly [string, string]) => satuKata(a) && satuKata(b);

/** Jumlah pasangan kategori terpilih: bawaan ditambah kamus pemain (dedupe terhadap Klasik dan sesama pemain). */
export function totalGabung(sumber: SumberKata, kategori: string[], panjangKata: PanjangKata, data: readonly EntriKamus[]): number {
  const t = tambahanPemain(data, pilihanKategori(sumber));
  const klasik = new Set(PASANGAN_KLASIK.map(([a, b]) => kunciKamus(a, b)));
  let ekstra = 0;
  for (const id of kategori) for (const p of t.perKategori.get(id) ?? []) if ((panjangKata !== 'satu' || satuSaja(p)) && !klasik.has(kunciKamus(p[0], p[1]))) ekstra++;
  return totalKombinasi(kategori, panjangKata) + ekstra;
}

/** Kamus pemain untuk menyiapkan kata: cache segar atau server; gagal berarti cache lama atau kosong (bawaan tetap jalan). */
async function muatKamusPemain(): Promise<EntriKamus[]> {
  try {
    const { kamusPublik } = await import('./supabase/kamus');
    return (await kamusPublik()).data;
  } catch {
    return bacaCacheKamus()?.data ?? [];
  }
}

/**
 * Pilih pasangan sesuai filter panjang kata. Jika mode 'satu' tidak punya kandidat sama sekali,
 * jatuh ke mode 'bebas' dan `cadangan` bernilai true agar UI bisa memberi tahu pemain.
 */
export async function siapkanPasangan(
  kategori: string[],
  panjangKata: PanjangKata,
  sumber: SumberKata = tebakSumber(kategori),
): Promise<{ pasangan: PasanganKata; cadangan: boolean }> {
  const tambahan = tambahanPemain(await muatKamusPemain(), pilihanKategori(sumber));
  if (sumber === 'internet') return siapkanPasanganInternet(kategori, panjangKata, tambahan);
  const idBank = kategori.filter((id) => id !== ID_KLASIK && PEMUAT_KATEGORI[id]);
  const dataKategori = await Promise.all(idBank.map(async (id) => (await PEMUAT_KATEGORI[id]()).default));
  const riwayat = baca<string[]>(KUNCI.riwayat, []);
  const opsi = { kategori: dataKategori, klasik: kategori.includes(ID_KLASIK) ? PASANGAN_KLASIK : [], riwayat };
  // Pasangan pemain yang sudah ada di bawaan (dua kata di subkategori yang sama, atau Klasik) dibuang.
  const sudah = new Set(PASANGAN_KLASIK.map(([a, b]) => kunciKamus(a, b)));
  const subKata = dataKategori.flatMap((k) => k.subkategori.map((s) => new Set(s.kata.map((x) => x.toLowerCase()))));
  const ekstra = kategori.flatMap((id) => (tambahan.perKategori.get(id) ?? []).map((p) => ({ p, nama: namaKategori(id, tambahan) })))
    .filter(({ p: [a, b] }) => !sudah.has(kunciKamus(a, b)) && !subKata.some((s) => s.has(a.toLowerCase()) && s.has(b.toLowerCase())));
  const pilih = (mode: PanjangKata): PasanganKata => {
    const e = ekstra.filter(({ p }) => mode !== 'satu' || satuSaja(p));
    const nBawaan = totalKombinasi(kategori.filter((id) => !id.startsWith(ID_PEMAIN)), mode);
    if (e.length > 0 && (nBawaan === 0 || Math.random() < e.length / (e.length + nBawaan))) {
      const grup = [...new Set(e.map((x) => x.nama))].map((nama) => ({ nama, pasangan: e.filter((x) => x.nama === nama).map((x) => x.p) }));
      return pilihPasanganDaftar({ daftar: grup, panjangKata: mode, riwayat, label: 'Kamus pemain' });
    }
    if (mode === 'satu' && nBawaan === 0 && ekstra.length > 0 && dataKategori.length === 0 && !kategori.includes(ID_KLASIK)) throw new TanpaPasanganError();
    return pilihPasangan({ ...opsi, panjangKata: mode });
  };
  let pasangan: PasanganKata;
  let cadangan = false;
  try {
    pasangan = pilih(panjangKata);
  } catch (e) {
    if (!(e instanceof TanpaPasanganError)) throw e;
    cadangan = true;
    pasangan = pilih('bebas');
  }
  simpan(KUNCI.riwayat, catatRiwayat(riwayat, pasangan));
  return { pasangan, cadangan };
}

function namaKategori(id: string, t: TambahanPemain): string {
  return t.baru.find((k) => k.id === id)?.nama ?? [...PILIHAN_KATEGORI, ...PILIHAN_KATEGORI_INTERNET].find((k) => k.id === id)?.nama ?? id;
}

async function siapkanPasanganInternet(
  kategori: string[],
  panjangKata: PanjangKata,
  tambahan: TambahanPemain = { perKategori: new Map(), baru: [] },
): Promise<{ pasangan: PasanganKata; cadangan: boolean }> {
  const { PASANGAN_INTERNET } = await import('../data/internet/pasangan');
  // Pasangan pemain digabung ke kategori yang sama; yang sudah ada (dibalik atau beda huruf) dibuang.
  const gabung = (asli: [string, string][], ekstra: [string, string][]) => {
    const ada = new Set(asli.map(([a, b]) => kunciKamus(a, b)));
    return [...asli, ...ekstra.filter(([a, b]) => !ada.has(kunciKamus(a, b)))];
  };
  const daftar = [
    ...KATEGORI_INTERNET.filter((k) => kategori.includes(k.id)).map((k) => ({
      nama: k.nama,
      pasangan: gabung(PASANGAN_INTERNET[k.id] ?? [], tambahan.perKategori.get(k.id) ?? []),
    })),
    ...tambahan.baru.filter((k) => kategori.includes(k.id)).map((k) => ({ nama: k.nama, pasangan: tambahan.perKategori.get(k.id) ?? [] })),
  ];
  const riwayat = baca<string[]>(KUNCI.riwayat, []);
  const opsi = { daftar, riwayat, label: 'Internet' };
  let pasangan: PasanganKata;
  let cadangan = false;
  try {
    pasangan = pilihPasanganDaftar({ ...opsi, panjangKata });
  } catch (e) {
    if (!(e instanceof TanpaPasanganError)) throw e;
    cadangan = true;
    pasangan = pilihPasanganDaftar({ ...opsi, panjangKata: 'bebas' });
  }
  simpan(KUNCI.riwayat, catatRiwayat(riwayat, pasangan));
  return { pasangan, cadangan };
}

