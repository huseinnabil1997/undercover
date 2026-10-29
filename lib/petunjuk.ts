// Logika murni petunjuk ketik (pengganti bicara lisan saat diskusi). Dipakai mode online dan mode satu HP.

/** Panjang maksimal satu petunjuk (dalam karakter Unicode). */
export const MAKS_PETUNJUK = 30;

export interface EntriPetunjuk {
  /** Kunci pemain: id pemain (online) atau indeks pemain sebagai string (mode satu HP). */
  pemain: string;
  ronde: number;
  teks: string;
  waktu: number;
}

const KONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Rapikan input petunjuk: buang karakter kontrol, satukan spasi, trim, potong ke batas. null jika kosong. */
export function rapikanPetunjuk(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const t = x.normalize('NFKC').replace(KONTROL, ' ').replace(/\s+/g, ' ').trim();
  const potong = Array.from(t).slice(0, MAKS_PETUNJUK).join('').trim();
  return potong || null;
}

/** Bentuk pembanding: huruf kecil, tanpa aksen, tanpa spasi dan tanda baca. */
export function kunciPetunjuk(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function token(s: string): string[] {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export const GALAT_PETUNJUK = {
  kosong: 'Petunjuk tidak boleh kosong.',
  rahasia: 'Petunjuk tidak boleh sama dengan atau memuat kata rahasiamu.',
  duplikat: 'Petunjuk itu sudah dipakai di game ini. Pakai petunjuk lain.',
} as const;

/**
 * Validasi satu petunjuk. Mengembalikan teks yang sudah dirapikan, atau galat.
 * - Ditolak jika sama dengan / memuat (untuk kata minimal 3 huruf) kata rahasia pemain itu sendiri (abaikan huruf besar, spasi, tanda baca, aksen),
 *   atau memakai salah satu kata penyusun kata rahasia yang panjangnya minimal 3 huruf
 *   (mis. "joged" untuk "Tari Joged Bumbung").
 * - Ditolak jika petunjuk yang sama persis (setelah dinormalkan) sudah dipakai siapa pun di game ini.
 * Kata pemain lain sengaja tidak dicek: penolakan seperti itu justru membocorkan kata tim lain.
 */
export function cekPetunjuk(
  teks: unknown,
  kataRahasia: string | null,
  dipakai: readonly string[],
): { teks: string } | { galat: string } {
  const t = rapikanPetunjuk(teks);
  if (!t) return { galat: GALAT_PETUNJUK.kosong };
  const k = kunciPetunjuk(t);
  if (!k) return { galat: GALAT_PETUNJUK.kosong };
  if (kataRahasia) {
    const r = kunciPetunjuk(kataRahasia);
    const tokenRahasia = new Set(token(kataRahasia).filter((x) => x.length >= 3));
    if ((r && (k === r || (r.length >= 3 && k.includes(r)))) || token(t).some((x) => tokenRahasia.has(x))) return { galat: GALAT_PETUNJUK.rahasia };
  }
  if (dipakai.some((d) => kunciPetunjuk(d) === k)) return { galat: GALAT_PETUNJUK.duplikat };
  return { teks: t };
}
