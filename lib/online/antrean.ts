// Aturan matchmaking (cermin murni dari privat.bentuk_match di migrasi antrean_match, untuk diuji dan didokumentasikan).
// - Ukuran tetap N (4 sampai 8): terbentuk begitu ada N pemain untuk N. Pemain yang memilih N didahulukan
//   (urut waktu masuk), sisa kursi diisi pemain Acak terlama. Bucket dengan pemain tetap terlama diproses dulu.
// - Hanya Acak: minimal 4 pemain Acak dan yang terlama sudah menunggu 20 detik: sampai 8 pemain Acak terlama.
//   Bila sudah 8 pemain Acak, langsung terbentuk.
// - Host = pemain yang paling dulu masuk antrean.

export const UKURAN_MATCH = [4, 5, 6, 7, 8] as const;
export const MIN_ACAK = 4;
export const MAKS_ACAK = 8;
export const TUNGGU_ACAK_MS = 20_000;
export const DETAK_ANTREAN_MS = 4000;
export const BASI_ANTREAN_MS = 30_000;

export interface Antre {
  id: string;
  /** null = Acak. */
  ukuran: number | null;
  masuk: number;
}

export interface MatchTerbentuk {
  ids: string[];
  host: string;
  ukuran: number;
}

const urut = (a: Antre, b: Antre) => a.masuk - b.masuk || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function ukuranValid(x: unknown): x is number | null {
  return x === null || (typeof x === 'number' && (UKURAN_MATCH as readonly number[]).includes(x));
}

function buat(dipilih: Antre[]): MatchTerbentuk {
  const s = [...dipilih].sort(urut);
  return { ids: s.map((a) => a.id), host: s[0].id, ukuran: s.length };
}

/** Bentuk semua match yang mungkin dari daftar antrean. Mengembalikan match dan sisa antrean. */
export function bentukMatch(antrean: readonly Antre[], sekarang: number): { match: MatchTerbentuk[]; sisa: Antre[] } {
  let sisa = [...antrean].sort(urut);
  const match: MatchTerbentuk[] = [];
  for (;;) {
    let jadi: Antre[] | null = null;
    const bucket = [...new Set(sisa.filter((a) => a.ukuran !== null).map((a) => a.ukuran as number))];
    for (const n of bucket) {
      const calon = [...sisa.filter((a) => a.ukuran === n), ...sisa.filter((a) => a.ukuran === null)].slice(0, n);
      if (calon.length === n) {
        jadi = calon;
        break;
      }
    }
    if (!jadi) {
      const acak = sisa.filter((a) => a.ukuran === null).slice(0, MAKS_ACAK);
      if (acak.length === MAKS_ACAK || (acak.length >= MIN_ACAK && sekarang - acak[0].masuk >= TUNGGU_ACAK_MS)) jadi = acak;
    }
    if (!jadi) return { match, sisa };
    const ids = new Set(jadi.map((a) => a.id));
    match.push(buat(jadi));
    sisa = sisa.filter((a) => !ids.has(a.id));
  }
}

/** Jumlah pemain menunggu yang bisa masuk bucket pilihan ini (tampilan antrean). */
export function jumlahMenunggu(antrean: readonly Antre[], ukuran: number | null): number {
  return antrean.filter((a) => ukuran === null || a.ukuran === ukuran || a.ukuran === null).length;
}

export function labelUkuran(ukuran: number | null): string {
  return ukuran === null ? 'Acak' : `${ukuran} pemain`;
}

/** Status antrean dari RPC masuk_antrean / detak_antrean. */
export interface StatusAntrean {
  ukuran: number | null;
  masuk: string;
  kode: string | null;
  host: boolean;
  jumlah: number | null;
  menunggu: number | null;
}

export function rapikanStatus(x: unknown): StatusAntrean | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (!ukuranValid(r.ukuran ?? null) || typeof r.masuk !== 'string') return null;
  const kode = typeof r.kode === 'string' && /^[A-HJKMNP-Z2-9]{6}$/.test(r.kode) ? r.kode : null;
  return {
    ukuran: (r.ukuran ?? null) as number | null,
    masuk: r.masuk,
    kode,
    host: r.host === true,
    jumlah: typeof r.jumlah === 'number' ? r.jumlah : null,
    menunggu: typeof r.menunggu === 'number' ? r.menunggu : null,
  };
}

/** Host match: mulai otomatis saat semua sudah gabung, atau setelah batas waktu bila minimal 4 pemain. */
export const BATAS_GABUNG_MATCH_MS = 45_000;
export function bolehMulaiOtomatis(online: number, target: number, sejakMs: number): boolean {
  if (online >= target) return true;
  return online >= MIN_ACAK && sejakMs >= BATAS_GABUNG_MATCH_MS;
}

/** Waktu tunggu mm:ss. */
export function formatTunggu(ms: number): string {
  const d = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`;
}
